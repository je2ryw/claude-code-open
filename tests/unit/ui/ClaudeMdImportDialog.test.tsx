/**
 * CLAUDE.md 导入审批对话框测试
 * v2.1.6 新增
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanClaudeMdFiles, type ClaudeMdFile } from '../../../src/ui/components/ClaudeMdImportDialog.js';

// Mock fs module
vi.mock('fs');
vi.mock('os');

describe('ClaudeMdImportDialog', () => {
  const mockCwd = '/test/project';
  const mockHomeDir = '/home/user';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scanClaudeMdFiles', () => {
    it('should find project CLAUDE.md file', () => {
      // Setup mock
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockCwd, 'CLAUDE.md');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 100,
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('# Project CLAUDE.md\n\nSome content');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const files = scanClaudeMdFiles(mockCwd);

      expect(files).toHaveLength(1);
      expect(files[0].source).toBe('project');
      expect(files[0].path).toBe(path.join(mockCwd, 'CLAUDE.md'));
    });

    it('should detect .claude/CLAUDE.md', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockCwd, '.claude', 'CLAUDE.md');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 200,
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('# .claude CLAUDE.md\n');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const files = scanClaudeMdFiles(mockCwd);

      expect(files).toHaveLength(1);
      expect(files[0].source).toBe('project-dir');
    });

    it('should detect CLAUDE.local.md', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockCwd, 'CLAUDE.local.md');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 50,
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('# Local settings');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const files = scanClaudeMdFiles(mockCwd);

      expect(files).toHaveLength(1);
      expect(files[0].source).toBe('local');
    });

    it('should detect global user CLAUDE.md', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockHomeDir, '.claude', 'CLAUDE.md');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 150,
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('# Global settings');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const files = scanClaudeMdFiles(mockCwd);

      expect(files).toHaveLength(1);
      expect(files[0].source).toBe('user-global');
    });

    it('should detect rules in .claude/rules/', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockCwd, '.claude', 'rules');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 100,
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('# Rule content');
      vi.mocked(fs.readdirSync).mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr === path.join(mockCwd, '.claude', 'rules')) {
          return ['typescript.md', 'react.md'] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });

      const files = scanClaudeMdFiles(mockCwd);

      expect(files.filter(f => f.source === 'rules')).toHaveLength(2);
    });

    it('should validate file size limit (40KB)', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockCwd, 'CLAUDE.md');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 50 * 1024, // 50KB - exceeds limit
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue('# Large file');
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const files = scanClaudeMdFiles(mockCwd);

      expect(files).toHaveLength(1);
      expect(files[0].validationError).toBe('File exceeds 40KB limit');
    });

    it('should extract @include references', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        const pathStr = String(p);
        return pathStr === path.join(mockCwd, 'CLAUDE.md');
      });
      vi.mocked(fs.statSync).mockReturnValue({
        size: 200,
        mtime: new Date(),
      } as fs.Stats);
      vi.mocked(fs.readFileSync).mockReturnValue(`# Project CLAUDE.md

See @./docs/style-guide.md for style guidelines.
Also check @~/shared/common-rules.md for shared rules.
`);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const files = scanClaudeMdFiles(mockCwd);

      expect(files).toHaveLength(1);
      expect(files[0].includes).toContain('./docs/style-guide.md');
      expect(files[0].includes).toContain('~/shared/common-rules.md');
    });
  });

  describe('File source identification', () => {
    it('should correctly identify all source types', () => {
      const sourceTypes: Array<{ path: string; expectedSource: string }> = [
        { path: path.join(mockCwd, 'CLAUDE.md'), expectedSource: 'project' },
        { path: path.join(mockCwd, '.claude', 'CLAUDE.md'), expectedSource: 'project-dir' },
        { path: path.join(mockCwd, 'CLAUDE.local.md'), expectedSource: 'local' },
        { path: path.join(mockHomeDir, '.claude', 'CLAUDE.md'), expectedSource: 'user-global' },
      ];

      sourceTypes.forEach(({ path: filePath, expectedSource }) => {
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => String(p) === filePath);
        vi.mocked(fs.statSync).mockReturnValue({ size: 100, mtime: new Date() } as fs.Stats);
        vi.mocked(fs.readFileSync).mockReturnValue('# Content');
        vi.mocked(fs.readdirSync).mockReturnValue([]);

        const files = scanClaudeMdFiles(mockCwd);
        const file = files.find(f => f.path === filePath);

        expect(file?.source).toBe(expectedSource);

        vi.resetAllMocks();
        vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
      });
    });
  });
});
