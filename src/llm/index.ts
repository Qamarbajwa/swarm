// ============================================================
// LLM Utility - Talks to DeepSeek or OpenAI
// ============================================================

import OpenAI from 'openai';
import { SwarmConfig } from '../types';

/**
 * Shared contract implemented by every model backend (DeepSeek/OpenAI `LLM`
 * and the Anthropic `ClaudeLLM`). Lets the AgentRunner and ClaudeSupervisor
 * depend on a backend without caring which provider it is.
 */
export interface LLMClient {
  generate(systemPrompt: string, userMessage: string): Promise<string>;
  generateStructured<T>(systemPrompt: string, userMessage: string, outputFormat: string): Promise<T>;
}

export class LLM implements LLMClient {
  private client: OpenAI;
  private config: SwarmConfig;

  constructor(config: SwarmConfig) {
    this.config = config;

    // Resolve the base URL: explicit override wins, then provider defaults.
    const baseURL =
      config.baseURL ||
      (config.llmProvider === 'deepseek' ? 'https://api.deepseek.com/v1' : undefined);

    this.client = new OpenAI({
      apiKey: config.apiKey || 'missing-api-key',
      ...(baseURL ? { baseURL } : {}),
    });
  }

  private isRetryable(error: any): boolean {
    const status = error?.status ?? error?.response?.status;
    // Rate limits, timeouts and transient server errors are worth retrying.
    if (status === 429 || status === 408 || (status >= 500 && status <= 599)) return true;
    const code = error?.code || '';
    return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generate(systemPrompt: string, userMessage: string): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('No API key configured. Set DEEPSEEK_API_KEY / OPENAI_API_KEY / LLM_API_KEY.');
    }

    if (this.config.verbose) {
      console.log(`\n[LLM Call] Model: ${this.config.modelName}`);
      console.log(`[System] ${systemPrompt.substring(0, 100)}...`);
      console.log(`[User] ${userMessage.substring(0, 100)}...`);
    }

    const maxRetries = Math.max(0, this.config.maxRetries ?? 3);
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.config.modelName,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        });

        const content = response.choices[0]?.message?.content || '';

        if (this.config.verbose) {
          console.log(`[LLM Response] ${content.substring(0, 200)}...`);
        }

        return content;
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries && this.isRetryable(error)) {
          const backoff = Math.min(1000 * 2 ** attempt, 8000);
          console.warn(`[LLM Retry] attempt ${attempt + 1}/${maxRetries} after error: ${error.message}. Waiting ${backoff}ms...`);
          await this.sleep(backoff);
          continue;
        }
        break;
      }
    }

    console.error(`[LLM Error] ${lastError?.message}`);
    throw lastError;
  }

  async generateStructured<T>(
    systemPrompt: string,
    userMessage: string,
    outputFormat: string
  ): Promise<T> {
    const fullPrompt = `${systemPrompt}\n\nIMPORTANT: You MUST return your response in the following JSON format:\n${outputFormat}\n\nReturn ONLY valid JSON.`;
    const response = await this.generate(fullPrompt, userMessage);

    const jsonStr = LLM.extractJson(response);
    try {
      return JSON.parse(jsonStr) as T;
    } catch (e) {
      console.error('[LLM Parse Error] Could not parse structured output');
      console.error(`[Raw Response] ${response.substring(0, 800)}`);
      throw new Error('Failed to parse structured LLM output');
    }
  }

  /**
   * Extracts a JSON object/array from an LLM response. Handles markdown code
   * fences and prose surrounding the JSON by scanning for the first balanced
   * `{...}` (or `[...]`) block, respecting strings and escapes.
   */
  static extractJson(response: string): string {
    // 1. Prefer a fenced ```json ... ``` block.
    const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const haystack = fenced ? fenced[1] : response;

    // 2. Scan for the first balanced object/array.
    const start = haystack.search(/[{[]/);
    if (start === -1) return haystack.trim();

    const open = haystack[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < haystack.length; i++) {
      const ch = haystack[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return haystack.substring(start, i + 1).trim();
      }
    }

    // Unbalanced — return from the first brace and let JSON.parse surface the error.
    return haystack.substring(start).trim();
  }
}