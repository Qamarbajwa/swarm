// ============================================================
// Orchestrator - The "COO" that runs the entire swarm
// Claude (you) acts as CEO, CTO, COO, CPO + all review gates
// ============================================================

import { LLM, LLMClient } from '../llm';
import { ClaudeLLM } from '../llm/ClaudeLLM';
import { AgentRunner } from './AgentRunner';
import { TaskBoard } from './TaskBoard';
import { ReviewGateManager } from './ReviewGate';
import { HandoffRouter } from './HandoffRouter';
import { SourceOfTruth } from './SourceOfTruth';
import { ClaudeSupervisor } from './ClaudeSupervisor';
import {
  AgentDefinition,
  AgentOutput,
  SwarmConfig,
  SwarmState,
  PhaseName,
  Phase,
} from '../types';
import { getPhases } from '../phases';
import { getAgents } from '../agents';
import { getGates } from '../gates';
import * as fs from 'fs';
import * as path from 'path';

export class Orchestrator {
  private config: SwarmConfig;
  private agentLLM: LLMClient;
  private supervisorLLM: LLMClient;
  private agentRunner: AgentRunner;
  private taskBoard: TaskBoard;
  private reviewGates: ReviewGateManager;
  private handoffRouter: HandoffRouter;
  private sourceOfTruth: SourceOfTruth;
  private claude: ClaudeSupervisor;
  private agents: Map<string, AgentDefinition>;
  private phases: Phase[];
  private outputs: AgentOutput[] = [];

  constructor(config: SwarmConfig) {
    this.config = config;

    // Worker model (DeepSeek/OpenAI) runs the specialist agents.
    this.agentLLM = new LLM(config);

    // Supervisor model runs the executive roles + gates. Use Claude when an
    // Anthropic key is configured; otherwise reuse the worker model so the
    // swarm still runs on a single key.
    this.supervisorLLM =
      config.supervisorProvider === 'anthropic' && config.anthropicApiKey
        ? new ClaudeLLM(config)
        : this.agentLLM;

    this.agentRunner = new AgentRunner(this.agentLLM, config);
    this.taskBoard = new TaskBoard();
    this.reviewGates = new ReviewGateManager();
    this.handoffRouter = new HandoffRouter();
    this.sourceOfTruth = new SourceOfTruth();
    this.claude = new ClaudeSupervisor(this.supervisorLLM, config);
    this.agents = new Map();
    this.phases = [];

    this.load();
  }

  async initialize(): Promise<void> {
    const supervisorLabel = this.config.supervisorProvider === 'anthropic' && this.config.anthropicApiKey
      ? `Claude (${this.config.supervisorModel})`
      : `worker model (${this.config.modelName})`;

    console.log('\n========================================');
    console.log('  AI AGENT COMPANY SWARM v1.2');
    console.log('  🎯 Supervisor = CEO + CTO + COO +');
    console.log('      CPO + All Review Gates + Conflict Resolution');
    console.log(`  Supervisor model: ${supervisorLabel}`);
    console.log(`  Worker model:     ${this.config.modelName} (${this.config.llmProvider})`);
    console.log(`  Mode: ${this.config.supervisorMode.toUpperCase()}` +
      (this.config.supervisorMode === 'auto' ? ' (LLM runs unattended)' : ' (human-in-the-loop)'));
    console.log('========================================\n');

    // Load all agents
    const agentDefs = getAgents();
    for (const agent of agentDefs) {
      this.agents.set(agent.name, agent);
    }
    console.log(`Loaded ${this.agents.size} agents`);
    console.log(`Claude supervises: ${this.claude.getClaudeRoles().join(', ')}`);

    // Load all phases
    this.phases = getPhases();
    console.log(`Loaded ${this.phases.length} phases`);

    // Check if state was loaded (has gates/tasks from file)
    const stateWasLoaded = this.reviewGates.getAll().length > 0;

    if (!stateWasLoaded) {
      // Only create gates and tasks if no state was loaded
      const gateDefs = getGates();
      for (const gate of gateDefs) {
        this.reviewGates.create(gate);
      }
      console.log(`Created ${gateDefs.length} review gates`);

      this.sourceOfTruth.add(
        'Swarm Initialization',
        `Swarm started at ${new Date().toISOString()}\nPhase: ${this.config.currentPhase}`,
        'Orchestrator',
        ['system', 'initialization']
      );

      this.createPhaseTasks(this.config.currentPhase);
    } else {
      console.log(`Loaded state: ${this.reviewGates.getAll().length} gates, ${this.taskBoard.getAll().length} tasks`);
    }

    await this.save();
    console.log('\n[Orchestrator] Initialization complete.\n');
  }

