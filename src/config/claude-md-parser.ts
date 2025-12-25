/**
 * CLAUDE.md 解析器
 *
 * 解析项目根目录的 CLAUDE.md 文件，并注入到系统提示中
 * 这是官方 Claude Code 的核心特性之一
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ClaudeMdInfo {
  content: string;
  path: string;
  exists: boolean;
  lastModified?: Date;
}

export class ClaudeMdParser {
  private claudeMdPath: string;
  private watcher?: fs.FSWatcher;
  private changeCallbacks: Array<(content: string) => void> = [];

  constructor(workingDir?: string) {
    const dir = workingDir || process.cwd();
    this.claudeMdPath = path.join(dir, 'CLAUDE.md');
  }

  /**
   * 解析 CLAUDE.md 文件
   */
  parse(): ClaudeMdInfo {
    if (!fs.existsSync(this.claudeMdPath)) {
      return {
        content: '',
        path: this.claudeMdPath,
        exists: false,
      };
    }

    try {
      const content = fs.readFileSync(this.claudeMdPath, 'utf-8');
      const stats = fs.statSync(this.claudeMdPath);

      return {
        content,
        path: this.claudeMdPath,
        exists: true,
        lastModified: stats.mtime,
      };
    } catch (error) {
      console.warn(`读取 CLAUDE.md 失败: ${error}`);
      return {
        content: '',
        path: this.claudeMdPath,
        exists: false,
      };
    }
  }

  /**
   * 注入到系统提示
   *
   * 这是核心功能：将 CLAUDE.md 的内容添加到系统提示中
   */
  injectIntoSystemPrompt(basePrompt: string): string {
    const info = this.parse();

    if (!info.exists || !info.content.trim()) {
      return basePrompt;
    }

    // 按照官方格式注入
    return `${basePrompt}

# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of ${this.claudeMdPath} (project instructions, checked into the codebase):

${info.content}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.`;
  }

  /**
   * 获取 CLAUDE.md 内容（简化版）
   */
  getContent(): string | null {
    const info = this.parse();
    return info.exists ? info.content : null;
  }

  /**
   * 检查 CLAUDE.md 是否存在
   */
  exists(): boolean {
    return fs.existsSync(this.claudeMdPath);
  }

  /**
   * 监听 CLAUDE.md 变化
   */
  watch(callback: (content: string) => void): void {
    if (!this.exists()) {
      console.warn(`CLAUDE.md 不存在，无法监听: ${this.claudeMdPath}`);
      return;
    }

    this.changeCallbacks.push(callback);

    if (!this.watcher) {
      this.watcher = fs.watch(this.claudeMdPath, (eventType) => {
        if (eventType === 'change') {
          const content = this.getContent();
          if (content) {
            this.changeCallbacks.forEach(cb => cb(content));
          }
        }
      });
    }
  }

  /**
   * 停止监听
   */
  unwatch(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    this.changeCallbacks = [];
  }

  /**
   * 创建默认的 CLAUDE.md 模板
   */
  static createTemplate(projectName: string, projectType?: string): string {
    return `# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

${projectName} is a ${projectType || 'software'} project.

## Development Guidelines

### Code Style

- Follow consistent formatting
- Write clear, descriptive comments
- Use meaningful variable names

### Testing

- Write tests for new features
- Ensure all tests pass before committing
- Maintain test coverage above 80%

### Git Workflow

- Use feature branches
- Write clear commit messages
- Keep commits atomic and focused

## Important Notes

- Add project-specific guidelines here
- Document any special requirements
- Include build/deployment instructions if needed
`;
  }

  /**
   * 在项目中创建 CLAUDE.md
   */
  create(content?: string): boolean {
    if (this.exists()) {
      console.warn('CLAUDE.md 已存在');
      return false;
    }

    const projectName = path.basename(process.cwd());
    const template = content || ClaudeMdParser.createTemplate(projectName);

    try {
      fs.writeFileSync(this.claudeMdPath, template, 'utf-8');
      return true;
    } catch (error) {
      console.error(`创建 CLAUDE.md 失败: ${error}`);
      return false;
    }
  }

  /**
   * 更新 CLAUDE.md
   */
  update(content: string): boolean {
    try {
      fs.writeFileSync(this.claudeMdPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error(`更新 CLAUDE.md 失败: ${error}`);
      return false;
    }
  }

  /**
   * 验证 CLAUDE.md 格式
   *
   * 检查是否包含基本结构
   */
  validate(): { valid: boolean; warnings: string[] } {
    const info = this.parse();
    const warnings: string[] = [];

    if (!info.exists) {
      return { valid: false, warnings: ['CLAUDE.md 文件不存在'] };
    }

    if (!info.content.trim()) {
      warnings.push('CLAUDE.md 文件为空');
    }

    // 检查是否包含标题
    if (!info.content.includes('#')) {
      warnings.push('建议使用 Markdown 标题组织内容');
    }

    // 检查文件大小（过大可能影响性能）
    if (info.content.length > 50000) {
      warnings.push('CLAUDE.md 文件过大（>50KB），可能影响性能');
    }

    return { valid: true, warnings };
  }

  /**
   * 获取 CLAUDE.md 的统计信息
   */
  getStats(): { lines: number; chars: number; size: number } | null {
    const info = this.parse();

    if (!info.exists) return null;

    const lines = info.content.split('\n').length;
    const chars = info.content.length;
    const size = fs.statSync(this.claudeMdPath).size;

    return { lines, chars, size };
  }
}

/**
 * 全局 CLAUDE.md 解析器实例
 */
export const claudeMdParser = new ClaudeMdParser();
