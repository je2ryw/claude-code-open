/**
 * AskUserQuestion 工具
 * 向用户提出问题并获取选择
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { BaseTool } from './base.js';
import type { AskUserQuestionInput, ToolResult, ToolDefinition } from '../types/index.js';

export class AskUserQuestionTool extends BaseTool<AskUserQuestionInput, ToolResult> {
  name = 'AskUserQuestion';
  description = `Ask the user a question with predefined options to clarify requirements or get approval.

Use this tool when you need to:
- Clarify ambiguous requirements
- Get user approval for a specific approach
- Ask about implementation preferences
- Confirm understanding of a task

Each question should have 2-4 options. An "Other" option allowing free-form input is automatically provided.`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'Questions to ask the user (1-4 questions)',
          items: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The complete question to ask the user',
              },
              header: {
                type: 'string',
                description: 'Short label displayed as a chip/tag (max 12 chars)',
              },
              options: {
                type: 'array',
                description: 'The available choices (2-4 options)',
                items: {
                  type: 'object',
                  properties: {
                    label: {
                      type: 'string',
                      description: 'Display text for this option (1-5 words)',
                    },
                    description: {
                      type: 'string',
                      description: 'Explanation of what this option means',
                    },
                  },
                  required: ['label', 'description'],
                },
              },
              multiSelect: {
                type: 'boolean',
                description: 'Allow multiple selections',
              },
            },
            required: ['question', 'header', 'options', 'multiSelect'],
          },
        },
      },
      required: ['questions'],
    };
  }

  async execute(input: AskUserQuestionInput): Promise<ToolResult> {
    const { questions } = input;

    if (!questions || questions.length === 0) {
      return { success: false, error: 'No questions provided' };
    }

    if (questions.length > 4) {
      return { success: false, error: 'Maximum 4 questions allowed' };
    }

    const answers: Record<string, string> = {};

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim());
        });
      });
    };

    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        console.log(chalk.bold(`\n[${q.header}] ${q.question}`));
        console.log();

        // 显示选项
        q.options.forEach((opt, idx) => {
          console.log(chalk.cyan(`  ${idx + 1}. ${opt.label}`));
          console.log(chalk.gray(`     ${opt.description}`));
        });
        console.log(chalk.yellow(`  ${q.options.length + 1}. Other (enter custom response)`));
        console.log();

        const response = await askQuestion(
          q.multiSelect
            ? chalk.blue('Enter choices (comma-separated numbers): ')
            : chalk.blue('Enter your choice (number): ')
        );

        // 解析响应
        if (q.multiSelect) {
          const indices = response.split(',').map((s) => parseInt(s.trim(), 10));
          const selected: string[] = [];

          for (const idx of indices) {
            if (idx >= 1 && idx <= q.options.length) {
              selected.push(q.options[idx - 1].label);
            } else if (idx === q.options.length + 1) {
              const custom = await askQuestion(chalk.blue('Enter custom response: '));
              selected.push(custom);
            }
          }

          answers[q.header] = selected.join(', ');
        } else {
          const idx = parseInt(response, 10);

          if (idx >= 1 && idx <= q.options.length) {
            answers[q.header] = q.options[idx - 1].label;
          } else if (idx === q.options.length + 1) {
            const custom = await askQuestion(chalk.blue('Enter custom response: '));
            answers[q.header] = custom;
          } else {
            answers[q.header] = response; // 直接使用输入
          }
        }
      }
    } finally {
      rl.close();
    }

    // 格式化答案输出
    let output = 'User Responses:\n';
    for (const [header, answer] of Object.entries(answers)) {
      output += `  ${header}: ${answer}\n`;
    }

    return {
      success: true,
      output,
    };
  }
}
