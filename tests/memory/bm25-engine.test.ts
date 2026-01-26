/**
 * BM25 搜索引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Engine, tokenize, createBM25Engine } from '../../src/memory/bm25-engine.js';

describe('BM25Engine', () => {
  let engine: BM25Engine;

  beforeEach(() => {
    engine = new BM25Engine();
  });

  describe('tokenize', () => {
    it('应该正确分词英文', () => {
      const tokens = tokenize('Hello World Test');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
      expect(tokens).toContain('test');
    });

    it('应该过滤停用词', () => {
      const tokens = tokenize('the quick brown fox');
      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('应该正确分词中文', () => {
      const tokens = tokenize('这是一个测试');
      // 单字
      expect(tokens).toContain('测');
      expect(tokens).toContain('试');
      // 2-gram
      expect(tokens).toContain('测试');
    });

    it('应该处理混合中英文', () => {
      const tokens = tokenize('Hello 世界 Test 测试');
      expect(tokens).toContain('hello');
      expect(tokens).toContain('test');
      expect(tokens).toContain('世界');
      expect(tokens).toContain('测试');
    });

    it('应该处理数字', () => {
      const tokens = tokenize('BM25 algorithm version 2.0');
      expect(tokens).toContain('bm');
      expect(tokens).toContain('25');
      expect(tokens).toContain('algorithm');
    });
  });

  describe('addDocument & search', () => {
    it('应该能添加和搜索文档', () => {
      engine.addDocument({ id: '1', text: '这是第一个关于机器学习的文档' });
      engine.addDocument({ id: '2', text: '这是第二个关于深度学习的文档' });
      engine.addDocument({ id: '3', text: '这是第三个关于自然语言处理的文档' });

      const results = engine.search('机器学习');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('1');
    });

    it('BM25 应该给稀有词更高权重', () => {
      // 添加多个包含"文档"的文档，但只有一个包含"机器学习"
      engine.addDocument({ id: '1', text: '机器学习是人工智能的一个分支' });
      engine.addDocument({ id: '2', text: '文档处理系统' });
      engine.addDocument({ id: '3', text: '文档管理' });
      engine.addDocument({ id: '4', text: '文档存储' });

      const results = engine.search('机器学习');

      // 包含稀有词"机器学习"的文档应该排在前面
      expect(results[0].id).toBe('1');
    });

    it('应该支持多字段搜索', () => {
      engine.addDocument({
        id: '1',
        text: '普通的摘要内容',
        fields: {
          topics: 'TypeScript React',
          files: 'index.ts',
        },
      });

      engine.addDocument({
        id: '2',
        text: 'TypeScript 是一种编程语言',
        fields: {
          topics: 'JavaScript',
          files: 'app.js',
        },
      });

      // 搜索话题
      const results = engine.search('TypeScript');
      expect(results.length).toBe(2);
    });

    it('应该返回匹配的词项', () => {
      engine.addDocument({ id: '1', text: '机器学习和深度学习' });

      const results = engine.search('机器学习');

      expect(results[0].matchedTerms.length).toBeGreaterThan(0);
    });
  });

  describe('buildIndex', () => {
    it('应该在搜索前自动构建索引', () => {
      engine.addDocument({ id: '1', text: 'test document' });

      // 不手动调用 buildIndex，直接搜索
      const results = engine.search('test');
      expect(results.length).toBeGreaterThan(0);
    });

    it('应该计算正确的统计信息', () => {
      engine.addDocument({ id: '1', text: 'short' });
      engine.addDocument({ id: '2', text: 'this is a longer document with more words' });
      engine.buildIndex();

      const stats = engine.getStats();
      expect(stats.documentCount).toBe(2);
      expect(stats.vocabularySize).toBeGreaterThan(0);
      expect(stats.avgDocLength).toBeGreaterThan(0);
      expect(stats.isIndexBuilt).toBe(true);
    });
  });

  describe('removeDocument', () => {
    it('应该能移除文档', () => {
      engine.addDocument({ id: '1', text: 'test one' });
      engine.addDocument({ id: '2', text: 'test two' });

      engine.removeDocument('1');
      engine.buildIndex();

      expect(engine.getDocumentCount()).toBe(1);
    });
  });

  describe('clear', () => {
    it('应该清空所有文档', () => {
      engine.addDocument({ id: '1', text: 'test one' });
      engine.addDocument({ id: '2', text: 'test two' });

      engine.clear();

      expect(engine.getDocumentCount()).toBe(0);
      expect(engine.getVocabularySize()).toBe(0);
    });
  });

  describe('export/import', () => {
    it('应该能导出和导入索引', () => {
      engine.addDocument({ id: '1', text: 'machine learning' });
      engine.addDocument({ id: '2', text: 'deep learning' });
      engine.buildIndex();

      const exported = engine.exportIndex();

      const newEngine = new BM25Engine();
      newEngine.importIndex(exported);

      expect(newEngine.getDocumentCount()).toBe(2);

      const results = newEngine.search('machine');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('1');
    });
  });

  describe('createBM25Engine factory', () => {
    it('应该创建引擎实例', () => {
      const engine = createBM25Engine({ k1: 1.5, b: 0.8 });
      expect(engine).toBeInstanceOf(BM25Engine);
    });
  });
});
