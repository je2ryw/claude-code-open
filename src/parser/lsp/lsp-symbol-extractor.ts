/**
 * LSP Symbol Extractor
 * 使用 LSP 协议提取代码符号
 */

import * as fs from 'fs';
import * as path from 'path';
import { LSPManager, lspManager, LSPServerError } from './lsp-manager.js';
import {
  LSPClient,
  LSPDocumentSymbol,
  LSPSymbolInformation,
  LSPSymbolKind,
  LSPLocation,
} from './lsp-client.js';

// 代码符号类型
export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'property'
  | 'variable'
  | 'constant'
  | 'interface'
  | 'type'
  | 'enum'
  | 'module'
  | 'import'
  | 'export';

// 代码符号
export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  location: {
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  children?: CodeSymbol[];
  signature?: string;
  documentation?: string;
}

// 引用信息
export interface Reference {
  file: string;
  line: number;
  column: number;
  text: string;
  isDefinition: boolean;
}

/**
 * LSP 符号提取器
 */
export class LSPSymbolExtractor {
  private manager: LSPManager;
  private documentVersions: Map<string, number> = new Map();

  constructor(manager?: LSPManager) {
    this.manager = manager || lspManager;
  }

  /**
   * LSP SymbolKind 转换为我们的 SymbolKind
   */
  private convertSymbolKind(lspKind: LSPSymbolKind): SymbolKind {
    switch (lspKind) {
      case LSPSymbolKind.Function:
        return 'function';
      case LSPSymbolKind.Class:
        return 'class';
      case LSPSymbolKind.Method:
        return 'method';
      case LSPSymbolKind.Property:
      case LSPSymbolKind.Field:
        return 'property';
      case LSPSymbolKind.Variable:
        return 'variable';
      case LSPSymbolKind.Constant:
        return 'constant';
      case LSPSymbolKind.Interface:
        return 'interface';
      case LSPSymbolKind.Enum:
        return 'enum';
      case LSPSymbolKind.Module:
      case LSPSymbolKind.Namespace:
      case LSPSymbolKind.Package:
        return 'module';
      case LSPSymbolKind.TypeParameter:
      case LSPSymbolKind.Struct:
        return 'type';
      default:
        return 'variable';
    }
  }

  /**
   * 文件路径转 URI
   */
  private fileToUri(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return `file:///${normalizedPath.replace(/^\//, '')}`;
  }

  /**
   * URI 转文件路径
   */
  private uriToFile(uri: string): string {
    const filePath = uri.replace(/^file:\/\/\/?/, '');
    return process.platform === 'win32' ? filePath : '/' + filePath;
  }

  /**
   * 转换 LSP 文档符号为 CodeSymbol
   */
  private convertDocumentSymbol(
    symbol: LSPDocumentSymbol,
    filePath: string
  ): CodeSymbol {
    const result: CodeSymbol = {
      name: symbol.name,
      kind: this.convertSymbolKind(symbol.kind),
      location: {
        file: filePath,
        startLine: symbol.range.start.line + 1,
        startColumn: symbol.range.start.character,
        endLine: symbol.range.end.line + 1,
        endColumn: symbol.range.end.character,
      },
      signature: symbol.detail,
    };

    if (symbol.children && symbol.children.length > 0) {
      result.children = symbol.children.map(child =>
        this.convertDocumentSymbol(child, filePath)
      );
    }

    return result;
  }

  /**
   * 转换 LSP SymbolInformation 为 CodeSymbol
   */
  private convertSymbolInformation(
    symbol: LSPSymbolInformation
  ): CodeSymbol {
    return {
      name: symbol.name,
      kind: this.convertSymbolKind(symbol.kind),
      location: {
        file: this.uriToFile(symbol.location.uri),
        startLine: symbol.location.range.start.line + 1,
        startColumn: symbol.location.range.start.character,
        endLine: symbol.location.range.end.line + 1,
        endColumn: symbol.location.range.end.character,
      },
    };
  }

