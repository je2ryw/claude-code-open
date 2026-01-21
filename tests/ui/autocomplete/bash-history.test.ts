/**
 * Bash 历史自动完成测试 (v2.1.14)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isTypingBashHistory,
  extractBashHistoryQuery,
  getBashHistoryCompletions,
  addToHistory,
  clearBashHistory,
  getBashHistoryStats,
} from '../../src/ui/autocomplete/bash-history.js';
import { getHistoryManager } from '../../src/ui/utils/history-manager.js';

describe('Bash History Autocomplete (v2.1.14)', () => {
  beforeEach(() => {
    // 清空历史记录
    clearBashHistory();
    
    // 添加测试数据
    addToHistory('git status');
    addToHistory('git add .');
    addToHistory('git commit -m "test"');
    addToHistory('npm install');
    addToHistory('npm test');
    addToHistory('ls -la');
    addToHistory('cd /tmp');
  });

  afterEach(() => {
    clearBashHistory();
  });

  describe('检测功能', () => {
    it('应该检测到 Bash() 调用中的命令', () => {
      const text = 'Bash("git st';
      const result = isTypingBashHistory(text, text.length);
      expect(result).toBe(true);
    });

    it('应该检测到  ! 前缀', () => {
      const text = 'Bash("!git');
      const result = isTypingBashHistory(text, text.length);
      expect(result).toBe(true);
    });

    it('应该检测到 bash 代码块', () => {
      const text = '```bash\ngit st';
      const result = isTypingBashHistory(text, text.length);
      expect(result).toBe(true);
    });

    it('不应该检测到普通文本', () => {
      const text = 'just some text';
      const result = isTypingBashHistory(text, text.length);
      expect(result).toBe(false);
    });

    it('不应该检测到斜杠命令', () => {
      const text = '/help';
      const result = isTypingBashHistory(text, text.length);
      expect(result).toBe(false);
    });

    it('应该至少需要2个字符才触发', () => {
      const text1 = 'Bash("g';  // 1个字符
      const text2 = 'Bash("gi';  // 2个字符
      
      expect(isTypingBashHistory(text1, text1.length)).toBe(false);
      expect(isTypingBashHistory(text2, text2.length)).toBe(true);
    });
  });

  describe('查询提取', () => {
    it('应该提取 Bash() 中的查询', () => {
      const text = 'Bash("git st';
      const result = extractBashHistoryQuery(text, text.length);
      
      expect(result.query).toBe('git st');
      expect(result.startPosition).toBeGreaterThan(0);
    });

    it('应该去除 ! 前缀', () => {
      const text = 'Bash("!git';
      const result = extractBashHistoryQuery(text, text.length);
      
      expect(result.query).toBe('git');
    });

    it('应该从 bash 代码块提取查询', () => {
      const text = '```bash\ngit status';
      const result = extractBashHistoryQuery(text, text.length);
      
      expect(result.query).toBe('git status');
    });
  });

  describe('补全建议', () => {
    it('应该返回匹配的历史命令', () => {
      const results = getBashHistoryCompletions('git');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.value.toLowerCase().includes('git'))).toBe(true);
    });

    it('应该优先前缀匹配', () => {
      const results = getBashHistoryCompletions('git');
      
      // 第一个结果应该是前缀匹配
      expect(results[0].value.toLowerCase().startsWith('git')).toBe(true);
      expect(results[0].description).toContain('⚡');
    });

    it('应该限制结果数量', () => {
      const results = getBashHistoryCompletions('', 5);
      
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('应该返回最近的命令（无查询时）', () => {
      const results = getBashHistoryCompletions('');
      
      expect(results.length).toBeGreaterThan(0);
      // 最近添加的应该是 cd /tmp
      expect(results[0].value).toBe('cd /tmp');
    });

    it('应该正确设置补全项类型', () => {
      const results = getBashHistoryCompletions('git');
      
      expect(results.every(r => r.type === 'bash-history')).toBe(true);
    });

    it('应该包含图标', () => {
      const results = getBashHistoryCompletions('git');
      
      expect(results.every(r => r.icon === '📜')).toBe(true);
    });
  });

  describe('历史记录管理', () => {
    it('应该添加命令到历史', () => {
      clearBashHistory();
      addToHistory('echo "hello"');
      
      const results = getBashHistoryCompletions('echo');
      expect(results.length).toBe(1);
      expect(results[0].value).toBe('echo "hello"');
    });

    it('不应该添加空命令', () => {
      const initialCount = getBashHistoryStats().total;
      
      addToHistory('');
      addToHistory('   ');
      
      expect(getBashHistoryStats().total).toBe(initialCount);
    });

    it('不应该添加注释', () => {
      const initialCount = getBashHistoryStats().total;
      
      addToHistory('# this is a comment');
      
      expect(getBashHistoryStats().total).toBe(initialCount);
    });

    it('不应该添加 ! 历史命令', () => {
      const initialCount = getBashHistoryStats().total;
      
      addToHistory('!git');
      
      expect(getBashHistoryStats().total).toBe(initialCount);
    });

    it('不应该添加看起来敏感的命令', () => {
      const initialCount = getBashHistoryStats().total;
      
      add ToHistory('export PASSWORD=secret');
      addToHistory('echo $API_KEY');
      
      expect(getBashHistoryStats().total).toBe(initialCount);
    });

    it('应该清空历史', () => {
      clearBashHistory();
      
      const stats = getBashHistoryStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('统计信息', () => {
    it('应该返回总命令数', () => {
      const stats = getBashHistoryStats();
      
      expect(stats.total).toBe(7);  // 我们在 beforeEach 中添加了 7 个命令
    });

    it('应该返回最常用的命令', () => {
      // 添加重复命令
      addToHistory('git status');
      addToHistory('git status');
      addToHistory('git status');
      
      const stats = getBashHistoryStats();
      
      expect(stats.mostUsed.length).toBeGreaterThan(0);
      expect(stats.mostUsed[0].command).toBe('git status');
      expect(stats.mostUsed[0].count).toBeGreaterThan(1);
    });
  });

  describe('优先级排序', () => {
    it('前缀匹配应该有更高优先级', () => {
      const results = getBashHistoryCompletions('git');
      
      // 检查前缀匹配的优先级
      const prefixMatches = results.filter(r => r.description?.includes('⚡'));
      const otherMatches = results.filter(r => !r.description?.includes('⚡'));
      
      if (prefixMatches.length > 0 && otherMatches.length > 0) {
        expect(prefixMatches[0].priority!).toBeGreaterThan(otherMatches[0].priority || 0);
      }
    });

    it('更近的命令应该有更高优先级', () => {
      const results = getBashHistoryCompletions('');
      
      // 检查优先级递减
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].priority!).toBeGreaterThanOrEqual(results[i + 1].priority || 0);
      }
    });
  });

  describe('集成测试', () => {
    it('应该支持完整的使用流程', () => {
      // 1. 用户输入命令
      const inputText = 'Bash("git st';
      
      // 2. 检测到 bash 历史模式
      expect(isTypingBashHistory(inputText, inputText.length)).toBe(true);
      
      // 3. 提取查询
      const { query } = extractBashHistoryQuery(inputText, inputText.length);
      expect(query).toBe('git st');
      
      // 4. 获取补全建议
      const completions = getBashHistoryCompletions(query);
      expect(completions.length).toBeGreaterThan(0);
      
      // 5. 验证补全项
      expect(completions[0].type).toBe('bash-history');
      expect(completions[0].value).toContain('git');
      
      // 6. 执行命令后添加到历史
      addToHistory(completions[0].value);
      
      // 7. 验证添加成功
      const stats = getBashHistoryStats();
      expect(stats.total).toBeGreaterThan(0);
    });
  });
});
