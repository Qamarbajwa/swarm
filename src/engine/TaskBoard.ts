// ============================================================
// Task Board - Manages all agent tasks with status tracking
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { AgentTask, TaskStatus, TaskPriority } from '../types';

export class TaskBoard {
  private tasks: AgentTask[] = [];

  constructor() {}

  getAll(): AgentTask[] {
    return [...this.tasks];
  }

  getByAgent(agentName: string): AgentTask[] {
    return this.tasks.filter(t => t.agentName === agentName);
  }

  getByPhase(phase: string): AgentTask[] {
    return this.tasks.filter(t => t.phase === phase);
  }

  getByStatus(status: TaskStatus): AgentTask[] {
    return this.tasks.filter(t => t.status === status);
  }

  get(id: string): AgentTask | undefined {
    return this.tasks.find(t => t.id === id);
  }

  create(task: Omit<AgentTask, 'id' | 'createdAt'>): AgentTask {
    const newTask: AgentTask = {
      ...task,
      id: uuidv4(),
      createdAt: new Date(),
    };
    this.tasks.push(newTask);
    return newTask;
  }

  updateStatus(id: string, status: TaskStatus, completedAt?: Date): void {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.status = status;
      if (completedAt) {
        task.completedAt = completedAt;
      }
    }
  }

  block(id: string, reason: string): void {
    this.updateStatus(id, 'BLOCKED');
  }

  unblock(id: string): void {
    const task = this.tasks.find(t => t.id === id);
    if (task && task.status === 'BLOCKED') {
      task.status = 'TODO';
    }
  }

  getNextReadyTasks(): AgentTask[] {
    // Tasks that are TODO and have all dependencies in DONE status
    return this.tasks.filter(t => {
      if (t.status !== 'TODO') return false;
      // Check all dependencies are done
      return t.dependencies.every(depId => {
        const dep = this.tasks.find(d => d.id === depId);
        return dep?.status === 'DONE';
      });
    });
  }

  getBlockedTasks(): AgentTask[] {
    return this.tasks.filter(t => t.status === 'BLOCKED');
  }

  getPendingReviewTasks(): AgentTask[] {
    return this.tasks.filter(t => t.status === 'REVIEW');
  }

  getCompletionPercentage(): number {
    if (this.tasks.length === 0) return 0;
    const done = this.tasks.filter(t => t.status === 'DONE').length;
    return Math.round((done / this.tasks.length) * 100);
  }

  summary(): { total: number; todo: number; inProgress: number; blocked: number; review: number; done: number } {
    return {
      total: this.tasks.length,
      todo: this.tasks.filter(t => t.status === 'TODO').length,
      inProgress: this.tasks.filter(t => t.status === 'IN_PROGRESS').length,
      blocked: this.tasks.filter(t => t.status === 'BLOCKED').length,
      review: this.tasks.filter(t => t.status === 'REVIEW').length,
      done: this.tasks.filter(t => t.status === 'DONE').length,
    };
  }

  load(tasks: AgentTask[]): void {
    this.tasks = tasks;
  }
}