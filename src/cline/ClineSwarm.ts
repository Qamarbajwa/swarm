// ============================================================
// ClineSwarm - Cline-native swarm driver
// All decision points write structured JSON files instead of
// blocking on terminal prompts. Cline reads the files, presents
// decisions to the user conversationally, and writes responses.
// ============================================================

import { Orchestrator } from '../engine/Orchestrator';
import { getDefaultConfig } from '../config';
import { SwarmConfig, PhaseName, AgentOutput } from '../types';
import {
  DecisionRequest,
  DecisionResponse,
  ClinePhaseResult,
  ClineStatusResult,
  DecisionOutput,
} from './DecisionProtocol';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DECISION_DIR = path.join(__dirname, '../../cline-decisions');

export class ClineSwarm {
  private orchestrator: Orchestrator;
  private config: SwarmConfig;

  constructor() {
    this.config = getDefaultConfig();
    this.orchestrator = new Orchestrator(this.config);
  }

  async initialize(): Promise<void> {
    await this.orchestrator.initialize();
  }

  async getStatus(): Promise<ClineStatusResult> {
    const status = this.orchestrator.getStatus();
    return {
      currentPhase: status.currentPhase,
      completedPhases: status.completedPhases,
      completionPercentage: status.completionPercentage,
      gateStatuses: status.gateStatuses,
      taskSummary: { done: status.taskSummary.done, total: status.taskSummary.total },
      agents: status.agentCount,
      outputs: status.outputCount,
    };
  }

  async listAgents(): Promise<{ layer: string; agents: string[] }[]> {
    const allAgents = this.orchestrator.getAllAgents();
    const layers = new Map<string, string[]>();
    for (const agent of allAgents) {
      const existing = layers.get(agent.layer) || [];
      existing.push(agent.name);
      layers.set(agent.layer, existing);
    }
    const result: { layer: string; agents: string[] }[] = [];
    for (const [layer, agents] of layers) {
      result.push({ layer, agents });
    }
    return result;
  }

  async runAgent(agentName: string, instructions: string): Promise<ClinePhaseResult> {
    try {
      const output = await this.orchestrator.runAgentOnce(agentName, instructions);
      return {
        status: 'completed',
        phaseName: '',
        phaseTitle: '',
        completedAgents: [agentName],
        failedAgents: [],
        totalOutputs: 1,
      };
    } catch (error: any) {
      return {
        status: 'blocked',
        phaseName: '',
        phaseTitle: '',
        completedAgents: [],
        failedAgents: [agentName],
        totalOutputs: 0,
        error: error.message,
      };
    }
  }

  // ---------------------------------------------------------
  // PHASE EXECUTION WITH DECISION PROTOCOL
  // ---------------------------------------------------------
  // When the swarm needs human input, instead of blocking on
  // readline it returns a "needs_decision" result containing
  // a DecisionRequest. Cline reads this, presents it to the
  // user, gets the answer, and calls submitDecision().
  //
  // The decision is saved to a JSON file that this method
  // creates. The caller writes the response and re-invokes
  // the phase.
  // ---------------------------------------------------------

