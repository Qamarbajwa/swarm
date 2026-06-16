// ============================================================
// ClaudeLLM - Anthropic (Claude) backend for the supervisor
// ============================================================
// Used for the executive roles (CEO/CTO/COO/CPO) and all review
// gates. Uses the official Anthropic SDK (not an OpenAI shim).
// Default model: claude-sonnet-4-6.
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { SwarmConfig } from '../types';
import { LLM, LLMClient } from './index';

export class ClaudeLLM implements LLMClient {
  private client: Anthropic;
  private config: SwarmConfig;

  constructor(config: SwarmConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey || 'missing-api-key',
      // The SDK retries 429/5xx/connection errors with exponential backoff.
      maxRetries: Math.max(0, config.maxRetries ?? 3),
    });
  }

  async generate(systemPrompt: string, userMessage: string): Promise<string> {
    if (!this.config.anthropicApiKey) {
      throw new Error('No Anthropic API key configured. Set ANTHROPIC_API_KEY for the Claude supervisor.');
    }

    if (this.config.verbose) {
      console.log(`\n[Claude Call] Model: ${this.config.supervisorModel}`);
      console.log(`[System] ${systemPrompt.substring(0, 100)}...`);
      console.log(`[User] ${userMessage.substring(0, 100)}...`);
    }

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.config.supervisorModel,
      max_tokens: this.config.supervisorMaxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    };

    // Adaptive thinking improves executive/gate judgement on Sonnet 4.6.
    // Cast keeps this compatible across SDK versions that may not yet type it.
    if (this.config.supervisorThinking) {
      (params as { thinking?: unknown }).thinking = { type: 'adaptive' };
    }

    try {
      const response = await this.client.messages.create(params);

      // Skip thinking blocks; concatenate the visible text output.
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      if (this.config.verbose) {
        console.log(`[Claude Response] ${text.substring(0, 200)}...`);
      }

      return text;
    } catch (error: any) {
      console.error(`[Claude Error] ${error.message}`);
      throw error;
    }
  }

  async generateStructured<T>(
    systemPrompt: string,
    userMessage: string,
    outputFormat: string
  ): Promise<T> {
    const fullPrompt = `${systemPrompt}\n\nIMPORTANT: You MUST return your response in the following JSON format:\n${outputFormat}\n\nReturn ONLY valid JSON.`;
    const response = await this.generate(fullPrompt, userMessage);

    // Reuse the balanced-brace extractor from the DeepSeek backend.
    const jsonStr = LLM.extractJson(response);
    try {
      return JSON.parse(jsonStr) as T;
    } catch (e) {
      console.error('[Claude Parse Error] Could not parse structured output');
      console.error(`[Raw Response] ${response.substring(0, 800)}`);
      throw new Error('Failed to parse structured Claude output');
    }
  }
}
