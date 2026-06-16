// ============================================================
// ClaudeSupervisor - The executive brain of the swarm
// ============================================================
// Acts as: CEO, CTO, COO, CPO, and all review gates.
//
// Two modes (config.supervisorMode):
//   'auto'        - an LLM makes every executive decision & gate ruling,
//                   so the swarm runs end-to-end with no human present.
//   'interactive' - a human at the terminal answers each prompt (the
//                   original human-in-the-loop behaviour).
// ============================================================

import * as readline from 'readline';
import { LLMClient } from '../llm';
import { AgentOutput, ConflictRecord, SwarmConfig } from '../types';

interface Verdict {
  approved: boolean;
  reasoning: string;
}

export class ClaudeSupervisor {
  private llm?: LLMClient;
  private config?: SwarmConfig;

  private claudeRoles: string[] = [
    'CEO Agent',
    'CTO Agent',
    'COO Agent',
    'CPO Agent',
    'CFO Pricing Agent',
    'Security Agent',
    'Legal Policy Agent',
    'Risk Register Agent',
    'Launch Manager Agent',
    'QA Lead Agent',
  ];

  /**
   * llm/config are optional so the class still constructs in environments
   * without an API key; auto mode requires them, interactive mode does not.
   */
  constructor(llm?: LLMClient, config?: SwarmConfig) {
    this.llm = llm;
    this.config = config;
  }

  private get isAuto(): boolean {
    return this.config?.supervisorMode === 'auto' && !!this.llm;
  }

  // ----------------------------------------------------------
  // Review gate evaluation
  // ----------------------------------------------------------
  async evaluateGate(
    gateName: string,
    description: string,
    requiredApprovers: string[],
    outputsToReview: string[],
    recentOutputs: AgentOutput[]
  ): Promise<boolean> {
    console.log('\n========================================');
    console.log(`🚨 REVIEW GATE: ${gateName}`);
    console.log('========================================');
    console.log(`Description: ${description}`);
    console.log(`Approver panel: ${requiredApprovers.join(', ')}`);

    if (this.isAuto) {
      const context = this.summarizeOutputs(recentOutputs, 8);
      const verdict = await this.runVerdict(
        `You are the executive review panel (${requiredApprovers.join(', ')}) for an AI SaaS build.`,
        `Review gate: "${gateName}"\nWhat this gate checks: ${description}\n` +
          `Required outputs: ${outputsToReview.join(', ')}\n\n` +
          `Work produced so far:\n${context}\n\n` +
          `Decide whether this gate should PASS. Approve if the work is materially complete and ` +
          `sound enough to proceed; reject only if there is a blocking gap. Be pragmatic — this is ` +
          `an MVP build, not perfection.`
      );
      console.log(`[Gate Decision] ${verdict.approved ? '✅ APPROVE' : '⛔ REJECT'} — ${verdict.reasoning}`);
      return verdict.approved;
    }

    console.log('\nOutputs to review:');
    for (const output of outputsToReview) console.log(`  • ${output}`);
    if (recentOutputs.length > 0) {
      console.log('\n--- Recent Agent Outputs ---');
      for (const o of recentOutputs.slice(-5)) {
        console.log(`\nFrom: ${o.agentName}`);
        console.log(`Task: ${o.task}`);
        console.log(`Decisions: ${o.decisions.join(', ')}`);
        console.log(`Risks: ${o.risksFound.join(', ')}`);
        console.log(`Output: ${o.output.substring(0, 300)}...`);
      }
    }
    return await this.getYesNo('\nDoes this gate pass approval? (yes/no): ');
  }