  private createPhaseTasks(phaseName: PhaseName): void {
    const phase = this.phases.find(p => p.name === phaseName);
    if (!phase) return;

    for (const agentName of phase.agents) {
      const agent = this.agents.get(agentName);
      if (!agent) continue;

      // One task per (agent, phase) — agents can appear in multiple phases.
      const existing = this.taskBoard.getByAgent(agentName).filter(t => t.phase === phase.name);
      if (existing.length === 0) {
        this.taskBoard.create({
          agentName: agent.name,
          phase: phase.name,
          title: `${agent.title}: ${agent.purpose}`,
          description: agent.responsibilities.join('; '),
          inputRequired: agent.inputs,
          outputExpected: agent.outputs,
          dependencies: [],
          status: 'TODO',
          priority: 'HIGH',
          reviewerAgents: agent.reviewGates.length > 0 ? ['Claude (CEO/CTO)'] : [],
        });
      }
    }
  }

  async executePhase(phaseName: PhaseName): Promise<void> {
    console.log(`\n========== EXECUTING PHASE: ${phaseName} ==========\n`);
    this.config.currentPhase = phaseName;

    const phase = this.phases.find(p => p.name === phaseName);
    if (!phase) {
      console.error(`[Orchestrator] Phase not found: ${phaseName}`);
      return;
    }

    // Ensure this phase's tasks exist (phases beyond 0, or agents shared across
    // phases, are not created at init).
    this.createPhaseTasks(phaseName);

    // Check gates before this phase - SUPERVISOR DECIDES
    const gatesBefore = this.getGatesBeforePhase(phaseName);
    for (const gateId of gatesBefore) {
      const gate = this.reviewGates.getAll().find(g => g.id === gateId);
      if (!gate) continue;
      
      // Skip gates already approved on a previous run.
      if (gate.status === 'APPROVED') continue;

      const passed = await this.claude.evaluateGate(
        gate.name,
        gate.description,
        gate.requiredApprovers,
        gate.outputsToReview,
        this.outputs
      );

      if (passed) {
        this.reviewGates.approve(gateId);
        console.log(`[Orchestrator] ✅ Gate "${gate.name}" approved`);
      } else {
        this.reviewGates.reject(gateId, 'Rejected by supervisor before phase entry');
        console.log(`[Orchestrator] ⛔ Gate "${gate.name}" rejected. Phase blocked.`);
        return;
      }
    }

    // Execute agents in order
    for (const agentName of phase.agents) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        console.warn(`[Orchestrator] Agent not found: ${agentName}`);
        continue;
      }

      const task = this.taskBoard.getByAgent(agentName).find(t => t.phase === phaseName);
      if (!task) continue;

      // Check if task dependencies are met
      if (task.dependencies.length > 0) {
        const depsMet = task.dependencies.every(depId => {
          const dep = this.taskBoard.get(depId);
          return dep?.status === 'DONE';
        });
        if (!depsMet) {
          console.log(`[Orchestrator] Skipping ${agentName} - dependencies not met`);
          continue;
        }
      }

