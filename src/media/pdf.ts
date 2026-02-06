/**
 * PDF 解析模块
 * 基于官方实现 (cli.js 行495附近的 XzB 函数)
 */

import * as fs from 'fs';

/**
 * PDF 配置常量
 * v2.1.31: 更新限制为 20MB，并添加 100 页限制（与官方对齐）
 */
export const PDF_MAX_SIZE = 20 * 1024 * 1024; // 20MB
export const PDF_MAX_PAGES = 100; // 最大 100 页
export const PDF_EXTENSIONS = new Set(['pdf']);

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
 * v2.1.31: PDF 错误类
 * 用于区分 PDF 特有的错误（如大小超限），避免这些错误锁死 session
 */
export class PdfTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfTooLargeError';
  }
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
 * 验证文件扩展名是否为 PDF（对应官方的 lA1 函数）
 */
export function isPdfExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.slice(1) : ext;
  return PDF_EXTENSIONS.has(normalized.toLowerCase());
}

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

/**
 * 读取 PDF 文件并返回 base64（对应官方的 XzB 函数）
 *
 * 官方实现流程：
 * 1. 检查文件大小（不能为0，不能超过20MB）
 * 2. 读取文件内容
 * 3. 转换为 base64
 * 4. 返回结构化结果
 *
 * v2.1.31: 更新限制为 20MB，使用 PdfTooLargeError 避免锁死 session
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
    throw new PdfTooLargeError(
      `PDF file too large: ${formatBytes(size)}. ` +
      `Maximum allowed size is ${formatBytes(PDF_MAX_SIZE)} (20MB). ` +
      `Maximum allowed pages is ${PDF_MAX_PAGES}. ` +
      `Try using the \`pages\` parameter to read specific page ranges (e.g., pages: "1-5").`
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
    throw new PdfTooLargeError(
      `PDF file too large: ${formatBytes(size)}. ` +
      `Maximum allowed size is ${formatBytes(PDF_MAX_SIZE)} (20MB). ` +
      `Maximum allowed pages is ${PDF_MAX_PAGES}. ` +
      `Try using the \`pages\` parameter to read specific page ranges (e.g., pages: "1-5").`
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
        error: `PDF file too large (${formatBytes(size)}). Maximum allowed: ${formatBytes(PDF_MAX_SIZE)} (20MB), ${PDF_MAX_PAGES} pages`
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
