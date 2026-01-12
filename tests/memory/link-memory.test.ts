/**
 * LinkMemory 单元测试
 * 测试关联记忆的核心功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  LinkMemory,
  getLinkMemory,
  resetLinkMemoryCache,
} from '../../src/memory/link-memory.js';
import { MemoryImportance } from '../../src/memory/types.js';

// 测试环境配置
const TEST_DIR = path.join(os.tmpdir(), 'link-memory-test-' + Date.now());
const TEST_PROJECT_DIR = path.join(TEST_DIR, 'test-project');

// 设置测试环境
beforeEach(() => {
  // 创建测试目录
  if (!fs.existsSync(TEST_PROJECT_DIR)) {
    fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
  }
  // 重置缓存
  resetLinkMemoryCache();
});

// 清理测试环境
afterEach(() => {
  // 重置缓存
  resetLinkMemoryCache();

  // 清理测试目录
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('LinkMemory', () => {
  describe('初始化', () => {
    it('应该创建 LinkMemory 实例（项目级）', () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);
      expect(linkMemory).toBeDefined();
    });

    it('应该创建 LinkMemory 实例（全局级）', () => {
      const linkMemory = new LinkMemory();
      expect(linkMemory).toBeDefined();
    });

    it('应该初始化空存储', () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);
      const stats = linkMemory.getStats();

      expect(stats.totalLinks).toBe(0);
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);
      expect(stats.totalTopics).toBe(0);
    });
  });

  describe('创建链接', () => {
    it('应该创建新链接', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      const linkId = await linkMemory.createLink({
        timestamp: new Date().toISOString(),
        conversationId: 'conv-1',
        sessionId: 'session-1',
        files: ['src/index.ts'],
        symbols: ['main'],
        commits: [],
        topics: ['初始化'],
        description: '测试链接',
        importance: MemoryImportance.MEDIUM,
        relatedLinks: [],
      });

      expect(linkId).toBeDefined();
      expect(linkId.startsWith('link_')).toBe(true);
    });

    it('应该使用提供的 ID', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);
      const customId = 'custom-link-id';

      const linkId = await linkMemory.createLink({
        id: customId,
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '自定义 ID 链接',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      expect(linkId).toBe(customId);
    });

    it('应该规范化文件路径', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        timestamp: new Date().toISOString(),
        files: ['src\\utils\\helper.ts', 'src/index.ts'],
        symbols: [],
        commits: [],
        topics: [],
        description: '路径测试',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      const files = linkMemory.getAllFiles();
      expect(files).toContain('src/utils/helper.ts');
      expect(files).toContain('src/index.ts');
    });

    it('应该自动生成时间戳', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      const linkId = await linkMemory.createLink({
        files: ['test.ts'],
        symbols: [],
        commits: [],
        topics: [],
        description: '无时间戳',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      } as any);

      const link = await linkMemory.getLink(linkId);
      expect(link?.timestamp).toBeDefined();
    });
  });

  describe('索引查询', () => {
    let linkMemory: LinkMemory;

    beforeEach(async () => {
      linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      // 创建测试链接
      await linkMemory.createLink({
        id: 'link-1',
        timestamp: new Date().toISOString(),
        conversationId: 'conv-1',
        files: ['src/index.ts', 'src/utils.ts'],
        symbols: ['main', 'helper'],
        commits: ['abc123'],
        topics: ['重构', '性能优化'],
        description: '链接1',
        importance: MemoryImportance.HIGH,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-2',
        timestamp: new Date().toISOString(),
        conversationId: 'conv-2',
        files: ['src/utils.ts', 'src/config.ts'],
        symbols: ['helper', 'loadConfig'],
        commits: ['def456'],
        topics: ['配置', '重构'],
        description: '链接2',
        importance: MemoryImportance.MEDIUM,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-3',
        timestamp: new Date().toISOString(),
        sessionId: 'session-1',
        files: ['src/config.ts'],
        symbols: ['loadConfig'],
        commits: [],
        topics: ['配置'],
        description: '链接3',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });
    });

    it('应该按文件查找链接', async () => {
      const results = await linkMemory.findByFile('src/utils.ts');
      expect(results.length).toBe(2);
      expect(results.map(r => r.id)).toContain('link-1');
      expect(results.map(r => r.id)).toContain('link-2');
    });

    it('应该按符号查找链接', async () => {
      const results = await linkMemory.findBySymbol('helper');
      expect(results.length).toBe(2);
      expect(results.map(r => r.id)).toContain('link-1');
      expect(results.map(r => r.id)).toContain('link-2');
    });

    it('应该按话题查找链接', async () => {
      const results = await linkMemory.findByTopic('重构');
      expect(results.length).toBe(2);
      expect(results.map(r => r.id)).toContain('link-1');
      expect(results.map(r => r.id)).toContain('link-2');
    });

    it('应该按对话 ID 查找链接', async () => {
      const results = await linkMemory.findByConversation('conv-1');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('link-1');
    });

    it('应该按会话 ID 查找链接', async () => {
      const results = await linkMemory.findBySession('session-1');
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('link-3');
    });

    it('应该按重要性查找链接', async () => {
      const results = await linkMemory.findByImportance(MemoryImportance.MEDIUM);
      expect(results.length).toBe(2); // HIGH 和 MEDIUM
    });

    it('查找不存在的条目应返回空数组', async () => {
      const byFile = await linkMemory.findByFile('nonexistent.ts');
      const bySymbol = await linkMemory.findBySymbol('nonexistent');
      const byTopic = await linkMemory.findByTopic('不存在的话题');

      expect(byFile).toEqual([]);
      expect(bySymbol).toEqual([]);
      expect(byTopic).toEqual([]);
    });
  });

  describe('时间范围查询', () => {
    it('应该按时间范围查找链接', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);
      const now = Date.now();

      await linkMemory.createLink({
        id: 'old-link',
        timestamp: new Date(now - 86400000 * 7).toISOString(), // 7天前
        files: ['old.ts'],
        symbols: [],
        commits: [],
        topics: [],
        description: '旧链接',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'new-link',
        timestamp: new Date(now - 86400000).toISOString(), // 1天前
        files: ['new.ts'],
        symbols: [],
        commits: [],
        topics: [],
        description: '新链接',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      // 查找最近3天的链接
      const results = await linkMemory.findByTimeRange(
        new Date(now - 86400000 * 3).toISOString(),
        new Date().toISOString()
      );

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('new-link');
    });
  });

  describe('组合查询', () => {
    it('应该支持多条件组合查询', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'link-1',
        timestamp: new Date().toISOString(),
        files: ['src/a.ts'],
        symbols: ['funcA'],
        commits: [],
        topics: ['topic1'],
        description: '链接1',
        importance: MemoryImportance.HIGH,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-2',
        timestamp: new Date().toISOString(),
        files: ['src/a.ts', 'src/b.ts'],
        symbols: ['funcB'],
        commits: [],
        topics: ['topic1', 'topic2'],
        description: '链接2',
        importance: MemoryImportance.MEDIUM,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-3',
        timestamp: new Date().toISOString(),
        files: ['src/c.ts'],
        symbols: ['funcC'],
        commits: [],
        topics: ['topic2'],
        description: '链接3',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      // 查询同时满足文件和话题条件的链接
      const results = await linkMemory.query({
        files: ['src/a.ts'],
        topics: ['topic1'],
      });

      expect(results.length).toBe(2);
      expect(results.map(r => r.id)).toContain('link-1');
      expect(results.map(r => r.id)).toContain('link-2');
    });

    it('应该支持限制结果数量', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      for (let i = 0; i < 10; i++) {
        await linkMemory.createLink({
          id: `link-${i}`,
          timestamp: new Date().toISOString(),
          files: ['src/test.ts'],
          symbols: [],
          commits: [],
          topics: [],
          description: `链接${i}`,
          importance: MemoryImportance.LOW,
          relatedLinks: [],
        });
      }

      const results = await linkMemory.query({
        files: ['src/test.ts'],
        limit: 5,
      });

      expect(results.length).toBe(5);
    });
  });

  describe('关系管理', () => {
    it('应该建立双向关联', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'link-a',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '链接A',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-b',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '链接B',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      const result = await linkMemory.linkRelated('link-a', 'link-b');
      expect(result).toBe(true);

      const linkA = await linkMemory.getLink('link-a');
      const linkB = await linkMemory.getLink('link-b');

      expect(linkA?.relatedLinks).toContain('link-b');
      expect(linkB?.relatedLinks).toContain('link-a');
    });

    it('应该获取相关链接', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'link-main',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '主链接',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-related',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '相关链接',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.linkRelated('link-main', 'link-related');

      const related = await linkMemory.getRelated('link-main');
      expect(related.length).toBe(1);
      expect(related[0].id).toBe('link-related');
    });

    it('应该解除关联', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'link-x',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '链接X',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-y',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '链接Y',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.linkRelated('link-x', 'link-y');
      await linkMemory.unlinkRelated('link-x', 'link-y');

      const linkX = await linkMemory.getLink('link-x');
      const linkY = await linkMemory.getLink('link-y');

      expect(linkX?.relatedLinks).not.toContain('link-y');
      expect(linkY?.relatedLinks).not.toContain('link-x');
    });

    it('应该查找共同属性', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'link-1',
        timestamp: new Date().toISOString(),
        files: ['src/a.ts', 'src/b.ts'],
        symbols: ['funcA', 'funcB'],
        commits: [],
        topics: ['topic1', 'topic2'],
        description: '链接1',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-2',
        timestamp: new Date().toISOString(),
        files: ['src/b.ts', 'src/c.ts'],
        symbols: ['funcB', 'funcC'],
        commits: [],
        topics: ['topic2', 'topic3'],
        description: '链接2',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      const connections = await linkMemory.findConnections('link-1', 'link-2');

      expect(connections.commonFiles).toContain('src/b.ts');
      expect(connections.commonSymbols).toContain('funcB');
      expect(connections.commonTopics).toContain('topic2');
    });
  });

  describe('更新和删除', () => {
    it('应该更新链接', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'update-test',
        timestamp: new Date().toISOString(),
        files: ['old.ts'],
        symbols: ['oldFunc'],
        commits: [],
        topics: ['old-topic'],
        description: '原始描述',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.updateLink('update-test', {
        files: ['new.ts'],
        description: '更新后的描述',
        importance: MemoryImportance.HIGH,
      });

      const link = await linkMemory.getLink('update-test');
      expect(link?.files).toContain('new.ts');
      expect(link?.description).toBe('更新后的描述');
      expect(link?.importance).toBe(MemoryImportance.HIGH);

      // 检查索引更新
      const byOldFile = await linkMemory.findByFile('old.ts');
      const byNewFile = await linkMemory.findByFile('new.ts');

      expect(byOldFile.length).toBe(0);
      expect(byNewFile.length).toBe(1);
    });

    it('应该删除链接', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'delete-test',
        timestamp: new Date().toISOString(),
        files: ['delete.ts'],
        symbols: ['deleteFunc'],
        commits: [],
        topics: ['delete-topic'],
        description: '待删除链接',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      const result = await linkMemory.removeLink('delete-test');
      expect(result).toBe(true);

      const link = await linkMemory.getLink('delete-test');
      expect(link).toBeNull();

      // 检查索引清理
      const byFile = await linkMemory.findByFile('delete.ts');
      const bySymbol = await linkMemory.findBySymbol('deleteFunc');
      const byTopic = await linkMemory.findByTopic('delete-topic');

      expect(byFile.length).toBe(0);
      expect(bySymbol.length).toBe(0);
      expect(byTopic.length).toBe(0);
    });

    it('删除不存在的链接应返回 false', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);
      const result = await linkMemory.removeLink('nonexistent');
      expect(result).toBe(false);
    });

    it('删除链接应清理相关引用', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'link-to-delete',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '待删除',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'link-with-ref',
        timestamp: new Date().toISOString(),
        files: [],
        symbols: [],
        commits: [],
        topics: [],
        description: '有引用',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.linkRelated('link-to-delete', 'link-with-ref');
      await linkMemory.removeLink('link-to-delete');

      const linkWithRef = await linkMemory.getLink('link-with-ref');
      expect(linkWithRef?.relatedLinks).not.toContain('link-to-delete');
    });
  });

  describe('持久化', () => {
    it('应该持久化到文件', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'persist-test',
        timestamp: new Date().toISOString(),
        files: ['persist.ts'],
        symbols: ['persistFunc'],
        commits: [],
        topics: ['持久化'],
        description: '持久化测试',
        importance: MemoryImportance.MEDIUM,
        relatedLinks: [],
      });

      // 创建新实例，应该能加载之前保存的数据
      const newLinkMemory = new LinkMemory(TEST_PROJECT_DIR);
      const link = await newLinkMemory.getLink('persist-test');

      expect(link).not.toBeNull();
      expect(link?.description).toBe('持久化测试');
    });

    it('应该正确恢复索引', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'index-test',
        timestamp: new Date().toISOString(),
        files: ['index.ts'],
        symbols: ['indexFunc'],
        commits: [],
        topics: ['索引'],
        description: '索引测试',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      // 创建新实例
      const newLinkMemory = new LinkMemory(TEST_PROJECT_DIR);

      const byFile = await newLinkMemory.findByFile('index.ts');
      const bySymbol = await newLinkMemory.findBySymbol('indexFunc');
      const byTopic = await newLinkMemory.findByTopic('索引');

      expect(byFile.length).toBe(1);
      expect(bySymbol.length).toBe(1);
      expect(byTopic.length).toBe(1);
    });
  });

  describe('重建索引', () => {
    it('应该重建所有索引', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'rebuild-test',
        timestamp: new Date().toISOString(),
        files: ['rebuild.ts'],
        symbols: ['rebuildFunc'],
        commits: [],
        topics: ['重建'],
        description: '重建测试',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.rebuildIndexes();

      const byFile = await linkMemory.findByFile('rebuild.ts');
      expect(byFile.length).toBe(1);
    });
  });

  describe('统计信息', () => {
    it('应该返回正确的统计信息', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'stats-1',
        timestamp: new Date().toISOString(),
        files: ['a.ts', 'b.ts'],
        symbols: ['funcA', 'funcB'],
        commits: [],
        topics: ['topic1'],
        description: '统计测试1',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      await linkMemory.createLink({
        id: 'stats-2',
        timestamp: new Date().toISOString(),
        files: ['c.ts'],
        symbols: ['funcC'],
        commits: [],
        topics: ['topic2'],
        description: '统计测试2',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      const stats = linkMemory.getStats();

      expect(stats.totalLinks).toBe(2);
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSymbols).toBe(3);
      expect(stats.totalTopics).toBe(2);
      expect(stats.oldestLink).toBeDefined();
      expect(stats.newestLink).toBeDefined();
    });
  });

  describe('工厂函数', () => {
    it('应该缓存实例', () => {
      const instance1 = getLinkMemory(TEST_PROJECT_DIR);
      const instance2 = getLinkMemory(TEST_PROJECT_DIR);

      expect(instance1).toBe(instance2);
    });

    it('不同路径应返回不同实例', () => {
      const path1 = path.join(TEST_DIR, 'project1');
      const path2 = path.join(TEST_DIR, 'project2');

      fs.mkdirSync(path1, { recursive: true });
      fs.mkdirSync(path2, { recursive: true });

      const instance1 = getLinkMemory(path1);
      const instance2 = getLinkMemory(path2);

      expect(instance1).not.toBe(instance2);
    });

    it('重置缓存后应返回新实例', () => {
      const instance1 = getLinkMemory(TEST_PROJECT_DIR);
      resetLinkMemoryCache();
      const instance2 = getLinkMemory(TEST_PROJECT_DIR);

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('清空数据', () => {
    it('应该清空所有数据', async () => {
      const linkMemory = new LinkMemory(TEST_PROJECT_DIR);

      await linkMemory.createLink({
        id: 'clear-test',
        timestamp: new Date().toISOString(),
        files: ['clear.ts'],
        symbols: ['clearFunc'],
        commits: [],
        topics: ['清空'],
        description: '清空测试',
        importance: MemoryImportance.LOW,
        relatedLinks: [],
      });

      linkMemory.clear();

      const stats = linkMemory.getStats();
      expect(stats.totalLinks).toBe(0);
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);
      expect(stats.totalTopics).toBe(0);
    });
  });
});