      try {
        this.taskBoard.updateStatus(task.id, 'IN_PROGRESS');

        if (this.claude.isClaudeRole(agentName)) {
          // Claude handles executive roles directly
          console.log(`\n========================================`);
          console.log(`🎯 CLAUDE AS ${agent.title}`);
          console.log(`========================================`);
          console.log(`Purpose: ${agent.purpose}`);
          console.log(`Responsibilities: ${agent.responsibilities.join(', ')}`);
          console.log('\nInputs from previous agents:');
          if (this.outputs.length > 0) {
            for (const o of this.outputs.slice(-3)) {
              console.log(`  From ${o.agentName}: ${o.decisions.join('; ')}`);
            }
          } else {
            console.log('  (No prior outputs - this is the first phase)');
          }

          // Ask Claude for their decision/output
          if (agentName === 'CEO Agent') {
            const instructions = await this.claude.getCEOInstructions();
            const output: AgentOutput = {
              agentName: agentName,
              task: 'Founder/CEO vision and direction',
              inputsUsed: ['Founder knowledge', 'Product concept'],
              assumptions: [],
              decisions: [instructions],
              output: instructions,
              risksFound: [],
              dependencies: [],
              nextAgent: agent.handoffTargets[0] || '',
              acceptanceCriteria: ['Claude has provided strategic direction'],
            };
            this.outputs.push(output);
            this.sourceOfTruth.recordOutputAsDocument(output);
          } else {
            const context = `You are acting as ${agent.title}. Purpose: ${agent.purpose}`;
            const recentOutputs = this.outputs.slice(-3).map(o => 
              `${o.agentName}: ${o.decisions.join('; ')}`
            ).join('\n');
            
            const decision = await this.claude.makeExecutiveDecision(
              agent.title,
              `Previous outputs:\n${recentOutputs}`,
              agent.responsibilities
            );
            
            const output: AgentOutput = {
              agentName: agentName,
              task: `${agent.title} decision`,
              inputsUsed: ['Claude expertise', ...this.outputs.slice(-2).map(o => o.agentName)],
              assumptions: [],
              decisions: [decision],
              output: decision,
              risksFound: [],
              dependencies: [],
              nextAgent: agent.handoffTargets[0] || '',
              acceptanceCriteria: ['Claude has provided direction'],
            };
            this.outputs.push(output);
            this.sourceOfTruth.recordOutputAsDocument(output);
          }

          this.taskBoard.updateStatus(task.id, 'DONE', new Date());
          console.log(`[Orchestrator] ✅ ${agentName} completed (Claude decision)\n`);
        } else {
          // Specialist agents run via LLM - with ability to consult Claude
          const output = await this.agentRunner.execute(
            agent,
            {
              inputsFromPreviousAgents: this.outputs,
              sourceOfTruthDocuments: this.sourceOfTruth.getDecisionHistory()
                .map(d => `${d.title}: ${d.content.substring(0, 500)}`)
                .join('\n\n'),
              userInstructions: this.config.founderBrief,
            },
            // Pass consultClaude callback so DeepSeek agents can ask Claude for decisions
            (question: string, options: string[]) => this.claude.consultClaude(question, options)
          );

          this.outputs.push(output);
          this.sourceOfTruth.recordOutputAsDocument(output);

          if (output.nextAgent) {
            await this.handoffRouter.handoff(agentName, output.nextAgent, output);
          }

          // Ask Claude to review the specialist agent's output
          const approved = await this.claude.reviewAgentOutput(output);
          if (!approved) {
            console.log(`[Orchestrator] Claude rejected ${agentName}'s output. Task blocked.`);
            this.taskBoard.updateStatus(task.id, 'BLOCKED');
            continue;
          }

          this.taskBoard.updateStatus(task.id, 'DONE', new Date());
          console.log(`[Orchestrator] ✅ ${agentName} completed\n`);
        }

      } catch (error: any) {
        console.error(`[Orchestrator] ❌ ${agentName} failed: ${error.message}`);
        this.taskBoard.updateStatus(task.id, 'BLOCKED');
      }

