// ============================================================
// Handoff Router - Manages agent-to-agent handoffs
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { HandoffRecord, AgentOutput, ConflictRecord, ConflictType } from '../types';

export class HandoffRouter {
  private handoffs: HandoffRecord[] = [];
  private conflicts: ConflictRecord[] = [];

  constructor() {}

  getHandoffs(): HandoffRecord[] {
    return [...this.handoffs];
  }

  getConflicts(): ConflictRecord[] {
    return [...this.conflicts];
  }

  getHandoffsFrom(agentName: string): HandoffRecord[] {
    return this.handoffs.filter(h => h.fromAgent === agentName);
  }

  getHandoffsTo(agentName: string): HandoffRecord[] {
    return this.handoffs.filter(h => h.toAgent === agentName);
  }

  async handoff(
    fromAgent: string,
    toAgent: string,
    output: AgentOutput
  ): Promise<HandoffRecord> {
    const record: HandoffRecord = {
      fromAgent,
      toAgent,
      output,
      timestamp: new Date(),
      status: 'PENDING',
    };

    this.handoffs.push(record);
    console.log(`\n[Handoff] ${fromAgent} → ${toAgent}`);
    console.log(`  Task: ${output.task}`);
    
    return record;
  }

  acceptHandoff(fromAgent: string, toAgent: string): void {
    const handoff = this.handoffs.find(
      h => h.fromAgent === fromAgent && h.toAgent === toAgent && h.status === 'PENDING'
    );
    if (handoff) {
      handoff.status = 'ACCEPTED';
    }
  }

  rejectHandoff(fromAgent: string, toAgent: string, reason: string): void {
    const handoff = this.handoffs.find(
      h => h.fromAgent === fromAgent && h.toAgent === toAgent && h.status === 'PENDING'
    );
    if (handoff) {
      handoff.status = 'REJECTED';
      handoff.rejectionReason = reason;
    }
  }

  createConflict(
    type: ConflictType,
    description: string,
    betweenAgents: string[],
    resolverAgent: string
  ): ConflictRecord {
    const conflict: ConflictRecord = {
      id: uuidv4(),
      type,
      description,
      betweenAgents,
      resolverAgent,
      status: 'OPEN',
      createdAt: new Date(),
    };
    this.conflicts.push(conflict);
    console.log(`\n[Conflict] ${type} between ${betweenAgents.join(', ')}`);
    console.log(`  Resolver: ${resolverAgent}`);
    return conflict;
  }

  resolveConflict(conflictId: string, resolution: string): void {
    const conflict = this.conflicts.find(c => c.id === conflictId);
    if (conflict) {
      conflict.status = 'RESOLVED';
      conflict.resolution = resolution;
      conflict.resolvedAt = new Date();
    }
  }

  getOpenConflicts(): ConflictRecord[] {
    return this.conflicts.filter(c => c.status === 'OPEN' || c.status === 'ESCALATED');
  }

  load(handoffs: HandoffRecord[], conflicts: ConflictRecord[]): void {
    this.handoffs = handoffs;
    this.conflicts = conflicts;
  }
}