// ============================================================
// Phase Definitions - All 11 phases with agent assignments
// ============================================================

import { Phase } from '../types';

export function getPhases(): Phase[] {
  return [
    {
      name: '0_founder_intent',
      title: 'Founder Intent & Vision',
      order: 0,
      agents: ['CEO Agent', 'CPO Agent', 'CTO Agent', 'COO Agent'],
      description: 'Confirm product vision, launch model, core providers, liability model, and single-admin SaaS model',
      requiredOutputs: ['Vision Brief v1', 'Core Module List', 'Launch Model Decision', 'Provider Decision'],
    },
    {
      name: '1_research_market',
      title: 'Research & Market Foundation',
      order: 1,
      agents: ['Market Research Agent', 'Content Strategy Agent', 'Platform Policy Research Agent', 'Risk Register Agent'],
      description: 'Study competitors, content/ad types, platform constraints, and identify risks',
      requiredOutputs: ['Market & Workflow Research Report', 'Risk Register v1', 'Content Type Library v1'],
    },
    {
      name: '2_business_product_structure',
      title: 'Business & Product Structure',
      order: 2,
      agents: ['PRD Agent', 'CFO Pricing Agent', 'Plans Limits Agent', 'Permissions Roles Agent', 'Workflow Designer Agent'],
      description: 'Define plans, limits, roles, permissions, campaign workflows, paid ads plugin rules',
      requiredOutputs: ['PRD v1', 'Pricing Matrix', 'Permissions Matrix', 'Workflow State Machines'],
    },
    {
      name: '3_legal_compliance',
      title: 'Legal, Compliance & Liability',
      order: 3,
      agents: ['Legal Policy Agent', 'Compliance Rules Agent', 'Privacy Data Governance Agent', 'Audit Accountability Agent'],
      description: 'Draft responsibility acknowledgements, define compliance rules, audit logs, data retention',
      requiredOutputs: ['Compliance Framework', 'Legal Copy Library', 'Audit Event Map', 'Data Governance Policy'],
    },
    {
      name: '4_system_architecture',
      title: 'System Architecture',
      order: 4,
      agents: ['System Architect Agent', 'Backend Architect Agent', 'Database Architect Agent', 'Frontend Architect Agent', 'Workflow Orchestration Agent', 'AI Provider Architect Agent', 'Security Agent', 'Observability Agent'],
      description: 'Design whole architecture, database, APIs, queues, provider adapters, security, debugging/logging',
      requiredOutputs: ['Architecture Document', 'Database Schema', 'API Spec', 'Workflow Queue Spec', 'Provider Adapter Spec', 'Security Spec'],
    },
    {
      name: '5_ux_interface',
      title: 'UX & Interface Design',
      order: 5,
      agents: ['UX Architect Agent', 'UI Design Agent', 'Copywriting Microcopy Agent'],
      description: 'Design screens, campaign builder, approvals, warnings, admin dashboard, wallet UX',
      requiredOutputs: ['UX Specification', 'Screen Map', 'UI Component List', 'Copy Library'],
    },
    {
      name: '6_ai_provider_implementation',
      title: 'AI & Provider Implementation Design',
      order: 6,
      agents: ['DeepSeek Script Agent', 'Veo Production Agent', 'Artlist Creative Agent', 'Avatar Consistency Agent', 'Prompt Engineering Agent', 'Final Renderer Agent', 'Provider Monitoring Agent'],
      description: 'Define DeepSeek prompts, Veo production brief format, avatar pack, quality scoring, wallet charge rules',
      requiredOutputs: ['AI Provider Playbook', 'Veo Production Playbook', 'Avatar Consistency Rules', 'Prompt Template Library', 'Quality Scoring Rules'],
    },
    {
      name: '7_development_implementation',
      title: 'Development Implementation',
      order: 7,
      agents: ['Backend Architect Agent', 'Frontend Architect Agent', 'Database Architect Agent', 'Workflow Orchestration Agent', 'DevOps Agent', 'Security Agent'],
      description: 'Build auth, roles, plans, wallets, provider registry, campaigns, scripts, avatars, production, approvals, publishing, admin dashboard',
      requiredOutputs: ['Working MVP'],
    },
    {
      name: '8_qa_hardening',
      title: 'QA, Debugging & Hardening',
      order: 8,
      agents: ['QA Lead Agent', 'Backend QA Agent', 'Frontend QA Agent', 'Workflow QA Agent', 'Debugging Agent', 'Security Agent'],
      description: 'Run test scenarios, check edge cases, simulate provider/wallet/compliance failures, check audit logs',
      requiredOutputs: ['QA Report', 'Bug List', 'Release Readiness Checklist'],
    },
    {
      name: '9_launch_preparation',
      title: 'Launch Preparation',
      order: 9,
      agents: ['Launch Manager Agent', 'Onboarding Agent', 'Customer Success Agent', 'Support Agent', 'DevOps Agent', 'Operations Agent'],
      description: 'Prepare onboarding, demo campaigns, support flow, pricing pages, terms, admin operations dashboard',
      requiredOutputs: ['Launch Checklist', 'Onboarding Flow', 'Support Playbook', 'Demo Data'],
    },
    {
      name: '10_live_operations',
      title: 'Live Operations',
      order: 10,
      agents: ['Operations Agent', 'Support Agent', 'Provider Monitoring Agent', 'KPI Agent', 'Customer Success Agent', 'Continuous Improvement Agent'],
      description: 'Monitor production, publishing, provider health, compliance queue, wallet issues, high-value customers',
      requiredOutputs: ['Daily Operations Report', 'Customer Health Report', 'Improvement Backlog'],
    },
  ];
}