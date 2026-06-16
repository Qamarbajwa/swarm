// ============================================================
// Cline Decision Protocol - JSON-based prompting
// ============================================================

export type DecisionType =
  | 'executive_decision'   // Claude needs to act as CEO, CTO, etc.
  | 'gate_approval'        // Review gate needs approval
  | 'agent_review'         // Specialist agent output needs review
  | 'consultation'         // DeepSeek agent needs Claude's input
  | 'conflict_resolution'  // Agent conflict needs resolution
  | 'founder_input';       // CEO/founder vision needed

export interface DecisionRequest {
  id: string;
  type: DecisionType;
  agentName?: string;
  title: string;
  context: string;
  options?: string[];
  recentOutputs: DecisionOutput[];
  timestamp: string;
}

export interface DecisionResponse {
  requestId: string;
  decision: string;
  approved?: boolean;
  notes?: string;
  timestamp: string;
}

export interface DecisionOutput {
  agentName: string;
  task: string;
  decisions: string[];
  risks: string[];
  output: string;
}

export interface ClinePhaseResult {
  status: 'completed' | 'blocked' | 'needs_decision';
  phaseName: string;
  phaseTitle: string;
  completedAgents: string[];
  failedAgents: string[];
  totalOutputs: number;
  decision?: DecisionRequest;
  error?: string;
}

export interface ClineStatusResult {
  currentPhase: string;
  completedPhases: string[];
  completionPercentage: number;
  gateStatuses: { name: string; status: string }[];
  taskSummary: { done: number; total: number };
  agents: number;
  outputs: number;
}

export function formatOutputForCli(data: any): string {
  return JSON.stringify(data, null, 2);
}