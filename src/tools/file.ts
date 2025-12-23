/**
 * 文件操作工具
 * Read, Write, Edit
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './base.js';
import type { FileReadInput, FileWriteInput, FileEditInput, FileResult, ToolDefinition } from '../types/index.js';

export class FileReadTool extends BaseTool<FileReadInput, FileResult> {
  name = 'Read';
  description = `Reads a file from the local filesystem.

Usage:
- The file_path parameter must be an absolute path
- By default, reads up to 2000 lines from the beginning
- You can optionally specify a line offset and limit
- Lines longer than 2000 characters will be truncated
- Results are returned with line numbers starting at 1
- Can read images (PNG, JPG), PDFs, and Jupyter notebooks`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'The line number to start reading from',
        },
        limit: {
          type: 'number',
          description: 'The number of lines to read',
        },
      },
      required: ['file_path'],
    };
  }

  async execute(input: FileReadInput): Promise<FileResult> {
    const { file_path, offset = 0, limit = 2000 } = input;

    try {
      if (!fs.existsSync(file_path)) {
        return { success: false, error: `File not found: ${file_path}` };
      }

      const stat = fs.statSync(file_path);
      if (stat.isDirectory()) {
        return { success: false, error: `Path is a directory: ${file_path}. Use ls command instead.` };
      }

      // 检测文件类型
      const ext = path.extname(file_path).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
        return this.readImage(file_path);
      }
      if (ext === '.pdf') {
        return this.readPdf(file_path);
      }
      if (ext === '.ipynb') {
        return this.readNotebook(file_path);
      }

      // 读取文本文件
      const content = fs.readFileSync(file_path, 'utf-8');
      const lines = content.split('\n');
      const selectedLines = lines.slice(offset, offset + limit);

      // 格式化带行号的输出
      const maxLineNumWidth = String(offset + selectedLines.length).length;
      const output = selectedLines.map((line, idx) => {
        const lineNum = String(offset + idx + 1).padStart(maxLineNumWidth, ' ');
        const truncatedLine = line.length > 2000 ? line.substring(0, 2000) + '...' : line;
        return `${lineNum}\t${truncatedLine}`;
      }).join('\n');

      return {
        success: true,
        content: output,
        output,
        lineCount: lines.length,
      };
    } catch (err) {
      return { success: false, error: `Error reading file: ${err}` };
    }
  }

  private readImage(filePath: string): FileResult {
    const base64 = fs.readFileSync(filePath).toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' :
                     ext === '.gif' ? 'image/gif' :
                     ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return {
      success: true,
      output: `[Image: ${filePath}]\nBase64 data (${base64.length} chars)`,
      content: `data:${mimeType};base64,${base64}`,
    };
  }

  private readPdf(filePath: string): FileResult {
    // 简化版 PDF 读取
    return {
      success: true,
      output: `[PDF File: ${filePath}]\nPDF reading requires additional processing.`,
    };
  }

  private readNotebook(filePath: string): FileResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const notebook = JSON.parse(content);
      const cells = notebook.cells || [];

      let output = '';
      cells.forEach((cell: any, idx: number) => {
        const cellType = cell.cell_type || 'unknown';
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        output += `\n--- Cell ${idx + 1} (${cellType}) ---\n${source}\n`;
      });

      return { success: true, output, content };
    } catch (err) {
      return { success: false, error: `Error reading notebook: ${err}` };
    }
  }
}

export class FileWriteTool extends BaseTool<FileWriteInput, FileResult> {
  name = 'Write';
  description = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one
- You MUST use the Read tool first to read existing files
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless requested`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    };
  }

  async execute(input: FileWriteInput): Promise<FileResult> {
    const { file_path, content } = input;

    try {
      // 确保目录存在
      const dir = path.dirname(file_path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(file_path, content, 'utf-8');

      const lines = content.split('\n').length;
      return {
        success: true,
        output: `Successfully wrote ${lines} lines to ${file_path}`,
        lineCount: lines,
      };
    } catch (err) {
      return { success: false, error: `Error writing file: ${err}` };
    }
  }
}

export class FileEditTool extends BaseTool<FileEditInput, FileResult> {
  name = 'Edit';
  description = `Performs exact string replacements in files.

Usage:
- You must use Read tool at least once before editing
- Preserve exact indentation as it appears in the file
- The edit will FAIL if old_string is not unique
- Use replace_all for replacing all occurrences`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute path to the file to modify',
        },
        old_string: {
          type: 'string',
          description: 'The text to replace',
        },
        new_string: {
          type: 'string',
          description: 'The text to replace it with',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences (default false)',
          default: false,
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    };
  }

  async execute(input: FileEditInput): Promise<FileResult> {
    const { file_path, old_string, new_string, replace_all = false } = input;

    try {
      if (!fs.existsSync(file_path)) {
        return { success: false, error: `File not found: ${file_path}` };
      }

      let content = fs.readFileSync(file_path, 'utf-8');

      // 检查 old_string 是否存在
      if (!content.includes(old_string)) {
        return { success: false, error: `old_string not found in file` };
      }

      // 如果不是 replace_all，检查唯一性
      if (!replace_all) {
        const matches = content.split(old_string).length - 1;
        if (matches > 1) {
          return {
            success: false,
            error: `old_string appears ${matches} times. Use replace_all=true or provide more context.`,
          };
        }
      }

      // 执行替换
      if (replace_all) {
        content = content.split(old_string).join(new_string);
      } else {
        content = content.replace(old_string, new_string);
      }

      fs.writeFileSync(file_path, content, 'utf-8');

      return {
        success: true,
        output: `Successfully edited ${file_path}`,
        content,
      };
    } catch (err) {
      return { success: false, error: `Error editing file: ${err}` };
    }
  }
}
