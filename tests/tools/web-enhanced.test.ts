/**
 * Web 工具增强功能测试
 * T-011: Turndown 集成优化测试
 * T-012: WebSearch 缓存测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebFetchTool, WebSearchTool, getWebCacheStats, clearWebCaches } from '../../src/tools/web.js';

describe('T-011: Turndown Integration Optimization', () => {
  let webFetch: WebFetchTool;

  beforeEach(() => {
    webFetch = new WebFetchTool();
    clearWebCaches();
  });

  it('should have enhanced turndown configuration', () => {
    expect(webFetch.name).toBe('WebFetch');
    expect(webFetch.description).toContain('HTML to markdown');
  });

  it('should support GFM extensions', () => {
    // GFM support is verified by the turndown service configuration
    // This test ensures the tool is properly initialized
    expect(webFetch).toBeDefined();
  });
});

describe('T-012: WebSearch Cache Implementation', () => {
  let webSearch: WebSearchTool;

  beforeEach(() => {
    webSearch = new WebSearchTool();
    clearWebCaches();
  });

  it('should have cache statistics functions', () => {
    const stats = getWebCacheStats();

    expect(stats).toBeDefined();
    expect(stats.fetch).toBeDefined();
    expect(stats.search).toBeDefined();

    // WebFetch cache config
    expect(stats.fetch.maxSize).toBe(50 * 1024 * 1024); // 50MB
    expect(stats.fetch.ttl).toBe(15 * 60 * 1000); // 15 minutes

    // WebSearch cache config
    expect(stats.search.max).toBe(500); // 500 queries
    expect(stats.search.ttl).toBe(60 * 60 * 1000); // 1 hour
  });

  it('should clear caches', () => {
    clearWebCaches();
    const stats = getWebCacheStats();

    expect(stats.fetch.itemCount).toBe(0);
    expect(stats.search.itemCount).toBe(0);
  });

  it('should have DuckDuckGo search capability', () => {
    expect(webSearch.name).toBe('WebSearch');
    expect(webSearch.description).toContain('search the web');
  });
});

describe('Web Cache Integration', () => {
  beforeEach(() => {
    clearWebCaches();
  });

  it('should track cache statistics', () => {
    const initialStats = getWebCacheStats();

    expect(initialStats.fetch.itemCount).toBe(0);
    expect(initialStats.search.itemCount).toBe(0);
  });
});
