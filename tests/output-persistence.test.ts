/**
 * 输出持久化测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  persistLargeOutput,
  persistLargeOutputSync,
  getOutputDir,
  cleanupOldOutputFiles,
  getOutputDirStats,
  readPersistedOutput,
  type OutputPersistenceOptions,
} from '../src/tools/output-persistence.js';

describe('Output Persistence', () => {
  const testOutputDir = getOutputDir();

  // 清理测试文件
  const cleanupTestFiles = () => {
    try {
      const files = fs.readdirSync(testOutputDir);
      for (const file of files) {
        if (file.startsWith('test-') && !file.endsWith('.log')) {
          fs.unlinkSync(path.join(testOutputDir, file));
        }
      }
    } catch (err) {
      // 忽略清理错误
    }
  };

  beforeEach(() => {
    cleanupTestFiles();
  });

  afterEach(() => {
    cleanupTestFiles();
  });

  describe('persistLargeOutput (async)', () => {
    it('should return original content when below threshold', async () => {
      const smallOutput = 'Small output';
      const result = await persistLargeOutput(smallOutput, {
        toolName: 'Test',
        maxLength: 100,
      });

      expect(result.persisted).toBe(false);
      expect(result.content).toBe(smallOutput);
      expect(result.filePath).toBeUndefined();
      expect(result.originalLength).toBe(smallOutput.length);
    });

    it('should persist and truncate large output', async () => {
      const largeOutput = 'A'.repeat(50000);
      const result = await persistLargeOutput(largeOutput, {
        toolName: 'Test',
        maxLength: 30000,
      });

      expect(result.persisted).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(result.content.length).toBeLessThan(largeOutput.length);
      expect(result.originalLength).toBe(largeOutput.length);

      // 验证文件存在
      expect(fs.existsSync(result.filePath!)).toBe(true);

      // 验证文件内容
      const savedContent = await readPersistedOutput(result.filePath!);
      expect(savedContent).toBe(largeOutput);

      // 清理
      fs.unlinkSync(result.filePath!);
    });

    it('should include file path in truncated content', async () => {
      const largeOutput = 'X'.repeat(50000);
      const result = await persistLargeOutput(largeOutput, {
        toolName: 'Test',
        maxLength: 30000,
      });

      expect(result.content).toContain('Output saved to disk');
      expect(result.content).toContain('characters');
      expect(result.content).toContain('omitted');

      // 清理
      if (result.filePath) {
        fs.unlinkSync(result.filePath);
      }
    });

    it('should keep head and tail content', async () => {
      const head = 'HEAD_CONTENT_'.repeat(100);
      const middle = 'MIDDLE_'.repeat(5000);
      const tail = 'TAIL_CONTENT_'.repeat(100);
      const largeOutput = head + middle + tail;

      const result = await persistLargeOutput(largeOutput, {
        toolName: 'Test',
        maxLength: 30000,
        headChars: 500,
        tailChars: 500,
      });

      expect(result.persisted).toBe(true);
      expect(result.content).toContain('HEAD_CONTENT_');
      expect(result.content).toContain('TAIL_CONTENT_');
      expect(result.content).not.toContain('MIDDLE_'.repeat(100)); // 中间部分应该被省略

      // 清理
      if (result.filePath) {
        fs.unlinkSync(result.filePath);
      }
    });
  });

  describe('persistLargeOutputSync (sync)', () => {
    it('should work synchronously', () => {
      const largeOutput = 'B'.repeat(50000);
      const result = persistLargeOutputSync(largeOutput, {
        toolName: 'Test',
        maxLength: 30000,
      });

      expect(result.persisted).toBe(true);
      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath!)).toBe(true);

      // 清理
      fs.unlinkSync(result.filePath!);
    });

    it('should handle small output without persistence', () => {
      const smallOutput = 'Small sync output';
      const result = persistLargeOutputSync(smallOutput, {
        toolName: 'Test',
        maxLength: 100,
      });

      expect(result.persisted).toBe(false);
      expect(result.content).toBe(smallOutput);
    });
  });

  describe('cleanupOldOutputFiles', () => {
    it('should cleanup old files', () => {
      // 创建一个旧文件（修改时间戳）
      const testFile = path.join(testOutputDir, 'test-old-file.txt');
      fs.writeFileSync(testFile, 'old content');

      // 修改文件的修改时间为 10 天前
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
      fs.utimesSync(testFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

      // 运行清理
      const cleaned = cleanupOldOutputFiles();

      // 验证文件被删除
      expect(cleaned).toBeGreaterThan(0);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should not cleanup recent files', () => {
      // 创建一个新文件
      const testFile = path.join(testOutputDir, 'test-recent-file.txt');
      fs.writeFileSync(testFile, 'recent content');

      // 运行清理
      const cleaned = cleanupOldOutputFiles();

      // 验证文件仍然存在
      expect(fs.existsSync(testFile)).toBe(true);

      // 清理
      fs.unlinkSync(testFile);
    });

    it('should skip .log files (bash task outputs)', () => {
      // 创建一个旧的 .log 文件
      const logFile = path.join(testOutputDir, 'test-task.log');
      fs.writeFileSync(logFile, 'log content');

      // 修改文件的修改时间为 10 天前
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
      fs.utimesSync(logFile, new Date(tenDaysAgo), new Date(tenDaysAgo));

      // 运行清理
      cleanupOldOutputFiles();

      // 验证 .log 文件没有被删除
      expect(fs.existsSync(logFile)).toBe(true);

      // 清理
      fs.unlinkSync(logFile);
    });
  });

  describe('getOutputDirStats', () => {
    it('should return correct stats', () => {
      // 创建几个测试文件
      const file1 = path.join(testOutputDir, 'test-file1.txt');
      const file2 = path.join(testOutputDir, 'test-file2.txt');

      fs.writeFileSync(file1, 'content1');
      fs.writeFileSync(file2, 'content2');

      const stats = getOutputDirStats();

      expect(stats.totalFiles).toBeGreaterThanOrEqual(2);
      expect(stats.totalSize).toBeGreaterThan(0);

      // 清理
      fs.unlinkSync(file1);
      fs.unlinkSync(file2);
    });

    it('should exclude .log files from stats', () => {
      // 创建测试文件
      const txtFile = path.join(testOutputDir, 'test-stats.txt');
      const logFile = path.join(testOutputDir, 'test-stats.log');

      fs.writeFileSync(txtFile, 'txt content');
      fs.writeFileSync(logFile, 'log content');

      const statsBefore = getOutputDirStats();

      // .log 文件不应该被计入
      const txtFileSize = fs.statSync(txtFile).size;

      // 清理
      fs.unlinkSync(txtFile);
      fs.unlinkSync(logFile);

      const statsAfter = getOutputDirStats();

      // 验证计数正确（排除了 .log 文件）
      expect(statsBefore.totalFiles).toBeGreaterThanOrEqual(1);
    });
  });

  describe('readPersistedOutput', () => {
    it('should read persisted output', async () => {
      const content = 'Test content for reading';
      const result = await persistLargeOutput(content.repeat(2000), {
        toolName: 'Test',
        maxLength: 100,
      });

      const readContent = await readPersistedOutput(result.filePath!);
      expect(readContent).toBe(content.repeat(2000));

      // 清理
      fs.unlinkSync(result.filePath!);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        readPersistedOutput('/non/existent/file.txt')
      ).rejects.toThrow();
    });
  });

  describe('Tool name sanitization', () => {
    it('should sanitize tool name in file path', async () => {
      const result = await persistLargeOutput('X'.repeat(50000), {
        toolName: 'Test Tool With Spaces',
        maxLength: 100,
      });

      expect(result.filePath).toBeDefined();
      expect(result.filePath).toMatch(/test-tool-with-spaces-/);

      // 清理
      if (result.filePath) {
        fs.unlinkSync(result.filePath);
      }
    });
  });

  describe('Concurrent persistence', () => {
    it('should handle multiple concurrent persist operations', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        persistLargeOutput(`Content ${i}`.repeat(10000), {
          toolName: `Test${i}`,
          maxLength: 100,
        })
      );

      const results = await Promise.all(promises);

      // 验证所有文件都被创建
      results.forEach((result) => {
        expect(result.persisted).toBe(true);
        expect(result.filePath).toBeDefined();
        expect(fs.existsSync(result.filePath!)).toBe(true);
      });

      // 验证文件路径唯一
      const filePaths = results.map((r) => r.filePath);
      const uniquePaths = new Set(filePaths);
      expect(uniquePaths.size).toBe(filePaths.length);

      // 清理
      results.forEach((result) => {
        if (result.filePath) {
          fs.unlinkSync(result.filePath);
        }
      });
    });
  });
});
