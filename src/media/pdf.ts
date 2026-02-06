/**
 * PDF 解析模块
 * 基于官方实现 (cli.js 行495附近的 XzB 函数)
 * v2.1.30: 新增页面计数和页面范围提取功能
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * PDF 配置常量
 * 对应官方的 JzB 和 m43
 */
export const PDF_MAX_SIZE = 33554432; // 32MB = 33554432 bytes
export const PDF_EXTENSIONS = new Set(['pdf']);

/**
 * v2.1.30: PDF 页面限制常量
 * 对应官方的 HX1 和 jY6
 */
export const PDF_MAX_PAGES_PER_REQUEST = 20; // HX1 - 每次请求最多读取的页数
export const PDF_LARGE_THRESHOLD = 10;        // jY6 - 超过此页数必须使用 pages 参数

/**
 * PDF 读取结果
 */
export interface PdfReadResult {
  type: 'pdf';
  file: {
    filePath: string;
    base64: string;
    originalSize: number;
  };
}

/**
 * v2.1.30: PDF 页面提取结果
 * 对应官方的 "parts" 类型结果
 */
export interface PdfPartsResult {
  type: 'parts';
  file: {
    filePath: string;
    originalSize: number;
    count: number;
    outputDir: string;
  };
}

/**
 * v2.1.30: 页面范围
 * 对应官方的 GAA 函数返回类型
 */
export interface PageRange {
  firstPage: number;
  lastPage: number; // Infinity 表示到最后一页
}

/**
 * 检查是否支持 PDF（对应官方的 VJA 函数）
 * 默认启用，可通过环境变量控制
 */
export function isPdfSupported(): boolean {
  // 可以通过环境变量控制
  if (process.env.CLAUDE_PDF_SUPPORT === 'false') {
    return false;
  }
  return true;
}

/**
 * 验证文件扩展名是否为 PDF（对应官方的 lA1 / M81 函数）
 */
export function isPdfExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.slice(1) : ext;
  return PDF_EXTENSIONS.has(normalized.toLowerCase());
}

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

/**
 * v2.1.30: 解析页面范围字符串
 * 对应官方 cli.js 中的 GAA 函数 (行448)
 *
 * 支持格式：
 * - "5" → {firstPage: 5, lastPage: 5}    (单页)
 * - "1-5" → {firstPage: 1, lastPage: 5}  (范围)
 * - "10-" → {firstPage: 10, lastPage: Infinity} (从某页到最后)
 *
 * @returns 解析后的页面范围，无效则返回 null
 */
export function parsePageRange(input: string): PageRange | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 格式: "10-" (从某页到最后)
  if (trimmed.endsWith('-')) {
    const firstPage = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(firstPage) || firstPage < 1) return null;
    return { firstPage, lastPage: Infinity };
  }

  const dashIdx = trimmed.indexOf('-');

  // 格式: "5" (单页)
  if (dashIdx === -1) {
    const page = parseInt(trimmed, 10);
    if (isNaN(page) || page < 1) return null;
    return { firstPage: page, lastPage: page };
  }

  // 格式: "1-5" (范围)
  const firstPage = parseInt(trimmed.slice(0, dashIdx), 10);
  const lastPage = parseInt(trimmed.slice(dashIdx + 1), 10);
  if (isNaN(firstPage) || isNaN(lastPage) || firstPage < 1 || lastPage < 1 || lastPage < firstPage) {
    return null;
  }

  return { firstPage, lastPage };
}

/**
 * v2.1.30: 获取 PDF 页数
 * 对应官方 cli.js 中的 gG6 函数
 * 使用 pdfinfo 命令行工具（poppler-utils 的一部分）
 *
 * @returns 页数，如果无法获取则返回 null
 */
export async function getPdfPageCount(filePath: string): Promise<number | null> {
  try {
    const { code, stdout } = await new Promise<{ code: number; stdout: string }>((resolve) => {
      execFile('pdfinfo', [filePath], { timeout: 10000 }, (error, stdout, stderr) => {
        resolve({
          code: error ? (error as any).code || 1 : 0,
          stdout: stdout || '',
        });
      });
    });

    if (code !== 0) return null;

    const match = /^Pages:\s+(\d+)/m.exec(stdout);
    if (!match) return null;

    const count = parseInt(match[1], 10);
    return isNaN(count) ? null : count;
  } catch {
    return null;
  }
}

