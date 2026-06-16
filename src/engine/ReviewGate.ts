// ============================================================
// Review Gate - Blocks phase progression until approvers validate
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { ReviewGate, AgentOutput, AgentDefinition } from '../types';

export class ReviewGateManager {
  private gates: ReviewGate[] = [];

  constructor() {}

  getAll(): ReviewGate[] {
    return [...this.gates];
  }

  get(id: string): ReviewGate | undefined {
    return this.gates.find(g => g.id === id);
  }

  getPending(): ReviewGate[] {
    return this.gates.filter(g => g.status === 'PENDING');
  }

  create(gate: Omit<ReviewGate, 'id' | 'status'>): ReviewGate {
    const newGate: ReviewGate = {
      ...gate,
      id: uuidv4(),
      status: 'PENDING',
    };
    this.gates.push(newGate);
    return newGate;
  }

  async evaluate(gateId: string, outputs: AgentOutput[], agents: Map<string, AgentDefinition>): Promise<boolean> {
    const gate = this.gates.find(g => g.id === gateId);
    if (!gate) {
      console.error(`[ReviewGate] Gate not found: ${gateId}`);
      return false;
    }

    gate.status = 'IN_REVIEW';
    console.log(`\n[ReviewGate] Evaluating: ${gate.name}`);
    console.log(`  Required approvers: ${gate.requiredApprovers.join(', ')}`);

    // Check if all required approvers have produced outputs
    const allApproversPresent = gate.requiredApprovers.every(approverName => {
      const hasOutput = outputs.some(o => o.agentName === approverName);
      if (!hasOutput) {
        console.log(`  [MISSING] ${approverName} has not produced output yet`);
      }
      return hasOutput;
    });

    if (!allApproversPresent) {
      console.log(`  [BLOCKED] Not all approvers have provided outputs`);
      gate.status = 'PENDING';
      return false;
    }

    // Check that required outputs are present
    const allOutputsPresent = gate.outputsToReview.every(outputDesc => {
      const found = outputs.some(o => {
        const combined = `${o.agentName}: ${o.task}`;
        return combined.toLowerCase().includes(outputDesc.toLowerCase());
      });
      if (!found) {
        console.log(`  [MISSING OUTPUT] ${outputDesc}`);
      }
      return found;
    });

    if (!allOutputsPresent) {
      console.log(`  [BLOCKED] Not all required outputs are present`);
      gate.status = 'PENDING';
      return false;
    }

    // All checks passed
    gate.status = 'APPROVED';
    gate.approvedAt = new Date();
    console.log(`  [APPROVED] Gate "${gate.name}" passed all checks`);
    return true;
  }

  /**
   * Marks a gate APPROVED. Use this when the supervisor (Claude/LLM or human)
   * has made the authoritative pass/fail decision. `evaluate()` remains
   * available as an advisory readiness check but must not override the
   * supervisor's ruling.
   */
  approve(gateId: string): void {
    const gate = this.gates.find(g => g.id === gateId);
    if (gate) {
      gate.status = 'APPROVED';
      gate.approvedAt = new Date();
      gate.rejectionReason = undefined;
    }
  }

  reject(gateId: string, reason: string): void {
    const gate = this.gates.find(g => g.id === gateId);
    if (gate) {
      gate.status = 'REJECTED';
      gate.rejectionReason = reason;
    }
  }

  isGatePassed(gateId: string): boolean {
    const gate = this.gates.find(g => g.id === gateId);
    return gate?.status === 'APPROVED';
  }

  areRequiredGatesPassed(gateIds: string[]): boolean {
    return gateIds.every(id => this.isGatePassed(id));
  }

  load(gates: ReviewGate[]): void {
    this.gates = gates;
  }
}