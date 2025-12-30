/**
 * 工具基类
 * 所有工具都继承自此基类
 */

import type { ToolDefinition, ToolResult } from '../types/index.js';

/**
 * 权限检查结果
 */
export interface PermissionCheckResult<TInput = unknown> {
  /** 权限行为：allow（允许）、deny（拒绝）、ask（询问用户） */
  behavior: 'allow' | 'deny' | 'ask';
  /** 拒绝或询问的原因消息 */
  message?: string;
  /** 修改后的输入参数（可选，用于修正或规范化输入） */
  updatedInput?: TInput;
}

export abstract class BaseTool<TInput = unknown, TOutput extends ToolResult = ToolResult> {
  abstract name: string;
  abstract description: string;

  abstract getInputSchema(): ToolDefinition['inputSchema'];

  abstract execute(input: TInput): Promise<TOutput>;

  /**
   * 权限检查方法（在工具执行前调用）
   * 子类可以重写此方法实现自定义权限检查逻辑
   *
   * @param input 工具输入参数
   * @returns 权限检查结果
   */
  async checkPermissions(input: TInput): Promise<PermissionCheckResult<TInput>> {
    // 默认行为：允许执行
    return {
      behavior: 'allow',
      updatedInput: input,
    };
  }

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

  /**
   * 执行工具（带权限检查）
   * @param name 工具名称
   * @param input 工具输入参数
   * @param onPermissionRequest 权限请求回调函数（可选）
   * @returns 工具执行结果
   */
  async execute(
    name: string,
    input: unknown,
    onPermissionRequest?: (toolName: string, toolInput: unknown, message?: string) => Promise<boolean>
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }

    try {
      // 1. 执行权限预检查
      const permResult = await tool.checkPermissions(input);

      // 2. 处理权限检查结果
      if (permResult.behavior === 'deny') {
        // 拒绝执行
        return {
          success: false,
          error: permResult.message || 'Permission denied by tool permission check',
        };
      }

      // 3. 如果需要询问用户
      if (permResult.behavior === 'ask') {
        // 如果没有提供权限请求回调，默认拒绝
        if (!onPermissionRequest) {
          return {
            success: false,
            error: permResult.message || 'Permission required but no permission handler available',
          };
        }

        // 调用权限请求回调，等待用户批准
        const approved = await onPermissionRequest(name, input, permResult.message);

        if (!approved) {
          return {
            success: false,
            error: 'Permission denied by user',
          };
        }
      }

      // 4. 使用更新后的输入参数（如果有）
      const finalInput = permResult.updatedInput !== undefined ? permResult.updatedInput : input;

      // 5. 执行工具
      return await tool.execute(finalInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}

export const toolRegistry = new ToolRegistry();
