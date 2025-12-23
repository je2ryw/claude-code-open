/**
 * 搜索工具
 * Glob 和 Grep
 */

import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { BaseTool } from './base.js';
import type { GlobInput, GrepInput, ToolResult, ToolDefinition } from '../types/index.js';

export class GlobTool extends BaseTool<GlobInput, ToolResult> {
  name = 'Glob';
  description = `Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files against',
        },
        path: {
          type: 'string',
          description: 'The directory to search in. Defaults to current working directory.',
        },
      },
      required: ['pattern'],
    };
  }

  async execute(input: GlobInput): Promise<ToolResult> {
    const { pattern, path: searchPath = process.cwd() } = input;

    try {
      const files = await glob(pattern, {
        cwd: searchPath,
        absolute: true,
        nodir: true,
        dot: true,
      });

      // 按修改时间排序
      const sortedFiles = files
        .map(file => ({
          file,
          mtime: fs.existsSync(file) ? fs.statSync(file).mtime.getTime() : 0,
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .map(item => item.file);

      if (sortedFiles.length === 0) {
        return { success: true, output: 'No files found matching the pattern.' };
      }

      const output = sortedFiles.join('\n');
      return { success: true, output };
    } catch (err) {
      return { success: false, error: `Glob error: ${err}` };
    }
  }
}

export class GrepTool extends BaseTool<GrepInput, ToolResult> {
  name = 'Grep';
  description = `A powerful search tool built on ripgrep.

Usage:
- Supports full regex syntax
- Filter files with glob or type parameter
- Output modes: "content", "files_with_matches", "count"
- Use -i for case insensitive search
- Use -A/-B/-C for context lines`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The regular expression pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files',
        },
        output_mode: {
          type: 'string',
          enum: ['content', 'files_with_matches', 'count'],
          description: 'Output mode',
        },
        '-B': { type: 'number', description: 'Lines before match' },
        '-A': { type: 'number', description: 'Lines after match' },
        '-C': { type: 'number', description: 'Context lines' },
        '-n': { type: 'boolean', description: 'Show line numbers' },
        '-i': { type: 'boolean', description: 'Case insensitive' },
        type: { type: 'string', description: 'File type filter' },
        head_limit: { type: 'number', description: 'Limit output lines' },
        offset: { type: 'number', description: 'Skip first N entries' },
        multiline: { type: 'boolean', description: 'Enable multiline mode' },
      },
      required: ['pattern'],
    };
  }

  async execute(input: GrepInput): Promise<ToolResult> {
    const {
      pattern,
      path: searchPath = process.cwd(),
      glob: globPattern,
      output_mode = 'files_with_matches',
      '-B': beforeContext,
      '-A': afterContext,
      '-C': context,
      '-n': showLineNumbers = true,
      '-i': ignoreCase,
      type: fileType,
      head_limit,
      offset = 0,
      multiline,
    } = input;

    try {
      // 构建 ripgrep 命令
      const args: string[] = [];

      // 输出模式
      if (output_mode === 'files_with_matches') {
        args.push('-l');
      } else if (output_mode === 'count') {
        args.push('-c');
      }

      // 选项
      if (ignoreCase) args.push('-i');
      if (showLineNumbers && output_mode === 'content') args.push('-n');
      if (multiline) args.push('-U', '--multiline-dotall');
      if (beforeContext) args.push('-B', String(beforeContext));
      if (afterContext) args.push('-A', String(afterContext));
      if (context) args.push('-C', String(context));
      if (globPattern) args.push('--glob', globPattern);
      if (fileType) args.push('--type', fileType);

      args.push('--', pattern, searchPath);

      const cmd = `rg ${args.map(a => `'${a}'`).join(' ')} 2>/dev/null || true`;

      let output = execSync(cmd, {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf-8',
      });

      // 应用 offset 和 limit
      if (offset > 0 || head_limit) {
        const lines = output.split('\n');
        const sliced = lines.slice(offset, head_limit ? offset + head_limit : undefined);
        output = sliced.join('\n');
      }

      return { success: true, output: output.trim() || 'No matches found.' };
    } catch (err) {
      // 如果 rg 不可用，回退到 grep
      return this.fallbackGrep(input);
    }
  }

  private fallbackGrep(input: GrepInput): ToolResult {
    const { pattern, path: searchPath = process.cwd(), '-i': ignoreCase } = input;

    try {
      const flags = ignoreCase ? '-rni' : '-rn';
      const cmd = `grep ${flags} '${pattern}' '${searchPath}' 2>/dev/null || true`;
      const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      return { success: true, output: output.trim() || 'No matches found.' };
    } catch (err) {
      return { success: false, error: `Grep error: ${err}` };
    }
  }
}
