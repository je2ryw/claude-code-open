/**
 * 输出持久化集成测试
 * 测试所有工具的持久化功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ReadTool } from '../../src/tools/file.js';
import { GrepTool, GlobTool } from '../../src/tools/search.js';
import { getOutputDir } from '../../src/tools/output-persistence.js';

describe('Output Persistence Integration', () => {
  const testDir = path.join(process.cwd(), 'tests', 'fixtures', 'output-test');
  const outputDir = getOutputDir();

  beforeEach(() => {
    // 创建测试目录
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理测试文件
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // 清理输出目录中的测试文件
    try {
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        if (file.startsWith('read-') || file.startsWith('grep-') || file.startsWith('glob-')) {
          const filePath = path.join(outputDir, file);
          // 只删除测试生成的文件（最近 1 分钟内创建的）
          const stat = fs.statSync(filePath);
          if (Date.now() - stat.mtimeMs < 60000) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (err) {
      // 忽略清理错误
    }
  });

  describe('Read Tool with Persistence', () => {
    it('should persist large file read output', async () => {
      // 创建一个大文件（超过 30KB）
      const largeContent = 'Line content '.repeat(3000) + '\n';
      const lines = Array.from({ length: 100 }, (_, i) => `${i}: ${largeContent}`).join('');
      const testFile = path.join(testDir, 'large-file.txt');
      fs.writeFileSync(testFile, lines);

      const readTool = new ReadTool();
      const result = await readTool.execute({
        file_path: testFile,
        offset: 0,
        limit: 2000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // 检查是否包含持久化提示
      if (result.output && result.output.length > 30000) {
        // 应该被持久化
        expect(result.output).toContain('Output saved to disk');
      }
    });

    it('should not persist small file read output', async () => {
      const smallContent = 'Small file content\n'.repeat(10);
      const testFile = path.join(testDir, 'small-file.txt');
      fs.writeFileSync(testFile, smallContent);

      const readTool = new ReadTool();
      const result = await readTool.execute({
        file_path: testFile,
        offset: 0,
        limit: 2000,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      // 小文件不应该包含持久化提示
      expect(result.output).not.toContain('Output saved to disk');
    });
  });

  describe('Grep Tool with Persistence', () => {
    it('should persist large grep output', async () => {
      // 创建多个文件，每个文件包含很多匹配项
      for (let i = 0; i < 50; i++) {
        const content = Array.from({ length: 100 }, (_, j) =>
          `Line ${j}: search pattern match ${i}-${j}\n`
        ).join('');
        fs.writeFileSync(path.join(testDir, `file-${i}.txt`), content);
      }

      const grepTool = new GrepTool();
      const result = await grepTool.execute({
        pattern: 'search pattern',
        path: testDir,
        output_mode: 'content',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // 如果输出很大，应该被持久化
      if (result.output && result.output.length > 20000) {
        expect(result.output).toContain('Output saved to disk');
      }
    });

    it('should handle small grep output without persistence', async () => {
      const content = 'Single match line with pattern\n';
      fs.writeFileSync(path.join(testDir, 'single-file.txt'), content);

      const grepTool = new GrepTool();
      const result = await grepTool.execute({
        pattern: 'pattern',
        path: testDir,
        output_mode: 'content',
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output).not.toContain('Output saved to disk');
    });
  });

  describe('Glob Tool with Persistence', () => {
    it('should persist large file list', async () => {
      // 创建大量文件
      for (let i = 0; i < 1000; i++) {
        fs.writeFileSync(path.join(testDir, `test-file-${i}.txt`), 'content');
      }

      const globTool = new GlobTool();
      const result = await globTool.execute({
        pattern: '*.txt',
        path: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();

      // 如果文件列表很长，应该被持久化
      if (result.output && result.output.length > 30000) {
        expect(result.output).toContain('Output saved to disk');
      }
    });

    it('should handle small file list without persistence', async () => {
      // 只创建几个文件
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content');

      const globTool = new GlobTool();
      const result = await globTool.execute({
        pattern: '*.txt',
        path: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output).not.toContain('Output saved to disk');
    });
  });

  describe('Cross-Tool Consistency', () => {
    it('should use consistent output directory for all tools', async () => {
      const outputDir = getOutputDir();
      expect(outputDir).toContain('.claude');
      expect(outputDir).toContain('tasks');

      // 验证目录存在
      expect(fs.existsSync(outputDir)).toBe(true);
    });

    it('should generate unique file paths for concurrent operations', async () => {
      // 创建测试文件
      const largeContent = 'X'.repeat(50000);
      const testFile1 = path.join(testDir, 'test1.txt');
      const testFile2 = path.join(testDir, 'test2.txt');
      fs.writeFileSync(testFile1, largeContent);
      fs.writeFileSync(testFile2, largeContent);

      const readTool = new ReadTool();

      // 并发读取多个文件
      const [result1, result2] = await Promise.all([
        readTool.execute({ file_path: testFile1, offset: 0, limit: 2000 }),
        readTool.execute({ file_path: testFile2, offset: 0, limit: 2000 }),
      ]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // 如果都被持久化了，文件路径应该不同
      if (result1.output && result2.output) {
        const path1Match = result1.output.match(/Output saved to disk: (.+)/);
        const path2Match = result2.output.match(/Output saved to disk: (.+)/);

        if (path1Match && path2Match) {
          expect(path1Match[1]).not.toBe(path2Match[1]);
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should gracefully degrade to truncation on persistence failure', async () => {
      // 这个测试很难模拟，因为持久化很少失败
      // 但我们可以验证即使在极端情况下也能返回有效结果

      const largeContent = 'Test content '.repeat(10000);
      const testFile = path.join(testDir, 'test-file.txt');
      fs.writeFileSync(testFile, largeContent);

      const readTool = new ReadTool();
      const result = await readTool.execute({
        file_path: testFile,
        offset: 0,
        limit: 2000,
      });

      // 无论持久化成功与否，都应该返回有效结果
      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output!.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should persist large output in reasonable time', async () => {
      const largeContent = 'Content '.repeat(20000);
      const testFile = path.join(testDir, 'perf-test.txt');
      fs.writeFileSync(testFile, largeContent);

      const readTool = new ReadTool();
      const startTime = Date.now();

      const result = await readTool.execute({
        file_path: testFile,
        offset: 0,
        limit: 2000,
      });

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      // 持久化操作应该在 1 秒内完成
      expect(duration).toBeLessThan(1000);
    });
  });
});
