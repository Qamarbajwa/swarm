#!/usr/bin/env ts-node
// ============================================================
// Cline CLI - Cline calls this to drive the swarm
// Always outputs structured JSON to stdout for Cline to parse.
// ============================================================

import { ClineSwarm } from '../cline/ClineSwarm';
import { PhaseName } from '../types';

// Parse arguments
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

async function main() {
  const swarm = new ClineSwarm();
  await swarm.initialize();

  switch (command) {

    // ---------------------------------------------------------
    // swarm:status — Show current status
    // ---------------------------------------------------------
    case 'status': {
      const status = await swarm.getStatus();
      console.log(JSON.stringify({ command: 'status', data: status }));
      break;
    }

    // ---------------------------------------------------------
    // swarm:agents — List all agents
    // ---------------------------------------------------------
    case 'agents': {
      const layers = await swarm.listAgents();
      console.log(JSON.stringify({ command: 'agents', data: layers }));
      break;
    }

    // ---------------------------------------------------------
    // swarm:agent <name> [instructions] — Run a single agent
    // ---------------------------------------------------------
    case 'agent': {
      const agentName = args[1];
      const instructions = args.slice(2).join(' ') || '';
      if (!agentName) {
        console.log(JSON.stringify({ command: 'agent', error: 'Agent name required' }));
        process.exit(1);
      }
      const result = await swarm.runAgent(agentName, instructions);
      console.log(JSON.stringify({ command: 'agent', data: result }));
      break;
    }

    // ---------------------------------------------------------
    // swarm:phase <phase> [requestId] [decision] [approved]
    // ---------------------------------------------------------
    case 'phase': {
      const phaseName = args[1] as PhaseName;
      const requestId = args[2];
      const decision = args[3];
      const approved = args[4] === 'true' ? true : args[4] === 'false' ? false : undefined;

      if (!phaseName) {
        console.log(JSON.stringify({ command: 'phase', error: 'Phase name required (e.g. 0_founder_intent)' }));
        process.exit(1);
      }

      // If a decision is being submitted, call submitDecision first
      if (requestId && decision) {
        await swarm.submitDecision(requestId, decision, approved);
      }

      const result = await swarm.executePhase(phaseName);
      console.log(JSON.stringify({ command: 'phase', data: result }));
      break;
    }

    // ---------------------------------------------------------
    // swarm:decision <requestId> <decision> [approved]
    // Submit a decision for a pending request
    // ---------------------------------------------------------
    case 'decision': {
      const reqId = args[1];
      const decisionText = args.slice(2).filter(a => a !== 'true' && a !== 'false').join(' ');
      const isApproved = args.includes('true') ? true : args.includes('false') ? false : undefined;

      if (!reqId || !decisionText) {
        console.log(JSON.stringify({ command: 'decision', error: 'Request ID and decision text required' }));
        process.exit(1);
      }

      await swarm.submitDecision(reqId, decisionText, isApproved);
      console.log(JSON.stringify({ command: 'decision', data: { requestId: reqId, submitted: true } }));
      break;
    }

    // ---------------------------------------------------------
    // swarm:full — Run full sequence (uses terminal prompts if needed)
    // ---------------------------------------------------------
    case 'full': {
      await swarm.executeFullSequence();
      console.log(JSON.stringify({ command: 'full', data: { status: 'completed' } }));
      break;
    }

    // ---------------------------------------------------------
    // Unknown command
    // ---------------------------------------------------------
    default:
      console.log(JSON.stringify({
        command: 'help',
        data: {
          commands: [
            'status          — Show swarm status',
            'agents          — List all 50 agents',
            'agent <name> [instructions] — Run a single agent',
            'phase <name> [requestId] [decision] [approved] — Execute a phase',
            'decision <requestId> <decision> [true/false] — Submit a decision',
            'full            — Run full swarm sequence',
          ],
          phases: [
            '0_founder_intent',
            '1_research_market',
            '2_business_product_structure',
            '3_legal_compliance',
            '4_system_architecture',
            '5_ux_interface',
            '6_ai_provider_implementation',
            '7_development_implementation',
            '8_qa_hardening',
            '9_launch_preparation',
            '10_live_operations',
          ],
        },
      }));
  }

  process.exit(0);
}

main().catch(error => {
  console.log(JSON.stringify({ error: error.message }));
  process.exit(1);
});