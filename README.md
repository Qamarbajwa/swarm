# AI Agent Company Swarm

A multi-agent orchestration engine that runs an entire "AI company" — 50 specialist
agents across 12 layers and 11 phases — to take a SaaS marketing-video platform from
founder vision all the way to live operations. Executive roles and review gates are
driven by an LLM supervisor (or a human, your choice).

## Two models

The swarm runs on a **dual-model** setup that mirrors its own org chart:

| Role | Who | Model (default) |
|------|-----|-----------------|
| Executives (CEO/CTO/COO/CPO) + every review gate | **Supervisor** | **Claude Sonnet 4.6** (`claude-sonnet-4-6`, via the Anthropic SDK) |
| The 50 specialist worker agents | **Workers** | **DeepSeek** (`LLM_MODEL`, via an OpenAI-compatible client) |

If no `ANTHROPIC_API_KEY` is set, the supervisor falls back to the worker model so
the swarm still runs on a single key. Set `SUPERVISOR_PROVIDER=deepseek` to force that.

## How it works

- **Agents** (`src/agents`) — 50 role definitions (CEO, CTO, Architects, QA, DevOps, …),
  each with a purpose, responsibilities, inputs/outputs and handoff targets.
- **Phases** (`src/phases`) — 11 ordered phases (0 Founder Intent → 10 Live Operations),
  each assigning a set of agents.
- **Gates** (`src/gates`) — 6 review gates that block phase progression until approved.
- **Engine** (`src/engine`):
  - `Orchestrator` — the COO; runs phases, creates tasks, routes handoffs, checks gates.
  - `ClaudeSupervisor` — the executive brain (CEO/CTO/COO/CPO + gates), backed by the
    Claude client. Runs in **auto** (LLM) or **interactive** (human) mode.
  - `AgentRunner` — executes one specialist agent via the DeepSeek worker client, with a
    consult-the-supervisor escape hatch.
  - `llm/` — `LLM` (DeepSeek/OpenAI worker client) and `ClaudeLLM` (Anthropic supervisor
    client), both implementing a shared `LLMClient` interface.
  - `TaskBoard`, `ReviewGate`, `HandoffRouter`, `SourceOfTruth` — supporting state managers.
- State persists to `swarm-state.json` and is reloaded on the next run.

## Setup

```bash
cd swarm
npm install
cp .env.example .env      # then set DEEPSEEK_API_KEY and ANTHROPIC_API_KEY in .env
```

## Running

```bash
npm run swarm:list        # list all 50 agents grouped by layer
npm run swarm:status      # show current phase, tasks, gates, completion %
npm run swarm:phase0      # run a single phase (0..10)
npm run swarm:full        # run all 11 phases end to end
npm run dev -- --agent="Market Research Agent"   # run one agent in isolation
npm run dev -- --phase=2 --instructions="Focus on the EU market first"
```

CLI flags accept both `--phase=2` and `--phase 2` forms.

| Flag | Meaning |
|------|---------|
| `--phase=<0..10\|all>` | run a phase (or every phase) |
| `--agent=<name>` | run a single agent once |
| `--instructions=<text>` | founder brief / direction (overrides env + file) |
| `--status` | print status and exit |
| `--list-agents` | print the agent roster and exit |

## Supervisor modes

Set `SWARM_MODE` in `.env`:

- **`auto`** (default) — the LLM makes every executive decision and gate ruling, so the
  whole swarm runs unattended. Gate/review verdicts default to *approve* on ambiguity so a
  single parse hiccup never deadlocks the run.
- **`interactive`** — a human answers each prompt at the terminal (the original
  human-in-the-loop behaviour).

The founder brief (auto mode) comes from `--instructions=`, the `FOUNDER_BRIEF` env var, a
`founder-brief.md` file at the swarm root, or a built-in default — in that order.

## Build

```bash
npm run typecheck   # tsc --noEmit
npm run build       # emit to dist/
npm start           # node dist/index.js
```