      await this.save();
    }

    // Check gates after this phase - CLAUDE DECIDES
    const gatesAfter = this.getGatesAfterPhase(phaseName);
    for (const gateId of gatesAfter) {
      const gate = this.reviewGates.getAll().find(g => g.id === gateId);
      if (!gate) continue;
      
      if (gate.status === 'APPROVED') continue;

      const passed = await this.claude.evaluateGate(
        gate.name,
        gate.description,
        gate.requiredApprovers,
        gate.outputsToReview,
        this.outputs
      );

      if (passed) {
        this.reviewGates.approve(gateId);
        console.log(`[Orchestrator] ✅ Gate "${gate.name}" approved`);
      } else {
        console.log(`[Orchestrator] ⛔ Gate "${gate.name}" rejected.`);
        this.reviewGates.reject(gateId, 'Rejected by supervisor during review');
      }
    }

    await this.save();
    console.log(`\n========== PHASE ${phaseName} COMPLETE ==========\n`);
  }

  async executeFullSequence(): Promise<void> {
    const orderedPhases = this.phases.sort((a, b) => a.order - b.order);
    
    for (const phase of orderedPhases) {
      await this.executePhase(phase.name);
    }

    console.log('\n========================================');
    console.log('  ALL PHASES COMPLETE');
    console.log('========================================\n');
    this.printSummary();
  }

  async runAgentOnce(agentName: string, userInstructions: string): Promise<AgentOutput> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    console.log(`\n[Orchestrator] Running single agent: ${agentName}\n`);

    if (this.claude.isClaudeRole(agentName)) {
      const decision = await this.claude.makeExecutiveDecision(
        agent.title,
        userInstructions,
        agent.responsibilities
      );
      
      const output: AgentOutput = {
        agentName: agentName,
        task: `Claude decision for ${agentName}`,
        inputsUsed: ['Claude expertise', 'User instructions'],
        assumptions: [],
        decisions: [decision],
        output: decision,
        risksFound: [],
        dependencies: [],
        nextAgent: '',
        acceptanceCriteria: ['Claude has decided'],
      };
      
      this.outputs.push(output);
      this.sourceOfTruth.recordOutputAsDocument(output);
      await this.save();
      return output;
    } else {
      const output = await this.agentRunner.execute(
        agent,
        {
          inputsFromPreviousAgents: this.outputs,
          sourceOfTruthDocuments: this.sourceOfTruth.getDecisionHistory()
            .map(d => `${d.title}: ${d.content.substring(0, 500)}`)
            .join('\n\n'),
          userInstructions: userInstructions || this.config.founderBrief,
        },
        (question: string, options: string[]) => this.claude.consultClaude(question, options)
      );

      this.outputs.push(output);
      this.sourceOfTruth.recordOutputAsDocument(output);
      await this.save();
      return output;
    }
  }

  getStatus(): {
    currentPhase: PhaseName;
    completedPhases: PhaseName[];
    taskSummary: { total: number; todo: number; inProgress: number; blocked: number; review: number; done: number };
    agentCount: number;
    outputCount: number;
    gateStatuses: { name: string; status: string }[];
    completionPercentage: number;
  } {
    const completedPhases = this.phases
      .filter(p => {
        const tasks = this.taskBoard.getByPhase(p.name);
        return tasks.length > 0 && tasks.every(t => t.status === 'DONE');
      })
      .map(p => p.name);

    return {
      currentPhase: this.config.currentPhase,
      completedPhases,
      taskSummary: this.taskBoard.summary(),
      agentCount: this.agents.size,
      outputCount: this.outputs.length,
      gateStatuses: this.reviewGates.getAll().map(g => ({ name: g.name, status: g.status })),
      completionPercentage: this.taskBoard.getCompletionPercentage(),
    };
  }

  getAgent(agentName: string): AgentDefinition | undefined {
    return this.agents.get(agentName);
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  private getGatesBeforePhase(phaseName: PhaseName): string[] {
    const gateMap: Record<string, string[]> = {
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
    return gateMap[phaseName] || [];
  }

  private getGatesAfterPhase(phaseName: PhaseName): string[] {
    const gateMap: Record<string, string[]> = {
      '0_founder_intent': ['gate_vision'],
      '2_business_product_structure': ['gate_product_req'],
      '4_system_architecture': ['gate_architecture'],
      '5_ux_interface': ['gate_ux'],
      '7_development_implementation': ['gate_impl_ready'],
      '9_launch_preparation': ['gate_launch'],
    };
    return gateMap[phaseName] || [];
  }

  private printSummary(): void {
    const status = this.getStatus();
    console.log('📊 SWARM EXECUTION SUMMARY');
    console.log('------------------------');
    console.log(`Agents: ${status.agentCount}`);
    console.log(`Outputs produced: ${status.outputCount}`);
    console.log(`Tasks: ${status.taskSummary.done}/${status.taskSummary.total} done`);
    console.log(`Completion: ${status.completionPercentage}%`);
    console.log(`Gates passed: ${status.gateStatuses.filter(g => g.status === 'APPROVED').length}/${status.gateStatuses.length}`);
  }

  private async save(): Promise<void> {
    try {
      const state: Partial<SwarmState> = {
        currentPhase: this.config.currentPhase,
        completedPhases: this.phases
          .filter(p => {
            const tasks = this.taskBoard.getByPhase(p.name);
            return tasks.length > 0 && tasks.every(t => t.status === 'DONE');
          })
          .map(p => p.name),
        tasks: this.taskBoard.getAll(),
        completedOutputs: this.outputs,
        handoffs: this.handoffRouter.getHandoffs(),
        conflicts: this.handoffRouter.getConflicts(),
        sourceOfTruth: this.sourceOfTruth.getAll(),
        gates: this.reviewGates.getAll(),
        lastUpdatedAt: new Date(),
      };

      const dir = path.dirname(this.config.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.config.stateFilePath, JSON.stringify(state, null, 2));
    } catch (error: any) {
      console.error(`[Orchestrator] Failed to save state: ${error.message}`);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.config.stateFilePath)) {
        const data = fs.readFileSync(this.config.stateFilePath, 'utf-8');
        const state = JSON.parse(data) as Partial<SwarmState>;
        
        if (state.tasks) this.taskBoard.load(state.tasks);
        if (state.completedOutputs) this.outputs = state.completedOutputs;
        if (state.handoffs && state.conflicts) this.handoffRouter.load(state.handoffs, state.conflicts);
        if (state.sourceOfTruth) this.sourceOfTruth.load(state.sourceOfTruth);
        if (state.gates) this.reviewGates.load(state.gates);
        if (state.currentPhase) this.config.currentPhase = state.currentPhase;

        console.log(`[Orchestrator] Loaded state from ${this.config.stateFilePath}`);
      }
    } catch (error: any) {
      console.log(`[Orchestrator] No existing state found, starting fresh.`);
    }
  }
}