/**
 * Language Configuration Tests
 * 验证 language 配置功能（v2.1.0+）
 *
 * 官方 changelog：
 * "Added language setting to configure Claude's response language (e.g., language: \"japanese\")"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigManager } from '../src/config/index.js';
import { SystemPromptBuilder } from '../src/prompt/builder.js';
import type { PromptContext } from '../src/prompt/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 测试配置目录
const TEST_CONFIG_DIR = path.join(os.tmpdir(), 'claude-test-language-config');
const TEST_GLOBAL_CONFIG = path.join(TEST_CONFIG_DIR, 'settings.json');

describe('Language Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };

    // 清理测试目录
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

    // 设置测试配置目录
    process.env.CLAUDE_CONFIG_DIR = TEST_CONFIG_DIR;
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;

    // 清理测试目录
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  describe('Config Schema', () => {
    it('should accept valid language setting', () => {
      fs.writeFileSync(
        TEST_GLOBAL_CONFIG,
        JSON.stringify({
          language: 'japanese'
        })
      );

      const manager = new ConfigManager();
      const config = manager.getAll();

      expect(config.language).toBe('japanese');
    });

    it('should accept various language values', () => {
      const languages = ['english', 'chinese', 'korean', 'spanish', 'french', 'german'];

      for (const lang of languages) {
        fs.writeFileSync(
          TEST_GLOBAL_CONFIG,
          JSON.stringify({ language: lang })
        );

        const manager = new ConfigManager();
        expect(manager.getAll().language).toBe(lang);
      }
    });

    it('should default to undefined when not set', () => {
      const manager = new ConfigManager();
      const config = manager.getAll();

      expect(config.language).toBeUndefined();
    });
  });

  describe('Environment Variable', () => {
    it('should read language from CLAUDE_CODE_LANGUAGE env var', () => {
      process.env.CLAUDE_CODE_LANGUAGE = 'chinese';

      const manager = new ConfigManager();
      const config = manager.getAll();

      expect(config.language).toBe('chinese');
    });

    it('should override config file with env var', () => {
      // 设置配置文件
      fs.writeFileSync(
        TEST_GLOBAL_CONFIG,
        JSON.stringify({ language: 'japanese' })
      );

      // 设置环境变量
      process.env.CLAUDE_CODE_LANGUAGE = 'chinese';

      const manager = new ConfigManager();
      const config = manager.getAll();

      // 环境变量应该覆盖配置文件
      expect(config.language).toBe('chinese');
    });
  });

  describe('System Prompt Integration', () => {
    it('should add language instruction to system prompt when language is set', async () => {
      const builder = new SystemPromptBuilder();
      builder.clearCache(); // 清除缓存

      const context: PromptContext = {
        workingDir: '/test',
        language: 'japanese'
      };

      const result = await builder.build(context, { enableCache: false });

      // 验证系统提示词包含语言指令
      expect(result.content).toContain('# Language');
      expect(result.content).toContain('Always respond in japanese');
      expect(result.content).toContain('Use japanese for all explanations');
      expect(result.content).toContain('Technical terms and code identifiers should remain in their original form');
    });

    it('should not add language instruction when language is not set', async () => {
      const builder = new SystemPromptBuilder();
      builder.clearCache(); // 清除缓存

      const context: PromptContext = {
        workingDir: '/test'
        // language is not set
      };

      const result = await builder.build(context, { enableCache: false });

      // 不应该包含 "Always respond in" 语言指令部分
      // 注意：只检查 "Always respond in" 而不是 "# Language"，因为可能有其他模块使用这个标题
      expect(result.content).not.toMatch(/Always respond in \w+\. Use \w+ for all explanations/);
    });

    it('should handle different languages correctly', async () => {
      const builder = new SystemPromptBuilder();
      const languages = ['chinese', 'korean', 'spanish', 'french'];

      for (const lang of languages) {
        const context: PromptContext = {
          workingDir: '/test',
          language: lang
        };

        const result = await builder.build(context, { enableCache: false });

        expect(result.content).toContain(`Always respond in ${lang}`);
        expect(result.content).toContain(`Use ${lang} for all explanations`);
      }
    });
  });

  describe('Config Export/Import', () => {
    it('should export language setting correctly', () => {
      fs.writeFileSync(
        TEST_GLOBAL_CONFIG,
        JSON.stringify({ language: 'japanese' })
      );

      const manager = new ConfigManager();
      const exported = JSON.parse(manager.export());

      expect(exported.language).toBe('japanese');
    });

    it('should import language setting correctly', () => {
      const manager = new ConfigManager();

      const configToImport = JSON.stringify({
        version: '2.1.4',
        language: 'korean'
      });

      const result = manager.import(configToImport);
      expect(result).toBe(true);

      const config = manager.getAll();
      expect(config.language).toBe('korean');
    });
  });

  describe('Config Source Tracking', () => {
    it('should track language setting source from config file', () => {
      fs.writeFileSync(
        TEST_GLOBAL_CONFIG,
        JSON.stringify({ language: 'japanese' })
      );

      const manager = new ConfigManager();
      const source = manager.getConfigSource('language');

      expect(source).toBe('userSettings');
    });

    it('should track language setting source from env var', () => {
      process.env.CLAUDE_CODE_LANGUAGE = 'chinese';

      const manager = new ConfigManager();
      const source = manager.getConfigSource('language');

      expect(source).toBe('envSettings');
    });
  });
});
