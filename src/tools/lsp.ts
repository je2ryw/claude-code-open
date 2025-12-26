/**
 * LSP Tool - Language Server Protocol 工具
 * 提供代码智能功能：定义跳转、引用查找、悬停信息等
 */

import { BaseTool } from './base.js';
import { z } from 'zod';
import { getLSPManager } from '../lsp/manager.js';
import { readFile } from 'fs/promises';
import { pathToFileURL } from 'url';
import * as path from 'path';

/**
 * LSP 操作类型
 */
const LSPOperation = z.enum([
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
]);

/**
 * LSP 工具输入
 */
const LSPInput = z.object({
  operation: LSPOperation.describe('The LSP operation to perform'),
  filePath: z.string().describe('The absolute or relative path to the file'),
  line: z.number().int().positive().describe('The line number (1-based, as shown in editors)'),
  character: z.number().int().positive().describe('The character offset (1-based, as shown in editors)'),
});

/**
 * LSP 工具输出 (扩展 ToolResult)
 */
const LSPOutput = z.object({
  success: z.boolean().describe('Whether the operation was successful'),
  output: z.string().optional().describe('Formatted output'),
  error: z.string().optional().describe('Error message if failed'),
  operation: LSPOperation.optional().describe('The LSP operation that was performed'),
  result: z.string().optional().describe('The formatted result of the LSP operation'),
  filePath: z.string().optional().describe('The file path the operation was performed on'),
  resultCount: z.number().int().nonnegative().optional().describe('Number of results'),
  fileCount: z.number().int().nonnegative().optional().describe('Number of files containing results'),
});

type LSPInputType = z.infer<typeof LSPInput>;
type LSPOutputType = z.infer<typeof LSPOutput> & import('../types/index.js').ToolResult;

/**
 * LSP 工具
 */
export class LSPTool extends BaseTool<LSPInputType, LSPOutputType> {
  name = 'LSP';
  description = `Interact with Language Server Protocol (LSP) servers to get code intelligence features.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position

All operations require:
- filePath: The file to operate on
- line: The line number (1-based, as shown in editors)
- character: The character offset (1-based, as shown in editors)

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.`;

  inputSchema = LSPInput;
  outputSchema = LSPOutput;

