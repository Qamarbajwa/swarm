#!/usr/bin/env ts-node
// ============================================================
// AI Agent Company Swarm - Main Entry Point
// ============================================================

import { Orchestrator } from './engine/Orchestrator';
import { getDefaultConfig } from './config';

// Parse command line arguments.
// Supports both `--flag value` (space) and `--flag=value` (equals) forms so the
// npm scripts (e.g. `--phase 0`) and manual `--phase=0` both work.
const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1) {
    const next = args[idx + 1];
    if (next && !next.startsWith('--')) return next;
    return ''; // flag present with no value
  }
  return undefined;
}

const phaseArg = getArg('phase') || 'all';
const agentArg = getArg('agent');
const userInstructions = getArg('instructions') || '';
const statusOnly = args.includes('--status');
const listAgents = args.includes('--list-agents');

async function main() {
  const config = getDefaultConfig();

  // A founder brief passed on the CLI overrides the env/file default.
  if (userInstructions) {
    config.founderBrief = userInstructions;
  }

  const orchestrator = new Orchestrator(config);

  // Check for API keys (only needed for actual execution, not --status/--list-agents)
  const needsLLM = !statusOnly && !listAgents;
  if (needsLLM) {
    if (!config.apiKey) {
      console.log('\n⚠️  WARNING: No worker API key configured!');
      console.log('Set DEEPSEEK_API_KEY (or OPENAI_API_KEY / LLM_API_KEY) in your environment / .env.');
      console.log('The specialist agents will not be able to call their model.\n');
    }
    if (config.supervisorProvider === 'anthropic' && !config.anthropicApiKey) {
      console.log('\n⚠️  WARNING: Supervisor is set to Claude but no ANTHROPIC_API_KEY is configured!');
      console.log('Set ANTHROPIC_API_KEY, or set SUPERVISOR_PROVIDER=deepseek to use the worker model.\n');
    }
  }

  await orchestrator.initialize();

  // List all agents if requested
  if (listAgents) {
    const agents = orchestrator.getAllAgents();
    
    // Group by layer
    const layers = new Map<string, typeof agents>();
    for (const agent of agents) {
      const existing = layers.get(agent.layer) || [];
      existing.push(agent);
      layers.set(agent.layer, existing);
    }

    console.log('\n=== AI AGENT COMPANY SWARM - AGENT ROSTER ===\n');
    for (const [layer, layerAgents] of layers) {
      console.log(`[${layer}]`);
      for (const agent of layerAgents) {
        console.log(`  • ${agent.name}`);
      }
      console.log('');
    }
    console.log(`Total: ${agents.length} agents\n`);
    return;
  }

  // Show status only
  if (statusOnly) {
    const status = orchestrator.getStatus();
    console.log('\n=== SWARM STATUS ===');
    console.log(`Current Phase: ${status.currentPhase}`);
    console.log(`Total Agents: ${status.agentCount}`);
    console.log(`Outputs Produced: ${status.outputCount}`);
    console.log(`Completion: ${status.completionPercentage}%`);
    console.log('\nTask Summary:');
    console.log(`  TODO: ${status.taskSummary.todo}`);
    console.log(`  In Progress: ${status.taskSummary.inProgress}`);
    console.log(`  Blocked: ${status.taskSummary.blocked}`);
    console.log(`  Review: ${status.taskSummary.review}`);
    console.log(`  Done: ${status.taskSummary.done}`);
    console.log(`  Total: ${status.taskSummary.total}`);
    console.log('\nGate Statuses:');
    for (const gate of status.gateStatuses) {
      const icon = gate.status === 'APPROVED' ? '✅' : gate.status === 'IN_REVIEW' ? '🔄' : '⏳';
      console.log(`  ${icon} ${gate.name}: ${gate.status}`);
    }
    console.log('\nCompleted Phases:', status.completedPhases.join(', ') || 'None');
    return;
  }

  // Run single agent if specified
  if (agentArg) {
    try {
      const output = await orchestrator.runAgentOnce(agentArg, userInstructions);
      console.log('\n=== AGENT OUTPUT ===');
      console.log(JSON.stringify(output, null, 2));
    } catch (error: any) {
      console.error(`Failed to run agent: ${error.message}`);
    }
    return;
  }

  // Run phase(s)
  if (phaseArg === 'all') {
    console.log('\n🚀 Running full swarm sequence (all 11 phases)...\n');
    await orchestrator.executeFullSequence();
  } else {
    const phaseName = `${phaseArg.replace(/^phase_?/, '')}`;
    const phaseMap: Record<string, any> = {
      '0': '0_founder_intent',
      '1': '1_research_market',
      '2': '2_business_product_structure',
      '3': '3_legal_compliance',
      '4': '4_system_architecture',
      '5': '5_ux_interface',
      '6': '6_ai_provider_implementation',
      '7': '7_development_implementation',
      '8': '8_qa_hardening',
      '9': '9_launch_preparation',
      '10': '10_live_operations',
    };
    
    const resolvedPhase = phaseMap[phaseName] || phaseName;
    console.log(`\n🚀 Running single phase: ${resolvedPhase}\n`);
    await orchestrator.executePhase(resolvedPhase);
  }

  // Print final summary
  const finalStatus = orchestrator.getStatus();
  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Completion: ${finalStatus.completionPercentage}%`);
  console.log(`Tasks done: ${finalStatus.taskSummary.done}/${finalStatus.taskSummary.total}`);
  console.log(`Gates passed: ${finalStatus.gateStatuses.filter(g => g.status === 'APPROVED').length}/${finalStatus.gateStatuses.length}`);
  console.log(`Outputs: ${finalStatus.outputCount}`);
}

main().catch(console.error);