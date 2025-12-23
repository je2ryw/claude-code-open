/**
 * Todo 工具
 * 任务管理
 */

import { BaseTool } from './base.js';
import type { TodoWriteInput, TodoItem, ToolResult, ToolDefinition } from '../types/index.js';

// 全局 Todo 存储
let currentTodos: TodoItem[] = [];

export function getTodos(): TodoItem[] {
  return [...currentTodos];
}

export function setTodos(todos: TodoItem[]): void {
  currentTodos = [...todos];
}

export class TodoWriteTool extends BaseTool<TodoWriteInput, ToolResult> {
  name = 'TodoWrite';
  description = `Create and manage a structured task list for your current coding session.

When to Use:
1. Complex multi-step tasks (3+ distinct steps)
2. Non-trivial and complex tasks
3. User explicitly requests todo list
4. User provides multiple tasks
5. After receiving new instructions

When NOT to Use:
1. Single, straightforward task
2. Trivial tasks
3. Less than 3 trivial steps

Task States:
- pending: Task not yet started
- in_progress: Currently working on (limit to ONE at a time)
- completed: Task finished successfully`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The updated todo list',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                minLength: 1,
                description: 'Task description',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Task status',
              },
              activeForm: {
                type: 'string',
                minLength: 1,
                description: 'Present continuous form (e.g., "Running tests")',
              },
            },
            required: ['content', 'status', 'activeForm'],
          },
        },
      },
      required: ['todos'],
    };
  }

  async execute(input: TodoWriteInput): Promise<ToolResult> {
    const { todos } = input;

    // 验证任务
    const inProgress = todos.filter(t => t.status === 'in_progress');
    if (inProgress.length > 1) {
      return {
        success: false,
        error: 'Only one task can be in_progress at a time.',
      };
    }

    // 保存 todos
    setTodos(todos);

    // 生成输出
    const statusIcons = {
      pending: '○',
      in_progress: '●',
      completed: '✓',
    };

    const output = todos.map((todo, idx) => {
      const icon = statusIcons[todo.status];
      return `${idx + 1}. [${icon}] ${todo.content}`;
    }).join('\n');

    return {
      success: true,
      output: `Todos updated:\n${output}`,
    };
  }
}