  /**
   * 获取输入 Schema
   */
  getInputSchema() {
    return {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string' as const,
          enum: [
            'goToDefinition',
            'findReferences',
            'hover',
            'documentSymbol',
            'workspaceSymbol',
            'goToImplementation',
            'prepareCallHierarchy',
            'incomingCalls',
            'outgoingCalls',
          ],
          description: 'The LSP operation to perform',
        },
        filePath: {
          type: 'string' as const,
          description: 'The absolute or relative path to the file',
        },
        line: {
          type: 'number' as const,
          description: 'The line number (1-based, as shown in editors)',
        },
        character: {
          type: 'number' as const,
          description: 'The character offset (1-based, as shown in editors)',
        },
      },
      required: ['operation', 'filePath', 'line', 'character'],
    };
  }

  /**
   * 将工具输入转换为 LSP 协议请求
   */
  private buildLSPRequest(input: LSPInputType, filePath: string): { method: string; params: any } {
    const uri = pathToFileURL(filePath).href;
    const position = {
      line: input.line - 1,  // 转换为 0-based
      character: input.character - 1,
    };

    switch (input.operation) {
      case 'goToDefinition':
        return {
          method: 'textDocument/definition',
          params: {
            textDocument: { uri },
            position,
          },
        };

      case 'findReferences':
        return {
          method: 'textDocument/references',
          params: {
            textDocument: { uri },
            position,
            context: { includeDeclaration: true },
          },
        };

      case 'hover':
        return {
          method: 'textDocument/hover',
          params: {
            textDocument: { uri },
            position,
          },
        };

      case 'documentSymbol':
        return {
          method: 'textDocument/documentSymbol',
          params: {
            textDocument: { uri },
          },
        };

      case 'workspaceSymbol':
        return {
          method: 'workspace/symbol',
          params: { query: '' },
        };

      case 'goToImplementation':
        return {
          method: 'textDocument/implementation',
          params: {
            textDocument: { uri },
            position,
          },
        };

      case 'prepareCallHierarchy':
      case 'incomingCalls':
      case 'outgoingCalls':
        return {
          method: 'textDocument/prepareCallHierarchy',
          params: {
            textDocument: { uri },
            position,
          },
        };

      default:
        throw new Error(`Unsupported operation: ${input.operation}`);
    }
  }

  /**
   * 格式化 LSP 结果
   */
  private formatResult(
    operation: string,
    result: any,
    workingDir: string
  ): { formatted: string; resultCount: number; fileCount: number } {
    switch (operation) {
      case 'goToDefinition':
      case 'goToImplementation':
        return this.formatLocationResult(result, workingDir);

      case 'findReferences':
        return this.formatReferencesResult(result, workingDir);

      case 'hover':
        return this.formatHoverResult(result);

      case 'documentSymbol':
        return this.formatDocumentSymbolResult(result);

      case 'workspaceSymbol':
        return this.formatWorkspaceSymbolResult(result, workingDir);

      case 'prepareCallHierarchy':
        return this.formatCallHierarchyResult(result, workingDir);

      case 'incomingCalls':
      case 'outgoingCalls':
        return this.formatCallsResult(operation, result, workingDir);

      default:
        return {
          formatted: JSON.stringify(result, null, 2),
          resultCount: 0,
          fileCount: 0,
        };
    }
  }

  /**
   * 格式化位置结果（definition/implementation）
   */
  private formatLocationResult(result: any, workingDir: string) {
    const locations = Array.isArray(result) ? result : result ? [result] : [];

    if (locations.length === 0) {
      return {
        formatted: 'No definition found. This may occur if the symbol is not defined in the workspace, or if the LSP server has not fully indexed the file.',
        resultCount: 0,
        fileCount: 0,
      };
    }

    if (locations.length === 1) {
      const loc = locations[0];
      const filePath = this.uriToPath(loc.uri || loc.targetUri, workingDir);
      const line = (loc.range || loc.targetRange).start.line + 1;
      return {
        formatted: `Definition found at ${filePath}:${line}`,
        resultCount: 1,
        fileCount: 1,
      };
    }

    const grouped = this.groupByFile(locations, workingDir);
    const lines = [`Found ${locations.length} definitions across ${grouped.size} files:`];

    for (const [file, locs] of grouped) {
      lines.push(`\n${file}:`);
      for (const loc of locs) {
        const line = (loc.range || loc.targetRange).start.line + 1;
        const char = (loc.range || loc.targetRange).start.character + 1;
        lines.push(`  Line ${line}:${char}`);
      }
    }

    return {
      formatted: lines.join('\n'),
      resultCount: locations.length,
      fileCount: grouped.size,
    };
  }

  /**
   * 格式化引用结果
   */
  private formatReferencesResult(result: any, workingDir: string) {
    const references = result || [];

    if (references.length === 0) {
      return {
        formatted: 'No references found. This may occur if the symbol is not used elsewhere, or if the LSP server has not fully indexed the project.',
        resultCount: 0,
        fileCount: 0,
      };
    }

    const grouped = this.groupByFile(references, workingDir);
    const lines = [`Found ${references.length} references across ${grouped.size} files:`];

    for (const [file, refs] of grouped) {
      lines.push(`\n${file}:`);
      for (const ref of refs) {
        const line = ref.range.start.line + 1;
        const char = ref.range.start.character + 1;
        lines.push(`  Line ${line}:${char}`);
      }
    }

    return {
      formatted: lines.join('\n'),
      resultCount: references.length,
      fileCount: grouped.size,
    };
  }

  /**
   * 格式化 hover 结果
   */
  private formatHoverResult(result: any) {
    if (!result) {
      return {
        formatted: 'No hover information available. This may occur if the cursor is not on a symbol, or if the LSP server has not fully indexed the file.',
        resultCount: 0,
        fileCount: 0,
      };
    }

    let content = '';

    if (Array.isArray(result.contents)) {
      content = result.contents
        .map((c: any) => (typeof c === 'string' ? c : c.value))
        .join('\n\n');
    } else if (typeof result.contents === 'string') {
      content = result.contents;
    } else {
      content = result.contents.value;
    }

    if (result.range) {
      const line = result.range.start.line + 1;
      const char = result.range.start.character + 1;
      content = `Hover info at ${line}:${char}:\n\n${content}`;
    }

    return {
      formatted: content,
      resultCount: 1,
      fileCount: 1,
    };
  }

  /**
   * 格式化文档符号结果
   */
  private formatDocumentSymbolResult(result: any) {
    const symbols = result || [];

    if (symbols.length === 0) {
      return {
        formatted: 'No symbols found in document. This may occur if the file is empty or has no recognizable code structures.',
        resultCount: 0,
        fileCount: 0,
      };
    }

    const count = this.countSymbols(symbols);
    const lines = [`Found ${count} symbol${count === 1 ? '' : 's'} in document:`];

    for (const symbol of symbols) {
      const kind = this.symbolKindToString(symbol.kind);
      const line = symbol.range.start.line + 1;
      let text = `  ${symbol.name} (${kind}) - Line ${line}`;

      if (symbol.containerName) {
        text += ` in ${symbol.containerName}`;
      }

      lines.push(text);
    }

    return {
      formatted: lines.join('\n'),
      resultCount: count,
      fileCount: 1,
    };
  }

  /**
   * 格式化工作区符号结果
   */
  private formatWorkspaceSymbolResult(result: any, workingDir: string) {
    const symbols = (result || []).filter((s: any) => s && s.location && s.location.uri);

    if (symbols.length === 0) {
      return {
        formatted: 'No symbols found in workspace. This may occur if the workspace is empty, or if the LSP server has not finished indexing the project.',
        resultCount: 0,
        fileCount: 0,
      };
    }

    const grouped = this.groupSymbolsByFile(symbols, workingDir);
    const lines = [`Found ${symbols.length} symbol${symbols.length === 1 ? '' : 's'} in workspace:`];

    for (const [file, syms] of grouped) {
      lines.push(`\n${file}:`);
      for (const sym of syms) {
        const kind = this.symbolKindToString(sym.kind);
        const line = sym.location.range.start.line + 1;
        let text = `  ${sym.name} (${kind}) - Line ${line}`;

        if (sym.containerName) {
          text += ` in ${sym.containerName}`;
        }

        lines.push(text);
      }
    }

    return {
      formatted: lines.join('\n'),
      resultCount: symbols.length,
      fileCount: grouped.size,
    };
  }

  /**
   * 格式化调用层次结果
   */
  private formatCallHierarchyResult(result: any, workingDir: string) {
    const items = result || [];

    if (items.length === 0) {
      return {
        formatted: 'No call hierarchy item found at this position',
        resultCount: 0,
        fileCount: 0,
      };
    }

    if (items.length === 1) {
      const item = items[0];
      const filePath = this.uriToPath(item.uri, workingDir);
      const kind = this.symbolKindToString(item.kind);
      const line = item.range.start.line + 1;

      return {
        formatted: `Call hierarchy item: ${item.name} (${kind}) - ${filePath}:${line}`,
        resultCount: 1,
        fileCount: 1,
      };
    }

    const lines = [`Found ${items.length} call hierarchy items:`];
    for (const item of items) {
      const filePath = this.uriToPath(item.uri, workingDir);
      const kind = this.symbolKindToString(item.kind);
      const line = item.range.start.line + 1;
      lines.push(`  ${item.name} (${kind}) - ${filePath}:${line}`);
    }

    return {
      formatted: lines.join('\n'),
      resultCount: items.length,
      fileCount: new Set(items.map((i: any) => i.uri)).size,
    };
  }

  /**
   * 格式化调用结果
   */
  private formatCallsResult(operation: string, result: any, workingDir: string) {
    const calls = result || [];

    if (calls.length === 0) {
      const type = operation === 'incomingCalls' ? 'incoming' : 'outgoing';
      return {
        formatted: `No ${type} calls found (${operation === 'incomingCalls' ? 'nothing calls this function' : 'this function calls nothing'})`,
        resultCount: 0,
        fileCount: 0,
      };
    }

    const isIncoming = operation === 'incomingCalls';
    const callItem = isIncoming ? 'from' : 'to';
    const label = isIncoming ? 'caller' : 'callee';
    const lines = [`Found ${calls.length} ${label}${calls.length === 1 ? '' : 's'}:`];

    const grouped = new Map<string, any[]>();

    for (const call of calls) {
      const item = call[callItem];
      if (!item) continue;

      const filePath = this.uriToPath(item.uri, workingDir);
      if (!grouped.has(filePath)) {
        grouped.set(filePath, []);
      }
      grouped.get(filePath)!.push(call);
    }

    for (const [file, fileCalls] of grouped) {
      lines.push(`\n${file}:`);
      for (const call of fileCalls) {
        const item = call[callItem];
        if (!item) continue;

        const kind = this.symbolKindToString(item.kind);
        const line = item.range.start.line + 1;
        let text = `  ${item.name} (${kind}) - Line ${line}`;

        if (call.fromRanges && call.fromRanges.length > 0) {
          const ranges = call.fromRanges
            .map((r: any) => `${r.start.line + 1}:${r.start.character + 1}`)
            .join(', ');
          text += ` [${isIncoming ? 'calls at' : 'called from'}: ${ranges}]`;
        }

        lines.push(text);
      }
    }

    return {
      formatted: lines.join('\n'),
      resultCount: calls.length,
      fileCount: grouped.size,
    };
  }

  /**
   * 辅助方法：URI 转路径
   */
  private uriToPath(uri: string, workingDir: string): string {
    const filePath = uri.replace(/^file:\/\//, '');
    const relativePath = path.relative(workingDir, filePath);
    return relativePath.startsWith('..') ? filePath : relativePath;
  }

  /**
   * 辅助方法：按文件分组
   */
  private groupByFile(locations: any[], workingDir: string): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const loc of locations) {
      const uri = loc.uri || loc.targetUri || loc.location?.uri;
      if (!uri) continue;

      const filePath = this.uriToPath(uri, workingDir);

      if (!grouped.has(filePath)) {
        grouped.set(filePath, []);
      }

      grouped.get(filePath)!.push(loc);
    }

    return grouped;
  }

  /**
   * 辅助方法：按文件分组符号
   */
  private groupSymbolsByFile(symbols: any[], workingDir: string): Map<string, any[]> {
    const grouped = new Map<string, any[]>();

    for (const sym of symbols) {
      const filePath = this.uriToPath(sym.location.uri, workingDir);

      if (!grouped.has(filePath)) {
        grouped.set(filePath, []);
      }

      grouped.get(filePath)!.push(sym);
    }

    return grouped;
  }

  /**
   * 辅助方法：递归计算符号数量
   */
  private countSymbols(symbols: any[]): number {
    let count = symbols.length;

    for (const sym of symbols) {
      if (sym.children && sym.children.length > 0) {
        count += this.countSymbols(sym.children);
      }
    }

    return count;
  }

  /**
   * 辅助方法：SymbolKind 转字符串
   */
  private symbolKindToString(kind: number): string {
    const kinds: Record<number, string> = {
      1: 'File',
      2: 'Module',
      3: 'Namespace',
      4: 'Package',
      5: 'Class',
      6: 'Method',
      7: 'Property',
      8: 'Field',
      9: 'Constructor',
      10: 'Enum',
      11: 'Interface',
      12: 'Function',
      13: 'Variable',
      14: 'Constant',
      15: 'String',
      16: 'Number',
      17: 'Boolean',
      18: 'Array',
      19: 'Object',
      20: 'Key',
      21: 'Null',
      22: 'EnumMember',
      23: 'Struct',
      24: 'Event',
      25: 'Operator',
      26: 'TypeParameter',
    };

    return kinds[kind] || 'Unknown';
  }

  /**
   * 执行工具
   */
  async execute(input: LSPInputType): Promise<LSPOutputType> {
    const manager = getLSPManager();

    if (!manager) {
      return {
        success: false,
        error: 'LSP server manager not initialized. This may indicate a startup issue.',
        operation: input.operation,
        filePath: input.filePath,
      };
    }

    const filePath = path.resolve(input.filePath);
    const workingDir = process.cwd();

    // 构建 LSP 请求
    const { method, params } = this.buildLSPRequest(input, filePath);

    try {
      // 如果文件未打开，先打开
      if (!manager.isFileOpen(filePath)) {
        const content = await readFile(filePath, 'utf-8');
        await manager.openFile(filePath, content);
      }

      // 发送请求
      let result = await manager.sendRequest(filePath, method, params);

      if (result === undefined) {
        return {
          success: false,
          error: `No LSP server available for file type: ${path.extname(filePath)}`,
          operation: input.operation,
          filePath: input.filePath,
        };
      }

      // 处理 incoming/outgoing calls 的二次请求
      if (input.operation === 'incomingCalls' || input.operation === 'outgoingCalls') {
        const items = result;

        if (!items || items.length === 0) {
          const formatted = 'No call hierarchy item found at this position';
          return {
            success: true,
            output: formatted,
            operation: input.operation,
            result: formatted,
            filePath: input.filePath,
            resultCount: 0,
            fileCount: 0,
          };
        }

        const secondMethod =
          input.operation === 'incomingCalls'
            ? 'callHierarchy/incomingCalls'
            : 'callHierarchy/outgoingCalls';

        result = await manager.sendRequest(filePath, secondMethod, { item: items[0] });

        if (result === undefined) {
          return {
            success: false,
            error: 'LSP server did not return call hierarchy results',
            operation: input.operation,
            filePath: input.filePath,
          };
        }
      }

      // 格式化结果
      const { formatted, resultCount, fileCount } = this.formatResult(
        input.operation,
        result,
        workingDir
      );

      return {
        success: true,
        output: formatted,
        operation: input.operation,
        result: formatted,
        filePath: input.filePath,
        resultCount,
        fileCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Error performing ${input.operation}: ${message}`,
        operation: input.operation,
        filePath: input.filePath,
      };
    }
  }

  /**
   * 检查工具是否可用
   */
  isEnabled(): boolean {
    const manager = getLSPManager();
    if (!manager) {
      return false;
    }

    const status = manager.getStatus();
    if (status.status === 'failed') {
      return false;
    }

    const servers = manager.getAllServers();
    if (servers.size === 0) {
      return false;
    }

    // 检查是否至少有一个服务器处于就绪状态
    for (const server of servers.values()) {
      if (server.getState() === 'ready') {
        return true;
      }
    }

    return false;
  }
}