/**
 * v2.1.30: 使用 pdftoppm 提取 PDF 页面为 JPEG 图片
 * 对应官方 cli.js 中的 FyA 函数
 *
 * @param filePath PDF 文件路径
 * @param pageRange 可选的页面范围，不传则提取所有页面
 * @returns 提取结果
 */
export async function extractPdfPages(
  filePath: string,
  pageRange?: PageRange
): Promise<{ success: true; data: PdfPartsResult } | { success: false; error: { reason: string; message: string } }> {
  try {
    const stat = fs.statSync(filePath);

    // 创建临时输出目录
    const os = await import('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-pdf-'));

    // 构建 pdftoppm 参数
    const args: string[] = ['-jpeg', '-r', '100'];

    if (pageRange) {
      args.push('-f', String(pageRange.firstPage));
      if (pageRange.lastPage !== Infinity) {
        args.push('-l', String(pageRange.lastPage));
      }
    }

    args.push(filePath, path.join(tmpDir, 'page'));

    const { stdout, stderr } = await execFileAsync('pdftoppm', args, { timeout: 30000 });

    // 检查输出目录中的文件
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort();

    return {
      success: true,
      data: {
        type: 'parts',
        file: {
          filePath,
          originalSize: stat.size,
          count: files.length,
          outputDir: tmpDir,
        },
      },
    };
  } catch (error) {
    const reason = (error as any).code === 'ENOENT' ? 'unavailable' : 'error';
    return {
      success: false,
      error: {
        reason,
        message: reason === 'unavailable'
          ? 'pdftoppm is not available. Install poppler-utils (e.g. `brew install poppler` or `apt-get install poppler-utils`) to enable PDF page extraction.'
          : `PDF page extraction failed: ${error}`,
      },
    };
  }
}

/**
 * 读取 PDF 文件并返回 base64（对应官方的 Zo4 函数）
 *
 * 官方实现流程：
 * 1. 检查文件大小（不能为0，不能超过32MB）
 * 2. 读取文件内容
 * 3. 转换为 base64
 * 4. 返回结构化结果
 */
export async function readPdfFile(filePath: string): Promise<PdfReadResult> {
  // 获取文件信息
  const stat = fs.statSync(filePath);
  const size = stat.size;

  // 验证文件大小 - 对应官方的验证逻辑
  if (size === 0) {
    throw new Error(`PDF file is empty: ${filePath}`);
  }

  if (size > PDF_MAX_SIZE) {
    throw new Error(
      `PDF file size (${formatBytes(size)}) exceeds maximum ` +
      `allowed size (${formatBytes(PDF_MAX_SIZE)}). ` +
      `PDF files must be less than 32MB.`
    );
  }

  // 读取文件并转换为 base64
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');

  // 返回结果 - 对应官方的返回结构
  return {
    type: 'pdf',
    file: {
      filePath,
      base64,
      originalSize: size
    }
  };
}

/**
 * 同步读取 PDF 文件
 */
export function readPdfFileSync(filePath: string): PdfReadResult {
  // 获取文件信息
  const stat = fs.statSync(filePath);
  const size = stat.size;

  // 验证文件大小
  if (size === 0) {
    throw new Error(`PDF file is empty: ${filePath}`);
  }

  if (size > PDF_MAX_SIZE) {
    throw new Error(
      `PDF file size (${formatBytes(size)}) exceeds maximum ` +
      `allowed size (${formatBytes(PDF_MAX_SIZE)}). ` +
      `PDF files must be less than 32MB.`
    );
  }

  // 读取文件并转换为 base64
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');

  return {
    type: 'pdf',
    file: {
      filePath,
      base64,
      originalSize: size
    }
  };
}

/**
 * 验证 PDF 文件是否有效
 */
export function validatePdfFile(filePath: string): { valid: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File does not exist' };
    }

    const stat = fs.statSync(filePath);
    const size = stat.size;

    if (size === 0) {
      return { valid: false, error: 'PDF file is empty' };
    }

    if (size > PDF_MAX_SIZE) {
      return {
        valid: false,
        error: `PDF file size (${formatBytes(size)}) exceeds maximum allowed size (${formatBytes(PDF_MAX_SIZE)})`
      };
    }

    // 验证文件头（PDF 文件应以 %PDF- 开头）
    const buffer = fs.readFileSync(filePath);
    if (buffer.length >= 5) {
      const header = buffer.toString('utf-8', 0, 5);
      if (!header.startsWith('%PDF-')) {
        return { valid: false, error: 'File is not a valid PDF (invalid header)' };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` };
  }
}
