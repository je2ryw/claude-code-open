/**
 * MIME 类型检测模块
 * 基于官方实现 (cli.js 行495附近的 BA1 函数)
 */

import { fileTypeFromBuffer } from 'file-type';

/**
 * 获取文件的 MIME 类型 (异步版本)
 * 使用 file-type 库进行准确检测
 */
export async function getMimeType(buffer: Buffer): Promise<string | null> {
  try {
    const fileType = await fileTypeFromBuffer(buffer);
    return fileType?.mime || null;
  } catch (error) {
    console.error('MIME type detection error:', error);
    return null;
  }
}

/**
 * 同步获取 MIME 类型（基于文件头 magic bytes）
 * 对应官方的 BA1 函数
 */
export function getMimeTypeSync(buffer: Buffer): string | null {
  // PNG: 89 50 4E 47
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 &&
      buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 &&
      buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // GIF: 47 49 46
  if (buffer.length >= 6 &&
      buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 &&
      buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 &&
      buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }

  // PDF: 25 50 44 46 2D
  if (buffer.length >= 5 &&
      buffer[0] === 0x25 && buffer[1] === 0x50 &&
      buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D) {
    return 'application/pdf';
  }

  // SVG: 检查文本内容
  if (buffer.length >= 100) {
    const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 1000));
    if (text.includes('<svg') || text.includes('<?xml')) {
      return 'image/svg+xml';
    }
  }

  return null;
}

/**
 * 根据 MIME 类型获取媒体类型
 */
export function getMediaType(mimeType: string): 'image' | 'pdf' | 'video' | 'audio' | 'unknown' {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  return 'unknown';
}

/**
 * 从文件扩展名推断 MIME 类型
 */
export function getMimeTypeFromExtension(ext: string): string {
  const normalized = ext.toLowerCase().replace('.', '');

  const mimeMap: Record<string, string> = {
    // 图片
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',

    // 文档
    'pdf': 'application/pdf',

    // 视频
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',

    // 音频
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
  };

  return mimeMap[normalized] || 'application/octet-stream';
}