  /**
   * 提取文件中的符号
   * LSP 不可用时抛出错误
   */
  async extractSymbols(filePath: string): Promise<CodeSymbol[]> {
    const ext = path.extname(filePath);
    const language = this.manager.getLanguageByExtension(ext);

    if (!language) {
      throw new LSPServerError(
        `Unsupported file type: ${ext}`,
        'unknown',
        `File extension '${ext}' is not supported.\n\nSupported extensions: ${this.manager.getSupportedLanguages().map(l => this.manager.getServerInfo(l)?.extensions.join(', ')).join(', ')}`
      );
    }

    // getClient 会在 LSP 不可用时抛出错误
    const client = await this.manager.getClient(language);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const uri = this.fileToUri(filePath);
      const languageId = this.manager.getLanguageId(language);

      // 获取或更新文档版本
      const version = (this.documentVersions.get(uri) || 0) + 1;
      this.documentVersions.set(uri, version);

      // 打开文档
      await client.openDocument(uri, languageId, version, content);

      // 获取符号
      const symbols = await client.getDocumentSymbols(uri);

      // 关闭文档
      await client.closeDocument(uri);

      // 转换符号
      return symbols.map(symbol => {
        if ('range' in symbol) {
          // LSPDocumentSymbol
          return this.convertDocumentSymbol(symbol as LSPDocumentSymbol, filePath);
        } else {
          // LSPSymbolInformation
          return this.convertSymbolInformation(symbol as LSPSymbolInformation);
        }
      });
    } catch (error) {
      console.warn(`Failed to extract symbols from ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 查找引用
   */
  async findReferences(
    filePath: string,
    line: number,
    column: number
  ): Promise<Reference[]> {
    const ext = path.extname(filePath);
    const language = this.manager.getLanguageByExtension(ext);

    if (!language) {
      return [];
    }

    const client = await this.manager.getClient(language);
    if (!client) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const uri = this.fileToUri(filePath);
      const languageId = this.manager.getLanguageId(language);

      // 获取或更新文档版本
      const version = (this.documentVersions.get(uri) || 0) + 1;
      this.documentVersions.set(uri, version);

      // 打开文档
      await client.openDocument(uri, languageId, version, content);

      // 查找引用
      const locations = await client.findReferences(uri, {
        line: line - 1, // LSP 使用 0 索引
        character: column,
      });

      // 关闭文档
      await client.closeDocument(uri);

      // 转换结果
      return locations.map(loc => {
        const file = this.uriToFile(loc.uri);
        const refLine = loc.range.start.line + 1;
        const refColumn = loc.range.start.character;

        // 尝试获取行文本
        let text = '';
        try {
          const refContent = fs.readFileSync(file, 'utf-8');
          const refLines = refContent.split('\n');
          text = refLines[refLine - 1] || '';
        } catch {
          // 忽略读取错误
        }

        return {
          file,
          line: refLine,
          column: refColumn,
          text,
          isDefinition: file === filePath && refLine === line,
        };
      });
    } catch (error) {
      console.warn(`Failed to find references in ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 跳转到定义
   */
  async getDefinition(
    filePath: string,
    line: number,
    column: number
  ): Promise<Reference | null> {
    const ext = path.extname(filePath);
    const language = this.manager.getLanguageByExtension(ext);

    if (!language) {
      return null;
    }

    const client = await this.manager.getClient(language);
    if (!client) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const uri = this.fileToUri(filePath);
      const languageId = this.manager.getLanguageId(language);

      // 获取或更新文档版本
      const version = (this.documentVersions.get(uri) || 0) + 1;
      this.documentVersions.set(uri, version);

      // 打开文档
      await client.openDocument(uri, languageId, version, content);

      // 获取定义
      const result = await client.getDefinition(uri, {
        line: line - 1,
        character: column,
      });

      // 关闭文档
      await client.closeDocument(uri);

      if (!result) return null;

      // 处理结果 (可能是单个位置或位置数组)
      const location = Array.isArray(result) ? result[0] : result;
      if (!location) return null;

      const file = this.uriToFile(location.uri);
      const defLine = location.range.start.line + 1;
      const defColumn = location.range.start.character;

      // 获取行文本
      let text = '';
      try {
        const defContent = fs.readFileSync(file, 'utf-8');
        const defLines = defContent.split('\n');
        text = defLines[defLine - 1] || '';
      } catch {
        // 忽略读取错误
      }

      return {
        file,
        line: defLine,
        column: defColumn,
        text,
        isDefinition: true,
      };
    } catch (error) {
      console.warn(`Failed to get definition in ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 扁平化符号树
   */
  flattenSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
    const result: CodeSymbol[] = [];

    const flatten = (syms: CodeSymbol[]) => {
      for (const sym of syms) {
        result.push(sym);
        if (sym.children) {
          flatten(sym.children);
        }
      }
    };

    flatten(symbols);
    return result;
  }

  /**
   * 停止所有 LSP 客户端
   */
  async shutdown(): Promise<void> {
    await this.manager.stopAll();
  }
}

// 导出默认实例
export const lspSymbolExtractor = new LSPSymbolExtractor();
