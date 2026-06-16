// ============================================================
// Agent Runner - Executes a single agent with LLM
// ============================================================

import { LLMClient } from '../llm';
import { AgentDefinition, AgentOutput, SwarmConfig } from '../types';

export class AgentRunner {
  private llm: LLMClient;
  private config: SwarmConfig;

  constructor(llm: LLMClient, config: SwarmConfig) {
    this.llm = llm;
    this.config = config;
  }

  async execute(
    agent: AgentDefinition,
    context: {
      inputsFromPreviousAgents: AgentOutput[];
      sourceOfTruthDocuments: string;
      userInstructions: string;
    },
    consultClaude?: (question: string, options: string[]) => Promise<string>
  ): Promise<AgentOutput> {
    console.log(`\n========================================`);
    console.log(`[AgentRunner] Executing: ${agent.title} (${agent.name})`);
    console.log(`[AgentRunner] Layer: ${agent.layer}`);
    console.log(`========================================`);

    const systemPrompt = this.buildSystemPrompt(agent, consultClaude !== undefined);
    const userMessage = this.buildUserMessage(agent, context);
    const outputFormat = this.getOutputFormat(consultClaude !== undefined);

    try {
      const raw = await this.llm.generateStructured<Partial<AgentOutput>>(
        systemPrompt,
        userMessage,
        outputFormat
      );

      // Normalize: the LLM may omit array fields entirely. Apply safe defaults
      // before any field is read so a malformed response never crashes the run.
      const output: AgentOutput = {
        agentName: agent.name,
        task: raw.task || agent.name,
        inputsUsed: raw.inputsUsed ?? [],
        assumptions: raw.assumptions ?? [],
        decisions: raw.decisions ?? [],
        output: raw.output || '',
        risksFound: raw.risksFound ?? [],
        dependencies: raw.dependencies ?? [],
        nextAgent: raw.nextAgent || agent.handoffTargets[0] || '',
        acceptanceCriteria: raw.acceptanceCriteria ?? [],
      };

      // Check if agent needs to consult Claude
      if (output.risksFound.some(r => r.startsWith('CONSULT_CLAUDE:')) && consultClaude) {
        const consultRequest = output.risksFound.find(r => r.startsWith('CONSULT_CLAUDE:'))!;
        const question = consultRequest.replace('CONSULT_CLAUDE:', '').trim();
        const options = output.acceptanceCriteria.filter(c => c.startsWith('OPTION:')).map(c => c.replace('OPTION:', '').trim());
        
        console.log(`\n[AgentRunner] 🤔 ${agent.name} needs to consult Claude`);
        console.log(`  Question: ${question}`);
        
        const claudeDecision = await consultClaude(question, options.length > 0 ? options : []);
        
        // Add Claude's decision as an input
        output.inputsUsed.push(`Claude decision on "${question}": ${claudeDecision}`);
        output.decisions.push(`Per Claude: ${claudeDecision}`);
        output.output += `\n\n--- Claude Consultation Result ---\nQuestion: ${question}\nClaude's Decision: ${claudeDecision}`;
        
        // Re-run the agent with Claude's input to finalize
        return this.execute(agent, {
          ...context,
          inputsFromPreviousAgents: [
            ...context.inputsFromPreviousAgents,
            {
              agentName: 'Claude (Supervisor)',
              task: `Decision on: ${question}`,
              inputsUsed: [],
              assumptions: [],
              decisions: [claudeDecision],
              output: claudeDecision,
              risksFound: [],
              dependencies: [],
              nextAgent: agent.name,
              acceptanceCriteria: [],
            }
          ],
          userInstructions: `Claude decided: ${claudeDecision}. Incorporate this into your work.`,
        }, undefined); // Don't allow nested consultations
      }

      // Strip the control markers used for consultation before returning.
      const fullOutput: AgentOutput = {
        ...output,
        risksFound: output.risksFound.filter(r => !r.startsWith('CONSULT_CLAUDE:')),
        acceptanceCriteria: output.acceptanceCriteria.filter(c => !c.startsWith('OPTION:')),
      };

      console.log(`\n[AgentRunner] ${agent.name} completed:`);
      console.log(`  Task: ${fullOutput.task}`);
      console.log(`  Decisions: ${fullOutput.decisions.length}`);
      console.log(`  Risks: ${fullOutput.risksFound.length}`);
      console.log(`  Next: ${fullOutput.nextAgent}`);

      return fullOutput;
    } catch (error: any) {
      console.error(`[AgentRunner] ${agent.name} FAILED: ${error.message}`);
      throw error;
    }
  }

