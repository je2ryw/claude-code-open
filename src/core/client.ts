/**
 * Claude API 客户端
 * 处理与 Anthropic API 的通信
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message, ContentBlock, ToolDefinition } from '../types/index.js';

export interface ClientConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolUse?: (id: string, name: string, input: unknown) => void;
  onToolResult?: (id: string, result: string) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: ClientConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      baseURL: config.baseUrl,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 8192;
  }

  async createMessage(
    messages: Message[],
    tools?: ToolDefinition[],
    systemPrompt?: string
  ): Promise<{
    content: ContentBlock[];
    stopReason: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })) as any,
      tools: tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })) as any,
    });

    return {
      content: response.content as ContentBlock[],
      stopReason: response.stop_reason || 'end_turn',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *createMessageStream(
    messages: Message[],
    tools?: ToolDefinition[],
    systemPrompt?: string
  ): AsyncGenerator<{
    type: 'text' | 'tool_use_start' | 'tool_use_delta' | 'stop';
    text?: string;
    id?: string;
    name?: string;
    input?: string;
    stopReason?: string;
  }> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })) as any,
      tools: tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })) as any,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta as any;
        if (delta.type === 'text_delta') {
          yield { type: 'text', text: delta.text };
        } else if (delta.type === 'input_json_delta') {
          yield { type: 'tool_use_delta', input: delta.partial_json };
        }
      } else if (event.type === 'content_block_start') {
        const block = event.content_block as any;
        if (block.type === 'tool_use') {
          yield { type: 'tool_use_start', id: block.id, name: block.name };
        }
      } else if (event.type === 'message_stop') {
        yield { type: 'stop' };
      }
    }
  }

  setModel(model: string): void {
    this.model = model;
  }

  setMaxTokens(tokens: number): void {
    this.maxTokens = tokens;
  }
}

// 默认客户端实例
export const defaultClient = new ClaudeClient();