  async executePhase(phaseName: PhaseName, decisionResponse?: DecisionResponse): Promise<ClinePhaseResult> {
    try {
      // Store the decision response if provided (from Cline's previous invocation)
      if (decisionResponse) {
        const dir = path.join(DECISION_DIR, decisionResponse.requestId);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(dir, 'response.json'),
          JSON.stringify(decisionResponse, null, 2)
        );
      }

      // Get the phase info
      const phases = this.orchestrator['phases'] as any[];
      const phase = phases.find((p: any) => p.name === phaseName);
      if (!phase) {
        return { status: 'blocked', phaseName, phaseTitle: '', completedAgents: [], failedAgents: [], totalOutputs: 0, error: `Phase not found: ${phaseName}` };
      }

      // Check gates before this phase
      const gateResult = await this.checkPhaseGates(phaseName, 'before');
      if (gateResult) return gateResult;

      // Execute agents in order
      const completedAgents: string[] = [];
      const failedAgents: string[] = [];

      for (const agentName of phase.agents) {
        const agent = this.orchestrator.getAgent(agentName);
        if (!agent) continue;

        try {
          // Check if this is a Claude role that needs executive decision
          const claudeRoles = (this.orchestrator as any).claude.getClaudeRoles?.() as string[] || [];
          const isClaudeRole = claudeRoles.includes(agentName);
          
          if (isClaudeRole) {
            // Create a decision request for Cline
            const outputs = this.orchestrator['outputs'] as AgentOutput[];
            const decisionReq = this.createExecutiveDecisionRequest(agentName, agent.responsibilities.join(', '), outputs);
            
            // Check if decision response exists
            const response = this.readDecisionResponse(decisionReq.id);
            if (!response) {
              // Need Cline input - save request and return
              this.saveDecisionRequest(decisionReq);
              return {
                status: 'needs_decision',
                phaseName,
                phaseTitle: phase.title,
                completedAgents,
                failedAgents,
                totalOutputs: this.orchestrator['outputs']?.length || 0,
                decision: decisionReq,
              };
            }

            // Process the response
            const output: AgentOutput = {
              agentName: agentName,
              task: agent.title,
              inputsUsed: [],
              assumptions: [],
              decisions: [response.decision],
              output: response.decision,
              risksFound: [],
              dependencies: [],
              nextAgent: agent.handoffTargets[0] || '',
              acceptanceCriteria: [],
            };
            (this.orchestrator as any).outputs?.push(output);
            (this.orchestrator as any).sourceOfTruth?.recordOutputAsDocument(output);
            completedAgents.push(agentName);
          } else {
            // Specialist agent - run via DeepSeek
            const output = await (this.orchestrator as any).agentRunner?.execute(
              agent,
              {
                inputsFromPreviousAgents: this.orchestrator['outputs'] || [],
                sourceOfTruthDocuments: '',
                userInstructions: '',
              }
            );

            if (output) {
              (this.orchestrator as any).outputs?.push(output);
              (this.orchestrator as any).sourceOfTruth?.recordOutputAsDocument(output);

              // Check if the agent needs consultation
              const consultRequest = output.risksFound?.find((r: string) => r.startsWith('CONSULT_CLAUDE:'));
              if (consultRequest) {
                const question = consultRequest.replace('CONSULT_CLAUDE:', '').trim();
                const options = output.acceptanceCriteria?.filter((c: string) => c.startsWith('OPTION:')).map((c: string) => c.replace('OPTION:', '').trim()) || [];
                
                const decisionReq: DecisionRequest = {
                  id: uuidv4(),
                  type: 'consultation',
                  agentName,
                  title: `${agentName} needs your input`,
                  context: question,
                  options: options.length > 0 ? options : undefined,
                  recentOutputs: this.buildRecentOutputs(),
                  timestamp: new Date().toISOString(),
                };

                const response = this.readDecisionResponse(decisionReq.id);
                if (!response) {
                  this.saveDecisionRequest(decisionReq);
                  return {
                    status: 'needs_decision',
                    phaseName,
                    phaseTitle: phase.title,
                    completedAgents,
                    failedAgents,
                    totalOutputs: this.orchestrator['outputs']?.length || 0,
                    decision: decisionReq,
                  };
                }

                // Re-run agent with Claude's input
                output.inputsUsed.push(`Claude: ${response.decision}`);
                output.decisions.push(`Per Claude: ${response.decision}`);
              }

              completedAgents.push(agentName);
            }
          }
        } catch (error: any) {
          failedAgents.push(agentName);
        }
      }

      // Check gates after this phase
      const afterGateResult = await this.checkPhaseGates(phaseName, 'after');
      if (afterGateResult) return afterGateResult;

      await (this.orchestrator as any).save?.();

      return {
        status: 'completed',
        phaseName,
        phaseTitle: phase.title,
        completedAgents,
        failedAgents,
        totalOutputs: this.orchestrator['outputs']?.length || 0,
      };
    } catch (error: any) {
      return {
        status: 'blocked',
        phaseName,
        phaseTitle: '',
        completedAgents: [],
        failedAgents: [],
        totalOutputs: 0,
        error: error.message,
      };
    }
  }

  async executeFullSequence(): Promise<void> {
    await this.orchestrator.executeFullSequence();
  }

  async submitDecision(requestId: string, decision: string, approved?: boolean): Promise<void> {
    const response: DecisionResponse = {
      requestId,
      decision,
      approved,
      timestamp: new Date().toISOString(),
    };

    const dir = path.join(DECISION_DIR, requestId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'response.json'), JSON.stringify(response, null, 2));
  }

  // ---------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------

  private async checkPhaseGates(phaseName: PhaseName, when: 'before' | 'after'): Promise<ClinePhaseResult | null> {
    const gates = (this.orchestrator as any).reviewGates?.getAll() || [];
    const phases = this.orchestrator['phases'] as any[];
    const phase = phases.find((p: any) => p.name === phaseName);
    if (!phase) return null;

    const gateIds = when === 'before'
      ? this.getGatesBeforePhase(phaseName)
      : this.getGatesAfterPhase(phaseName);

    for (const gateId of gateIds) {
      const gate = gates.find((g: any) => g.id === gateId);
      if (!gate || gate.status === 'APPROVED') continue;

      const decisionReq: DecisionRequest = {
        id: uuidv4(),
        type: 'gate_approval',
        title: gate.name,
        context: gate.description,
        options: ['yes', 'no'],
        recentOutputs: this.buildRecentOutputs(),
        timestamp: new Date().toISOString(),
      };

      const response = this.readDecisionResponse(decisionReq.id);
      if (!response) {
        this.saveDecisionRequest(decisionReq);
        return {
          status: 'needs_decision',
          phaseName,
          phaseTitle: phase.title,
          completedAgents: [],
          failedAgents: [],
          totalOutputs: this.orchestrator['outputs']?.length || 0,
          decision: decisionReq,
        };
      }

      if (response.approved !== false) {
        (this.orchestrator as any).reviewGates?.approve(gateId);
      } else {
        (this.orchestrator as any).reviewGates?.reject(gateId, response.decision);
        return {
          status: 'blocked',
          phaseName,
          phaseTitle: phase.title,
          completedAgents: [],
          failedAgents: [],
          totalOutputs: this.orchestrator['outputs']?.length || 0,
          error: `Gate "${gate.name}" rejected: ${response.decision}`,
        };
      }
    }

    return null;
  }

  private createExecutiveDecisionRequest(agentName: string, responsibilities: string, outputs: AgentOutput[]): DecisionRequest {
    return {
      id: uuidv4(),
      type: 'executive_decision',
      agentName,
      title: `Executive Decision: ${agentName}`,
      context: `You are acting as ${agentName}.\n\nYour responsibilities:\n${responsibilities}\n\nReview the recent outputs and provide your decision.`,
      recentOutputs: this.buildRecentOutputs(),
      timestamp: new Date().toISOString(),
    };
  }

  private buildRecentOutputs(): DecisionOutput[] {
    const outputs = (this.orchestrator as any).outputs as AgentOutput[] || [];
    return outputs.slice(-5).map(o => ({
      agentName: o.agentName,
      task: o.task,
      decisions: o.decisions || [],
      risks: o.risksFound || [],
      output: o.output ? o.output.substring(0, 300) : '',
    }));
  }

  private saveDecisionRequest(request: DecisionRequest): void {
    const dir = path.join(DECISION_DIR, request.id);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dir, 'request.json'),
      JSON.stringify(request, null, 2)
    );
  }

  private readDecisionResponse(requestId: string): DecisionResponse | null {
    const filePath = path.join(DECISION_DIR, requestId, 'response.json');
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DecisionResponse;
      }
    } catch {}
    return null;
  }

  private getGatesBeforePhase(phaseName: PhaseName): string[] {
    const map: Record<string, string[]> = {
      '0_founder_intent': [],
      '1_research_market': ['gate_vision'],
      '2_business_product_structure': ['gate_product_req'],
      '3_legal_compliance': ['gate_product_req'],
      '4_system_architecture': ['gate_product_req'],
      '5_ux_interface': ['gate_architecture'],
      '6_ai_provider_implementation': ['gate_architecture'],
      '7_development_implementation': ['gate_ux', 'gate_impl_ready'],
      '8_qa_hardening': ['gate_impl_ready'],
      '9_launch_preparation': ['gate_launch'],
      '10_live_operations': ['gate_launch'],
    };
    return map[phaseName] || [];
  }

  private getGatesAfterPhase(phaseName: PhaseName): string[] {
    const map: Record<string, string[]> = {
      '0_founder_intent': ['gate_vision'],
      '2_business_product_structure': ['gate_product_req'],
      '4_system_architecture': ['gate_architecture'],
      '5_ux_interface': ['gate_ux'],
      '7_development_implementation': ['gate_impl_ready'],
      '9_launch_preparation': ['gate_launch'],
    };
    return map[phaseName] || [];
  }
}