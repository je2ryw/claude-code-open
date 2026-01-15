/**
 * validateToolResults 单元测试
 * 测试孤立的 tool_result 验证和修复功能
 */

import { describe, it, expect } from 'vitest';
import { validateToolResults } from './loop.js';
import type { Message } from '../types/index.js';

describe('validateToolResults', () => {
  describe('正常情况', () => {
    it('空消息列表应该返回空数组', () => {
      const result = validateToolResults([]);
      expect(result).toEqual([]);
    });

    it('没有 tool_use 的消息列表应该原样返回', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
      ];
      const result = validateToolResults(messages);
      expect(result).toEqual(messages);
    });

    it('每个 tool_use 都有 tool_result 时应该原样返回', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read a file' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will read the file.' },
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/test.txt' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1', content: 'File contents' },
          ],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Done!' }],
        },
      ];
      const result = validateToolResults(messages);
      expect(result).toEqual(messages);
    });
  });

  describe('孤立的 tool_use 修复', () => {
    it('应该为缺少 tool_result 的 tool_use 创建 error tool_result', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read a file' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will read the file.' },
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/test.txt' } },
          ],
        },
        // 缺少 tool_result
      ];
      const result = validateToolResults(messages);

      // 应该添加一个新的 user 消息包含 error tool_result
      expect(result.length).toBe(3);
      expect(result[2].role).toBe('user');
      expect(Array.isArray(result[2].content)).toBe(true);

      const content = result[2].content as any[];
      expect(content.length).toBe(1);
      expect(content[0].type).toBe('tool_result');
      expect(content[0].tool_use_id).toBe('tool_1');
      expect(content[0].is_error).toBe(true);
      expect(content[0].content).toContain('Tool execution was interrupted');
      expect(content[0].content).toContain('Read');
    });

    it('应该处理多个孤立的 tool_use', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read files' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/a.txt' } },
            { type: 'tool_use', id: 'tool_2', name: 'Read', input: { file_path: '/b.txt' } },
            { type: 'tool_use', id: 'tool_3', name: 'Glob', input: { pattern: '*.js' } },
          ],
        },
        // 缺少所有 tool_result
      ];
      const result = validateToolResults(messages);

      expect(result.length).toBe(3);
      const content = result[2].content as any[];
      expect(content.length).toBe(3);

      // 验证所有 tool_result 都被创建
      const toolIds = content.map((c: any) => c.tool_use_id);
      expect(toolIds).toContain('tool_1');
      expect(toolIds).toContain('tool_2');
      expect(toolIds).toContain('tool_3');

      // 验证所有都是 error
      for (const block of content) {
        expect(block.is_error).toBe(true);
      }
    });

    it('应该只为缺少的 tool_result 创建 error（部分缺失）', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read files' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/a.txt' } },
            { type: 'tool_use', id: 'tool_2', name: 'Read', input: { file_path: '/b.txt' } },
          ],
        },
        {
          role: 'user',
          content: [
            // 只有 tool_1 的结果，tool_2 缺失
            { type: 'tool_result', tool_use_id: 'tool_1', content: 'Contents of a.txt' },
          ],
        },
      ];
      const result = validateToolResults(messages);

      expect(result.length).toBe(3);
      const content = result[2].content as any[];
      expect(content.length).toBe(2); // 原来的 + 新增的 error

      // 验证新增的是 tool_2 的 error result
      const errorResult = content.find((c: any) => c.tool_use_id === 'tool_2');
      expect(errorResult).toBeDefined();
      expect(errorResult.is_error).toBe(true);
    });

    it('应该在现有 tool_result 消息上追加 error tool_result', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read files' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/a.txt' } },
            { type: 'tool_use', id: 'tool_2', name: 'Read', input: { file_path: '/b.txt' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1', content: 'Contents' },
          ],
        },
      ];
      const result = validateToolResults(messages);

      // 不应该创建新消息，而是追加到现有消息
      expect(result.length).toBe(3);
      const userContent = result[2].content as any[];
      expect(userContent.length).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('应该处理只有 user 消息的列表', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
      ];
      const result = validateToolResults(messages);
      expect(result).toEqual(messages);
    });

    it('应该处理只有字符串内容的消息', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' as any }, // 字符串而不是数组
      ];
      const result = validateToolResults(messages);
      expect(result).toEqual(messages);
    });

    it('应该处理 tool_use 中缺少 name 的情况', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Test' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', input: {} } as any, // 缺少 name
          ],
        },
      ];
      const result = validateToolResults(messages);

      expect(result.length).toBe(3);
      const content = result[2].content as any[];
      expect(content[0].content).toContain('unknown'); // 使用 unknown 作为工具名
    });

    it('应该处理复杂的对话历史', () => {
      const messages: Message[] = [
        { role: 'user', content: 'First task' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/a.txt' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1', content: 'Contents A' },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Got it. Now reading more.' },
            { type: 'tool_use', id: 'tool_2', name: 'Read', input: { file_path: '/b.txt' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_2', content: 'Contents B' },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_3', name: 'Write', input: { file_path: '/c.txt', content: 'test' } },
          ],
        },
        // tool_3 没有 result
      ];
      const result = validateToolResults(messages);

      expect(result.length).toBe(7);
      const lastContent = result[6].content as any[];
      expect(lastContent[0].tool_use_id).toBe('tool_3');
      expect(lastContent[0].is_error).toBe(true);
    });

    it('不应该影响已经有正确 tool_result 的消息', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Read file' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: {} },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool_1', content: 'Done' },
          ],
        },
      ];

      const result = validateToolResults(messages);
      expect(result).toEqual(messages);
    });
  });

  describe('Sibling tool 失败场景', () => {
    it('应该为所有 sibling tools 创建 error result 当流式执行中断', () => {
      // 模拟场景：并行执行 3 个工具，中途中断
      const messages: Message[] = [
        { role: 'user', content: 'Do multiple tasks' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'sibling_1', name: 'Glob', input: { pattern: '*.ts' } },
            { type: 'tool_use', id: 'sibling_2', name: 'Grep', input: { pattern: 'test' } },
            { type: 'tool_use', id: 'sibling_3', name: 'Read', input: { file_path: '/test.txt' } },
          ],
        },
        // 流式执行中断，没有任何 tool_result
      ];

      const result = validateToolResults(messages);

      expect(result.length).toBe(3);
      const content = result[2].content as any[];
      expect(content.length).toBe(3);

      // 验证所有 sibling tools 都有 error result
      for (const block of content) {
        expect(block.type).toBe('tool_result');
        expect(block.is_error).toBe(true);
      }
    });

    it('应该处理部分 sibling tools 成功的情况', () => {
      // 模拟场景：3 个并行工具，第 2 个失败导致后续中断
      const messages: Message[] = [
        { role: 'user', content: 'Do multiple tasks' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'sibling_1', name: 'Glob', input: { pattern: '*.ts' } },
            { type: 'tool_use', id: 'sibling_2', name: 'Grep', input: { pattern: 'test' } },
            { type: 'tool_use', id: 'sibling_3', name: 'Read', input: { file_path: '/test.txt' } },
          ],
        },
        {
          role: 'user',
          content: [
            // 只有 sibling_1 成功完成
            { type: 'tool_result', tool_use_id: 'sibling_1', content: 'file1.ts\nfile2.ts' },
          ],
        },
      ];

      const result = validateToolResults(messages);

      expect(result.length).toBe(3);
      const content = result[2].content as any[];
      expect(content.length).toBe(3); // 1 个成功 + 2 个 error

      // 验证第一个不是 error
      const firstResult = content.find((c: any) => c.tool_use_id === 'sibling_1');
      expect(firstResult.is_error).toBeUndefined();

      // 验证后两个是 error
      const secondResult = content.find((c: any) => c.tool_use_id === 'sibling_2');
      const thirdResult = content.find((c: any) => c.tool_use_id === 'sibling_3');
      expect(secondResult.is_error).toBe(true);
      expect(thirdResult.is_error).toBe(true);
    });
  });
});
