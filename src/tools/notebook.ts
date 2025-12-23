/**
 * NotebookEdit 工具
 * 编辑 Jupyter Notebook 单元格
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './base.js';
import type { NotebookEditInput, ToolResult, ToolDefinition } from '../types/index.js';

interface NotebookCell {
  id?: string;
  cell_type: 'code' | 'markdown' | 'raw';
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
  execution_count?: number | null;
}

interface NotebookContent {
  cells: NotebookCell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

export class NotebookEditTool extends BaseTool<NotebookEditInput, ToolResult> {
  name = 'NotebookEdit';
  description = `Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source.

Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing.

Usage:
- The notebook_path parameter must be an absolute path
- The cell_id is used to identify which cell to edit (0-indexed if not specified)
- Use edit_mode=insert to add a new cell at the index specified by cell_id
- Use edit_mode=delete to delete the cell at the index specified by cell_id
- cell_type defaults to the current cell type, required for insert mode`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        notebook_path: {
          type: 'string',
          description: 'The absolute path to the Jupyter notebook file to edit',
        },
        cell_id: {
          type: 'string',
          description: 'The ID of the cell to edit. When inserting, the new cell will be inserted after this cell.',
        },
        new_source: {
          type: 'string',
          description: 'The new source for the cell',
        },
        cell_type: {
          type: 'string',
          enum: ['code', 'markdown'],
          description: 'The type of the cell (code or markdown). Required for insert mode.',
        },
        edit_mode: {
          type: 'string',
          enum: ['replace', 'insert', 'delete'],
          description: 'The type of edit to make. Defaults to replace.',
        },
      },
      required: ['notebook_path', 'new_source'],
    };
  }

  async execute(input: NotebookEditInput): Promise<ToolResult> {
    const { notebook_path, cell_id, new_source, cell_type, edit_mode = 'replace' } = input;

    try {
      // 检查文件是否存在
      if (!fs.existsSync(notebook_path)) {
        return { success: false, error: `Notebook not found: ${notebook_path}` };
      }

      // 检查文件扩展名
      if (!notebook_path.endsWith('.ipynb')) {
        return { success: false, error: 'File must be a Jupyter notebook (.ipynb)' };
      }

      // 读取 notebook
      const content = fs.readFileSync(notebook_path, 'utf-8');
      let notebook: NotebookContent;

      try {
        notebook = JSON.parse(content);
      } catch {
        return { success: false, error: 'Invalid notebook format' };
      }

      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        return { success: false, error: 'Invalid notebook structure: missing cells array' };
      }

      // 找到目标单元格
      let cellIndex = -1;
      if (cell_id !== undefined) {
        // 尝试按 ID 查找
        cellIndex = notebook.cells.findIndex((c, idx) =>
          c.id === cell_id || idx.toString() === cell_id
        );

        if (cellIndex === -1) {
          // 尝试解析为数字索引
          const numIndex = parseInt(cell_id, 10);
          if (!isNaN(numIndex) && numIndex >= 0 && numIndex < notebook.cells.length) {
            cellIndex = numIndex;
          }
        }
      } else {
        cellIndex = 0; // 默认第一个单元格
      }

      // 执行编辑操作
      switch (edit_mode) {
        case 'replace': {
          if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
            return { success: false, error: `Cell not found: ${cell_id}` };
          }

          const cell = notebook.cells[cellIndex];
          cell.source = new_source.split('\n').map((line, i, arr) =>
            i < arr.length - 1 ? line + '\n' : line
          );

          if (cell_type) {
            cell.cell_type = cell_type;
          }

          // 清除输出（对于 code 单元格）
          if (cell.cell_type === 'code') {
            cell.outputs = [];
            cell.execution_count = null;
          }
          break;
        }

        case 'insert': {
          if (!cell_type) {
            return { success: false, error: 'cell_type is required for insert mode' };
          }

          const newCell: NotebookCell = {
            cell_type,
            source: new_source.split('\n').map((line, i, arr) =>
              i < arr.length - 1 ? line + '\n' : line
            ),
            metadata: {},
          };

          if (cell_type === 'code') {
            newCell.outputs = [];
            newCell.execution_count = null;
          }

          // 生成唯一 ID
          newCell.id = this.generateCellId();

          // 插入位置
          const insertIndex = cellIndex >= 0 ? cellIndex + 1 : notebook.cells.length;
          notebook.cells.splice(insertIndex, 0, newCell);
          break;
        }

        case 'delete': {
          if (cellIndex < 0 || cellIndex >= notebook.cells.length) {
            return { success: false, error: `Cell not found: ${cell_id}` };
          }

          notebook.cells.splice(cellIndex, 1);
          break;
        }

        default:
          return { success: false, error: `Invalid edit_mode: ${edit_mode}` };
      }

      // 写回文件
      fs.writeFileSync(notebook_path, JSON.stringify(notebook, null, 1), 'utf-8');

      return {
        success: true,
        output: `Successfully ${edit_mode}d cell in ${path.basename(notebook_path)}`,
      };
    } catch (err) {
      return { success: false, error: `Error editing notebook: ${err}` };
    }
  }

  private generateCellId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}