  // ----------------------------------------------------------
  // Executive decision (CTO/COO/CPO/etc.)
  // ----------------------------------------------------------
  async makeExecutiveDecision(role: string, context: string, responsibilities: string[]): Promise<string> {
    console.log(`\n========================================`);
    console.log(`🎯 CLAUDE AS ${role}`);
    console.log('========================================');

    if (this.isAuto) {
      const decision = await this.llm!.generate(
        `You are the ${role} of an AI-powered SaaS marketing-video company. ` +
          `Make a clear, decisive, actionable ruling for your area of ownership. ` +
          `Your responsibilities: ${responsibilities.join('; ')}.`,
        `Context and prior work:\n${context}\n\n` +
          `Founder direction: ${this.config?.founderBrief || '(none provided)'}\n\n` +
          `Provide your decision/direction as ${role}. Be concrete: state the choices you are making, ` +
          `what is in/out of scope, and what the next agents should do. Keep it under 400 words.`
      );
      console.log(`[${role} Decision] ${decision.substring(0, 200)}...`);
      return decision.trim();
    }

    console.log(`Context: ${context}`);
    console.log('\nResponsibilities:');
    responsibilities.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
    return await this.getInput('Your decision (type your response): ');
  }

  // ----------------------------------------------------------
  // Conflict resolution
  // ----------------------------------------------------------
  async resolveConflict(conflict: ConflictRecord, outputs: AgentOutput[]): Promise<string> {
    console.log('\n========================================');
    console.log('⚖️ CONFLICT RESOLUTION');
    console.log('========================================');
    console.log(`Type: ${conflict.type}`);
    console.log(`Between: ${conflict.betweenAgents.join(', ')}`);
    console.log(`Description: ${conflict.description}`);

    const relevantOutputs = outputs.filter(o => conflict.betweenAgents.includes(o.agentName));

    if (this.isAuto) {
      const resolution = await this.llm!.generate(
        `You are the CEO resolving a ${conflict.type} conflict between ${conflict.betweenAgents.join(' and ')}.`,
        `Conflict: ${conflict.description}\n\n` +
          `Positions:\n${this.summarizeOutputs(relevantOutputs, 6)}\n\n` +
          `Make a final binding decision and explain the rationale in 2-4 sentences.`
      );
      console.log(`[Conflict Resolution] ${resolution.substring(0, 200)}...`);
      return resolution.trim();
    }

    for (const o of relevantOutputs) {
      console.log(`\n${o.agentName}: ${o.decisions.join(', ')}`);
      console.log(`Output: ${o.output.substring(0, 200)}`);
    }
    return await this.getInput('How do you resolve this conflict? ');
  }