  private buildSystemPrompt(agent: AgentDefinition, canConsultClaude: boolean): string {
    let prompt = `You are ${agent.title}, an expert AI agent in the "${agent.layer}" layer of our AI Agent Company Swarm.

Your purpose: ${agent.purpose}

Your responsibilities:
${agent.responsibilities.map(r => `- ${r}`).join('\n')}

Your inputs:
${agent.inputs.map(i => `- ${i}`).join('\n')}

Your outputs:
${agent.outputs.map(o => `- ${o}`).join('\n')}

You hand off to: ${agent.handoffTargets.join(', ')}

You are part of a larger swarm. You must:
1. Only do the work assigned to your role
2. Be specific and actionable
3. Identify risks clearly
4. State your assumptions
5. Structure your output for the next agent
6. Include clear acceptance criteria`;

    if (canConsultClaude) {
      prompt += `\n\nIMPORTANT - You can consult Claude (the CEO/supervisor) when you need:
- A strategic decision that affects the product direction
- Approval for a risky trade-off
- Clarification on ambiguous requirements
- A decision between conflicting options
- Permission to deviate from standard approach

HOW TO CONSULT CLAUDE:
1. Add a risk in the format: "CONSULT_CLAUDE: Your question here"
2. Add options as acceptanceCriteria prefixes: "OPTION: Option description"
3. Claude will respond and you'll be re-invoked with the decision

Only consult Claude when absolutely necessary - not for routine decisions.`;
    }

    return prompt;
  }

  private buildUserMessage(
    agent: AgentDefinition,
    context: {
      inputsFromPreviousAgents: AgentOutput[];
      sourceOfTruthDocuments: string;
      userInstructions: string;
    }
  ): string {
    let message = `## Task for ${agent.title}\n\n`;
    message += `${agent.purpose}\n\n`;

    if (context.userInstructions) {
      message += `### User / Founder Instructions\n${context.userInstructions}\n\n`;
    }

    if (context.inputsFromPreviousAgents.length > 0) {
      message += `### Inputs from Previous Agents\n`;
      for (const input of context.inputsFromPreviousAgents) {
        message += `\n--- From ${input.agentName} ---\n`;
        message += `Task: ${input.task}\n`;
        message += `Decisions: ${input.decisions.join(', ')}\n`;
        message += `Output: ${input.output}\n`;
        message += `Risks: ${input.risksFound.join(', ')}\n`;
        message += `Next Agent: ${input.nextAgent}\n`;
      }
    }

    if (context.sourceOfTruthDocuments) {
      message += `\n### Source of Truth Documents\n${context.sourceOfTruthDocuments}\n\n`;
    }

    return message;
  }

  private getOutputFormat(canConsultClaude: boolean): string {
    let format = `{
  "agentName": "string",
  "task": "string - description of what was done",
  "inputsUsed": ["string - list of inputs used"],
  "assumptions": ["string - list of assumptions made"],
  "decisions": ["string - list of decisions taken"],
  "output": "string - main output content",
  "risksFound": ["string - list of risks identified"],
  "dependencies": ["string - what this depends on"],
  "nextAgent": "string - who should handle this next",
  "acceptanceCriteria": ["string - how to verify this work"]
}`;

    if (canConsultClaude) {
      format += `\n\nTo consult Claude, include a risk like: "CONSULT_CLAUDE: Should we use Option A or Option B?"\nAnd include options as acceptanceCriteria: "OPTION: Use Option A because it is faster"`;
    }

    return format;
  }
}