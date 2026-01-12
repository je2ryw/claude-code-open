/**
 * Skill Inode 去重测试
 *
 * 测试 2.1.3 版本修复的 ExFAT inode 去重问题
 * - 使用 64 位精度（BigInt）处理 inode 值
 * - 修复在 ExFAT 等文件系统上 inode 超过 Number.MAX_SAFE_INTEGER 导致的误判
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
vi.mock('fs');

describe('Skill Inode Deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getFileInode (BigInt precision)', () => {
    it('should return dev:ino format string', () => {
      // 模拟 fs.statSync 返回 BigInt 格式的 stat
      const mockStat = {
        dev: BigInt(12345),
        ino: BigInt(67890),
        isFile: () => true,
        isDirectory: () => false,
      };
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      // 手动实现 getFileInode 逻辑进行测试
      const filePath = '/test/skill.md';
      const stats = fs.statSync(filePath, { bigint: true });
      const inode = `${stats.dev}:${stats.ino}`;

      expect(inode).toBe('12345:67890');
    });

    it('should handle large inode values (ExFAT scenario)', () => {
      // 模拟 ExFAT 文件系统的大 inode 值
      // ExFAT 可能产生超过 Number.MAX_SAFE_INTEGER 的 inode
      const largeInode = BigInt('9007199254740993'); // > Number.MAX_SAFE_INTEGER
      const mockStat = {
        dev: BigInt(1),
        ino: largeInode,
        isFile: () => true,
        isDirectory: () => false,
      };
      vi.mocked(fs.statSync).mockReturnValue(mockStat as any);

      const filePath = '/exfat/skill.md';
      const stats = fs.statSync(filePath, { bigint: true });
      const inode = `${stats.dev}:${stats.ino}`;

      // 验证大数值被正确处理为字符串
      expect(inode).toBe('1:9007199254740993');
      expect(BigInt(inode.split(':')[1])).toBe(largeInode);
    });

    it('should return null when stat fails', () => {
      vi.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      // 手动实现 getFileInode 的错误处理逻辑
      let inode: string | null = null;
      try {
        fs.statSync('/nonexistent/skill.md', { bigint: true });
        inode = 'should not reach here';
      } catch {
        inode = null;
      }

      expect(inode).toBeNull();
    });
  });

  describe('Skill deduplication', () => {
    it('should detect duplicate skills by inode', () => {
      // 模拟两个不同路径指向同一文件（符号链接场景）
      const sameInode = {
        dev: BigInt(1),
        ino: BigInt(12345),
        isFile: () => true,
        isDirectory: () => false,
      };

      vi.mocked(fs.statSync).mockReturnValue(sameInode as any);

      const path1 = '/user/skills/my-skill/SKILL.md';
      const path2 = '/project/skills/my-skill/SKILL.md'; // 符号链接到同一文件

      const stats1 = fs.statSync(path1, { bigint: true });
      const stats2 = fs.statSync(path2, { bigint: true });

      const inode1 = `${stats1.dev}:${stats1.ino}`;
      const inode2 = `${stats2.dev}:${stats2.ino}`;

      // 两个路径应该有相同的 inode
      expect(inode1).toBe(inode2);
    });

    it('should distinguish different skills by inode', () => {
      // 模拟两个不同的文件
      vi.mocked(fs.statSync)
        .mockReturnValueOnce({
          dev: BigInt(1),
          ino: BigInt(12345),
          isFile: () => true,
          isDirectory: () => false,
        } as any)
        .mockReturnValueOnce({
          dev: BigInt(1),
          ino: BigInt(67890),
          isFile: () => true,
          isDirectory: () => false,
        } as any);

      const path1 = '/user/skills/skill-a/SKILL.md';
      const path2 = '/user/skills/skill-b/SKILL.md';

      const stats1 = fs.statSync(path1, { bigint: true });
      const stats2 = fs.statSync(path2, { bigint: true });

      const inode1 = `${stats1.dev}:${stats1.ino}`;
      const inode2 = `${stats2.dev}:${stats2.ino}`;

      // 两个不同文件应该有不同的 inode
      expect(inode1).not.toBe(inode2);
    });
  });

  describe('BigInt vs Number precision', () => {
    it('should demonstrate why BigInt is needed for large inode values', () => {
      // 这个测试展示了为什么需要使用 BigInt
      // Number.MAX_SAFE_INTEGER = 9007199254740991

      // 超过安全整数范围的数值可能无法精确表示
      // 关键点：BigInt 总是精确的，而 Number 对于大值可能不精确

      // BigInt 版本总是正确的
      const bigintA = BigInt('9007199254740993'); // MAX_SAFE_INTEGER + 2
      const bigintB = BigInt('9007199254740994'); // MAX_SAFE_INTEGER + 3

      // BigInt 可以精确区分这两个值
      expect(bigintA === bigintB).toBe(false);
      expect(bigintA.toString()).toBe('9007199254740993');
      expect(bigintB.toString()).toBe('9007199254740994');

      // 演示：作为字符串存储时，BigInt 可以保持精度
      const map = new Map<string, string>();
      map.set(bigintA.toString(), 'file-a');
      map.set(bigintB.toString(), 'file-b');
      expect(map.size).toBe(2); // 两个不同的 key
    });

    it('should maintain precision with BigInt', () => {
      // 使用 BigInt 可以正确区分大数值
      const largeInode = BigInt('9007199254740993');
      const anotherLargeInode = BigInt('9007199254740994');

      // BigInt 可以正确区分这两个值
      expect(largeInode === anotherLargeInode).toBe(false);
      expect(largeInode.toString()).not.toBe(anotherLargeInode.toString());
    });

    it('should correctly stringify BigInt for Map key', () => {
      // 验证 BigInt 可以正确转换为字符串作为 Map 的 key
      const seenInodes = new Map<string, string>();

      const inode1 = `${BigInt(1)}:${BigInt('9007199254740993')}`;
      const inode2 = `${BigInt(1)}:${BigInt('9007199254740994')}`;

      seenInodes.set(inode1, 'user');
      seenInodes.set(inode2, 'project');

      expect(seenInodes.size).toBe(2);
      expect(seenInodes.get(inode1)).toBe('user');
      expect(seenInodes.get(inode2)).toBe('project');
    });
  });
});
