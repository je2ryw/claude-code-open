/**
 * 工具基类
 * 所有工具都继承自此基类
 */

import type { ToolDefinition, ToolResult } from '../types/index.js';

export abstract class BaseTool<TInput = unknown, TOutput extends ToolResult = ToolResult> {
  abstract name: string;
  abstract description: string;

  abstract getInputSchema(): ToolDefinition['inputSchema'];

  abstract execute(input: TInput): Promise<TOutput>;

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.getInputSchema(),
    };
  }

  protected success(output: string): ToolResult {
    return { success: true, output };
  }

  protected error(message: string): ToolResult {
    return { success: false, error: message };
  }
}

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  register(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getAll(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => tool.getDefinition());
  }

  async execute(name: string, input: unknown): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }
    try {
      return await tool.execute(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

export const toolRegistry = new ToolRegistry();