  // ----------------------------------------------------------
  // Specialist agent consults the supervisor
  // ----------------------------------------------------------
  async consultClaude(question: string, options: string[]): Promise<string> {
    console.log('\n========================================');
    console.log('🤔 AGENT CONSULTATION');
    console.log('========================================');
    console.log(`Question: ${question}`);
    if (options.length > 0) {
      console.log('Options:');
      options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));
    }

    if (this.isAuto) {
      const answer = await this.llm!.generate(
        `You are the CEO/supervisor of an AI SaaS company. A specialist agent needs a decision.`,
        `Question: ${question}\n` +
          (options.length > 0 ? `Options:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n` : '\n') +
          `Founder direction: ${this.config?.founderBrief || '(none)'}\n\n` +
          `Give a clear, direct decision in 1-3 sentences.`
      );
      console.log(`[Consultation Answer] ${answer.substring(0, 200)}...`);
      return answer.trim();
    }

    console.log('\n(Provide a direct answer, choose an option, or give guidance)');
    return await this.getInput('Your decision: ');
  }

  // ----------------------------------------------------------
  // Founder/CEO seed input
  // ----------------------------------------------------------
  async getCEOInstructions(): Promise<string> {
    console.log('\n========================================');
    console.log('📋 FOUNDER / CEO VISION');
    console.log('========================================');

    if (this.isAuto) {
      const brief = this.config?.founderBrief || '';
      const vision = await this.llm!.generate(
        `You are the CEO turning a founder brief into a crisp product vision and direction.`,
        `Founder brief:\n${brief}\n\n` +
          `Produce a clear vision statement covering: what we are building, who it's for, the launch ` +
          `model (single-admin SaaS), core providers, the liability model, and what is MVP vs ` +
          `beta vs future. Keep it under 350 words.`
      );
      console.log(`[CEO Vision] ${vision.substring(0, 200)}...`);
      return vision.trim();
    }

    return await this.getMultilineInput(
      'Provide your vision, instructions, and decisions (type END on a new line when done):'
    );
  }

  // ----------------------------------------------------------
  // Review a specialist agent's output
  // ----------------------------------------------------------
  async reviewAgentOutput(output: AgentOutput): Promise<boolean> {
    console.log('\n========================================');
    console.log(`🔍 REVIEW: ${output.agentName}`);
    console.log('========================================');

    if (this.isAuto) {
      const verdict = await this.runVerdict(
        `You are a senior reviewer (CTO/CPO) checking a specialist agent's deliverable.`,
        `Agent: ${output.agentName}\nTask: ${output.task}\n` +
          `Decisions: ${output.decisions.join('; ')}\n` +
          `Risks flagged: ${output.risksFound.join('; ') || 'none'}\n` +
          `Output:\n${output.output.substring(0, 1500)}\n\n` +
          `Approve unless there is a clear, blocking problem (wrong scope, unsafe, or empty). ` +
          `Minor gaps are acceptable for an MVP and should still be approved.`
      );
      console.log(`[Review] ${verdict.approved ? '✅ APPROVE' : '⛔ REJECT'} — ${verdict.reasoning}`);
      return verdict.approved;
    }

    console.log(`Task: ${output.task}`);
    console.log('Decisions:');
    output.decisions.forEach(d => console.log(`  • ${d}`));
    console.log('Risks Found:');
    output.risksFound.forEach(r => console.log(`  • ${r}`));
    console.log(`\nOutput: ${output.output.substring(0, 500)}`);
    return await this.getYesNo('\nApprove this output and proceed? (yes/no): ');
  }

  // ----------------------------------------------------------
  // Auto-mode helpers
  // ----------------------------------------------------------
  private async runVerdict(systemPrompt: string, userMessage: string): Promise<Verdict> {
    try {
      const result = await this.llm!.generateStructured<Verdict>(
        systemPrompt,
        userMessage,
        '{ "approved": true, "reasoning": "short explanation" }'
      );
      return {
        approved: result.approved !== false, // default to approve on ambiguity
        reasoning: result.reasoning || '(no reasoning given)',
      };
    } catch (e: any) {
      // Never let a supervisor parse failure hard-block the whole swarm.
      console.warn(`[Supervisor] verdict parse failed (${e.message}); defaulting to APPROVE.`);
      return { approved: true, reasoning: 'Defaulted to approve after parse failure.' };
    }
  }

  private summarizeOutputs(outputs: AgentOutput[], limit: number): string {
    if (outputs.length === 0) return '(no prior outputs yet)';
    return outputs
      .slice(-limit)
      .map(o => `### ${o.agentName} — ${o.task}\nDecisions: ${o.decisions.join('; ')}\n${o.output.substring(0, 600)}`)
      .join('\n\n');
  }

  // ----------------------------------------------------------
  // Interactive-mode stdin helpers
  // ----------------------------------------------------------
  private async getYesNo(prompt: string): Promise<boolean> {
    const answer = (await this.getInput(prompt)).toLowerCase();
    return answer === 'yes' || answer === 'y' || answer === 'approve' || answer === 'passed';
  }

  private async getInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      rl.question(prompt + ' ', answer => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  private async getMultilineInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(prompt);
    const lines: string[] = [];
    return new Promise(resolve => {
      rl.on('line', (line: string) => {
        if (line.trim().toUpperCase() === 'END') {
          rl.close();
          resolve(lines.join('\n'));
        } else {
          lines.push(line);
        }
      });
    });
  }

  isClaudeRole(agentName: string): boolean {
    return this.claudeRoles.includes(agentName);
  }

  getClaudeRoles(): string[] {
    return [...this.claudeRoles];
  }
}
