// ============================================================
// Review Gate Definitions - All 6 gates with approvers
// ============================================================

import { ReviewGate } from '../types';

export function getGates(): Omit<ReviewGate, 'id' | 'status'>[] {
  return [
    {
      name: 'Gate 1: Vision Approval',
      order: 1,
      requiredApprovers: ['CEO Agent', 'CPO Agent', 'CTO Agent'],
      description: 'Vision Brief, Core Module List, Provider Decision, Launch Model',
      outputsToReview: ['Vision Brief', 'Core Module', 'Provider Decision', 'Launch Model'],
    },
    {
      name: 'Gate 2: Product Requirements Approval',
      order: 2,
      requiredApprovers: ['CPO Agent', 'Workflow Designer Agent', 'Risk Register Agent', 'Legal Policy Agent'],
      description: 'PRD, Workflow States, Compliance Requirements, Liability Requirements',
      outputsToReview: ['PRD', 'Workflow State', 'Compliance', 'Liability'],
    },
    {
      name: 'Gate 3: Architecture Approval',
      order: 3,
      requiredApprovers: ['CTO Agent', 'System Architect Agent', 'Backend Architect Agent', 'Database Architect Agent', 'Security Agent'],
      description: 'System Architecture, Database Schema, API Plan, Security Plan, Queue Plan',
      outputsToReview: ['System Architecture', 'Database Schema', 'API Plan', 'Security Plan', 'Queue Plan'],
    },
    {
      name: 'Gate 4: UX Approval',
      order: 4,
      requiredApprovers: ['CPO Agent', 'UX Architect Agent', 'Compliance Rules Agent', 'Copywriting Microcopy Agent'],
      description: 'Screen Map, User Flows, Warning Copy, Approval Copy, Admin Dashboard',
      outputsToReview: ['Screen Map', 'User Flow', 'Warning Copy', 'Approval Copy', 'Admin Dashboard'],
    },
    {
      name: 'Gate 5: Implementation Readiness',
      order: 5,
      requiredApprovers: ['CTO Agent', 'Backend Architect Agent', 'Frontend Architect Agent', 'QA Lead Agent', 'DevOps Agent'],
      description: 'Development Backlog, Acceptance Criteria, Test Plan, Deployment Plan',
      outputsToReview: ['Development Backlog', 'Acceptance Criteria', 'Test Plan', 'Deployment Plan'],
    },
    {
      name: 'Gate 6: Launch Readiness',
      order: 6,
      requiredApprovers: ['CEO Agent', 'COO Agent', 'Launch Manager Agent', 'QA Lead Agent', 'Security Agent', 'Legal Policy Agent', 'Operations Agent'],
      description: 'Launch Checklist, Critical Bug Clearance, Support Readiness, Provider Readiness, Legal Readiness, Admin Readiness',
      outputsToReview: ['Launch Checklist', 'Bug Clearance', 'Support Readiness', 'Provider Readiness', 'Legal Readiness', 'Admin Readiness'],
    },
  ];
}