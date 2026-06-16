// ============================================================
// Core Type Definitions for AI Agent Company Swarm
// ============================================================

// ---------------------------------------------------------
// 1. Agent Output Format
// ---------------------------------------------------------
export interface AgentOutput {
  agentName: string;
  task: string;
  inputsUsed: string[];
  assumptions: string[];
  decisions: string[];
  output: string;
  risksFound: string[];
  dependencies: string[];
  nextAgent: string;
  acceptanceCriteria: string[];
}

// ---------------------------------------------------------
// 2. Agent Task Board
// ---------------------------------------------------------
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export interface AgentTask {
  id: string;
  agentName: string;
  phase: string;
  title: string;
  description: string;
  inputRequired: string[];
  outputExpected: string[];
  dependencies: string[];
  status: TaskStatus;
  priority: TaskPriority;
  reviewerAgents: string[];
  createdAt: Date;
  completedAt?: Date;
}

// ---------------------------------------------------------
// 3. Agent Definition
// ---------------------------------------------------------
export interface AgentDefinition {
  name: string;
  title: string;
  layer: LayerName;
  purpose: string;
  responsibilities: string[];
  inputs: string[];
  outputs: string[];
  systemPrompt: string;
  handoffTargets: string[];
  reviewGates: string[];
}

// ---------------------------------------------------------
// 4. Layer Names
// ---------------------------------------------------------
export type LayerName =
  | 'executive_product_leadership'
  | 'research_strategy'
  | 'product_design_requirements'
  | 'architecture_engineering'
  | 'ai_provider_automation'
  | 'compliance_legal_risk'
  | 'ux_ui_design'
  | 'data_analytics_kpi'
  | 'qa_testing_debugging'
  | 'devops_security_infrastructure'
  | 'launch_growth_customer_success'
  | 'operations_admin_continuous_improvement';

// ---------------------------------------------------------
// 5. Phase Definitions
// ---------------------------------------------------------
export type PhaseName =
  | '0_founder_intent'
  | '1_research_market'
  | '2_business_product_structure'
  | '3_legal_compliance'
  | '4_system_architecture'
  | '5_ux_interface'
  | '6_ai_provider_implementation'
  | '7_development_implementation'
  | '8_qa_hardening'
  | '9_launch_preparation'
  | '10_live_operations';

export interface Phase {
  name: PhaseName;
  title: string;
  order: number;
  agents: string[];
  description: string;
  requiredOutputs: string[];
}

// ---------------------------------------------------------
// 6. Review Gate
// ---------------------------------------------------------
export interface ReviewGate {
  id: string;
  name: string;
  order: number;
  requiredApprovers: string[];
  description: string;
  outputsToReview: string[];
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
  approvedAt?: Date;
  rejectionReason?: string;
}

// ---------------------------------------------------------
// 7. Handoff Record
// ---------------------------------------------------------
export interface HandoffRecord {
  fromAgent: string;
  toAgent: string;
  output: AgentOutput;
  timestamp: Date;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string;
}

// ---------------------------------------------------------
// 8. Source of Truth Document
// ---------------------------------------------------------
export interface SourceOfTruthDocument {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  approvedBy: string[];
  version: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------
// 9. Swarm Configuration
// ---------------------------------------------------------
export interface SwarmConfig {
  // ---- Worker model: the specialist agents (DeepSeek by default) ----
  llmProvider: 'deepseek' | 'openai' | 'custom';
  apiKey: string;
  baseURL?: string;
  modelName: string;
  temperature: number;
  maxTokens: number;

  // ---- Supervisor model: the executive roles + review gates ----
  // The CEO/CTO/COO/CPO and all gate rulings run on this model. Defaults to
  // Claude (Anthropic) when an Anthropic key is present; otherwise it reuses
  // the worker model so the swarm still runs on a single key.
  supervisorProvider: 'anthropic' | 'deepseek';
  anthropicApiKey: string;
  supervisorModel: string;
  supervisorMaxTokens: number;
  /** Enable Claude adaptive thinking for supervisor decisions (Anthropic only). */
  supervisorThinking: boolean;

  /**
   * 'auto'        - the LLM acts as the executive supervisor (CEO/CTO/...) and
   *                 review gates, so the swarm runs end-to-end unattended.
   * 'interactive' - a human at the terminal answers every executive decision
   *                 and gate (original human-in-the-loop behaviour).
   */
  supervisorMode: 'auto' | 'interactive';
  /** Founder vision used to seed the CEO phase in 'auto' mode (skips stdin). */
  founderBrief: string;
  maxRetries: number;
  currentPhase: PhaseName;
  activeGates: string[];
  stateFilePath: string;
  verbose: boolean;
}

// ---------------------------------------------------------
// 10. Conflict Record
// ---------------------------------------------------------
export type ConflictType = 'product' | 'technical' | 'business_pricing' | 'legal_compliance' | 'execution';

export interface ConflictRecord {
  id: string;
  type: ConflictType;
  description: string;
  betweenAgents: string[];
  resolverAgent: string;
  resolution?: string;
  status: 'OPEN' | 'RESOLVED' | 'ESCALATED';
  createdAt: Date;
  resolvedAt?: Date;
}

// ---------------------------------------------------------
// 11. Agent Status Snapshot
// ---------------------------------------------------------
export interface AgentStatus {
  agentName: string;
  currentTask?: AgentTask;
  completedTasks: number;
  blockedTasks: number;
  status: 'IDLE' | 'WORKING' | 'BLOCKED' | 'WAITING_REVIEW';
  lastOutput?: AgentOutput;
}

// ---------------------------------------------------------
// 12. Swarm State (persisted to disk)
// ---------------------------------------------------------
export interface SwarmState {
  currentPhase: PhaseName;
  completedPhases: PhaseName[];
  tasks: AgentTask[];
  completedOutputs: AgentOutput[];
  handoffs: HandoffRecord[];
  conflicts: ConflictRecord[];
  sourceOfTruth: SourceOfTruthDocument[];
  gates: ReviewGate[];
  agentStatuses: { [agentName: string]: AgentStatus };
  startedAt: Date;
  lastUpdatedAt: Date;
}

// ---------------------------------------------------------
// 13. Phase Execution Plan
// ---------------------------------------------------------
export interface PhaseExecutionPlan {
  phase: Phase;
  gatesBefore: string[];
  gatesAfter: string[];
  expectedDuration: string;
  criticalPath: string[];
}