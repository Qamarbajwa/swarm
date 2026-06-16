// ============================================================
// Swarm Configuration - loads from .env
// ============================================================

import * as path from 'path';
import * as fs from 'fs';

// Load .env file manually (avoid requiring dotenv dependency)
function loadEnvFile(): void {
  const envPath = path.join(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Load env on module import
loadEnvFile();

/**
 * Reads the founder brief from FOUNDER_BRIEF env var, or from a founder-brief.md
 * file at the swarm root if present. Falls back to a sensible default so that
 * 'auto' mode never blocks waiting for stdin.
 */
function loadFounderBrief(): string {
  if (process.env.FOUNDER_BRIEF && process.env.FOUNDER_BRIEF.trim()) {
    return process.env.FOUNDER_BRIEF.trim();
  }
  const briefPath = path.join(__dirname, '../../founder-brief.md');
  if (fs.existsSync(briefPath)) {
    const content = fs.readFileSync(briefPath, 'utf-8').trim();
    if (content) return content;
  }
  return (
    'Build a single-admin SaaS marketing platform that turns a product brief into ' +
    'publish-ready AI marketing videos. Core providers: DeepSeek (scripts), Google Veo ' +
    '(video/avatar), Artlist (music/SFX), Stripe (billing). The user owns liability for ' +
    'published content. Ship a focused MVP first; defer non-essential features to beta/future.'
  );
}

// The placeholder values shipped in .env.example are not real keys; treat them
// as "unset" so the user gets the friendly warning instead of a 401.
function realKey(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const v = (c || '').trim();
    if (v && !/^your_.*_here$/i.test(v)) return v;
  }
  return '';
}

export function getDefaultConfig(): import('../types').SwarmConfig {
  const provider = (process.env.LLM_PROVIDER || 'deepseek') as 'deepseek' | 'openai' | 'custom';
  const mode = (process.env.SWARM_MODE || 'auto').toLowerCase() === 'interactive' ? 'interactive' : 'auto';

  // Supervisor (executive + gates) runs on Claude when an Anthropic key is set.
  const anthropicApiKey = realKey(process.env.ANTHROPIC_API_KEY, process.env.CLAUDE_API_KEY);
  const supervisorProvider = (
    (process.env.SUPERVISOR_PROVIDER || (anthropicApiKey ? 'anthropic' : 'deepseek')).toLowerCase() === 'anthropic'
      ? 'anthropic'
      : 'deepseek'
  ) as 'anthropic' | 'deepseek';

  return {
    // Worker model (DeepSeek) — runs the specialist agents.
    llmProvider: provider,
    apiKey: realKey(process.env.DEEPSEEK_API_KEY, process.env.OPENAI_API_KEY, process.env.LLM_API_KEY),
    baseURL: process.env.LLM_BASE_URL || undefined,
    modelName: process.env.LLM_MODEL || (provider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat'),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),

    // Supervisor model (Claude) — runs CEO/CTO/COO/CPO + all review gates.
    supervisorProvider,
    anthropicApiKey,
    supervisorModel: process.env.SUPERVISOR_MODEL || 'claude-sonnet-4-6',
    supervisorMaxTokens: parseInt(process.env.SUPERVISOR_MAX_TOKENS || '8192', 10),
    supervisorThinking: (process.env.SUPERVISOR_THINKING || 'true').toLowerCase() !== 'false',

    supervisorMode: mode as 'auto' | 'interactive',
    founderBrief: loadFounderBrief(),
    maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3', 10),
    currentPhase: '0_founder_intent',
    activeGates: [],
    stateFilePath: path.join(__dirname, '../../swarm-state.json'),
    verbose: process.env.SWARM_VERBOSE === 'true',
  };
}