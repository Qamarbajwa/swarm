// ============================================================
// Source of Truth - Accumulates all decisions and documents
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { SourceOfTruthDocument, AgentOutput } from '../types';

export class SourceOfTruth {
  private documents: SourceOfTruthDocument[] = [];

  constructor() {}

  getAll(): SourceOfTruthDocument[] {
    return [...this.documents];
  }

  get(id: string): SourceOfTruthDocument | undefined {
    return this.documents.find(d => d.id === id);
  }

  getByTag(tag: string): SourceOfTruthDocument[] {
    return this.documents.filter(d => d.tags.includes(tag));
  }

  getByCreator(agentName: string): SourceOfTruthDocument[] {
    return this.documents.filter(d => d.createdBy === agentName);
  }

  add(
    title: string,
    content: string,
    createdBy: string,
    tags: string[] = []
  ): SourceOfTruthDocument {
    const doc: SourceOfTruthDocument = {
      id: uuidv4(),
      title,
      content,
      createdBy,
      approvedBy: [],
      version: 1,
      tags,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.documents.push(doc);
    console.log(`[SourceOfTruth] Added: "${title}" by ${createdBy}`);
    return doc;
  }

  updateVersion(id: string, newContent: string, updatedBy: string): SourceOfTruthDocument | undefined {
    const doc = this.documents.find(d => d.id === id);
    if (doc) {
      doc.content = newContent;
      doc.version += 1;
      doc.updatedAt = new Date();
      console.log(`[SourceOfTruth] Updated: "${doc.title}" v${doc.version} by ${updatedBy}`);
    }
    return doc;
  }

  approve(id: string, approverName: string): void {
    const doc = this.documents.find(d => d.id === id);
    if (doc && !doc.approvedBy.includes(approverName)) {
      doc.approvedBy.push(approverName);
    }
  }

  recordOutputAsDocument(output: AgentOutput): SourceOfTruthDocument {
    return this.add(
      `${output.agentName}: ${output.task}`,
      JSON.stringify(output, null, 2),
      output.agentName,
      ['agent-output', output.agentName.toLowerCase().replace(/\s+/g, '-')]
    );
  }

  getDecisionHistory(): SourceOfTruthDocument[] {
    return this.documents.filter(d => d.tags.includes('agent-output'));
  }

  search(query: string): SourceOfTruthDocument[] {
    const lowerQuery = query.toLowerCase();
    return this.documents.filter(d => 
      d.title.toLowerCase().includes(lowerQuery) ||
      d.content.toLowerCase().includes(lowerQuery) ||
      d.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  load(documents: SourceOfTruthDocument[]): void {
    this.documents = documents;
  }
}