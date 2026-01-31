/**
 * 图片处理模块
 * 基于官方实现 (cli.js 行495附近的 CP3, zP3, BQ0 函数)
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { getMimeTypeSync } from './mime.js';

/**
 * 支持的图片格式（对应官方的 V91）
 */
export const SUPPORTED_IMAGE_FORMATS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp'
]);

/**
 * 最大图片 token 数（对应官方的 QQ0）
 */
export const MAX_IMAGE_TOKENS = 25000;

/**
 * 图片压缩配置
 */
export const IMAGE_COMPRESSION_CONFIG = {
  maxWidth: 400,
  maxHeight: 400,
  quality: 20,
  format: 'jpeg' as const,
};

/**
 * 图片尺寸信息
 */
export interface ImageDimensions {
  originalWidth?: number;
  originalHeight?: number;
  displayWidth?: number;
  displayHeight?: number;
}

/**
 * 图片处理结果
 */
export interface ImageResult {
  type: 'image';
  file: {
    base64: string;
    type: string; // MIME type
    originalSize: number;
    dimensions?: ImageDimensions;
  };
}

/**
 * 检查是否为支持的图片格式
 */
export function isSupportedImageFormat(ext: string): boolean {
  const normalized = ext.toLowerCase().replace('.', '');
  return SUPPORTED_IMAGE_FORMATS.has(normalized);
}

/**
 * 创建图片结果对象（对应官方的 H91 函数）
 */
function createImageResult(
  buffer: Buffer,
  mediaType: string,
  originalSize: number,
  dimensions?: ImageDimensions
): ImageResult {
  return {
    type: 'image',
    file: {
      base64: buffer.toString('base64'),
      type: mediaType,
      originalSize,
      dimensions,
    },
  };
}

/**
 * 提取图片尺寸信息（对应官方的 fYA 函数）
 */
async function extractImageDimensions(
  buffer: Buffer,
  originalSize: number,
  mediaType: string
): Promise<ImageResult> {
  try {
    const metadata = await sharp(buffer).metadata();

    const dimensions: ImageDimensions = {
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      displayWidth: metadata.width,
      displayHeight: metadata.height,
    };

    return createImageResult(buffer, mediaType, originalSize, dimensions);
  } catch (error) {
    // 如果无法提取尺寸，返回不带尺寸信息的结果
    return createImageResult(buffer, mediaType, originalSize);
  }
}

/**
 * 主图片处理函数（对应官方的 CP3）
 * 读取图片并尝试提取尺寸信息
 */
async function processImage(
  filePath: string,
  ext: string
): Promise<ImageResult> {
  // 获取文件大小
  const stat = fs.statSync(filePath);
  const size = stat.size;

  if (size === 0) {
    throw new Error(`Image file is empty: ${filePath}`);
  }

  // 读取文件
  const buffer = fs.readFileSync(filePath);

  // 获取 MIME 类型
  const mimeType = getMimeTypeSync(buffer);
  const mediaType = mimeType ? mimeType.split('/')[1] || 'png' : ext;

  try {
    // 尝试提取尺寸信息
    const result = await extractImageDimensions(buffer, size, `image/${mediaType}`);
    return result;
  } catch (error) {
    // 提取失败，返回基本信息
    console.error('Failed to extract image dimensions:', error);
    return createImageResult(buffer, `image/${mediaType}`, size);
  }
}

/**
 * 压缩图片（对应官方的 zP3）
 * 使用 sharp 将图片压缩到 400x400，JPEG 质量 20%
 */
async function compressImage(
  filePath: string,
  maxTokens: number
): Promise<ImageResult> {
  const stat = fs.statSync(filePath);
  const originalSize = stat.size;
  const buffer = fs.readFileSync(filePath);

  // 获取原始 MIME 类型
  const mimeType = getMimeTypeSync(buffer);

  try {
    // 使用 sharp 压缩
    const compressed = await sharp(buffer)
      .resize(IMAGE_COMPRESSION_CONFIG.maxWidth, IMAGE_COMPRESSION_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMAGE_COMPRESSION_CONFIG.quality })
      .toBuffer();

    // 获取压缩后的尺寸
    const metadata = await sharp(compressed).metadata();

    const dimensions: ImageDimensions = {
      displayWidth: metadata.width,
      displayHeight: metadata.height,
    };

    return {
      type: 'image',
      file: {
        base64: compressed.toString('base64'),
        type: 'image/jpeg',
        originalSize,
        dimensions,
      },
    };
  } catch (error) {
    console.error('Image compression failed:', error);
    // 压缩失败，返回原始图片
    const ext = path.extname(filePath).toLowerCase().slice(1) || 'png';
    return createImageResult(buffer, `image/${ext}`, originalSize);
  }
}

/**
 * 读取图片文件（对应官方的 BQ0）
 * 主入口函数，自动处理压缩
 *
 * @param filePath 图片文件路径
 * @param maxTokens 最大允许的 token 数（默认 25000）
 * @param ext 文件扩展名（可选）
 */
export async function readImageFile(
  filePath: string,
  maxTokens: number = MAX_IMAGE_TOKENS,
  ext?: string
): Promise<ImageResult> {
  // 确定文件扩展名
  const fileExt = ext || path.extname(filePath).toLowerCase().slice(1) || 'png';

  // 处理图片
  const result = await processImage(filePath, fileExt);

  // 计算 base64 大小对应的 token 数
  // 官方使用：Math.ceil(base64.length * 0.125)
  const estimatedTokens = Math.ceil(result.file.base64.length * 0.125);

  // 如果超过限制，使用压缩
  if (estimatedTokens > maxTokens) {
    return await compressImage(filePath, maxTokens);
  }

  return result;
}

/**
 * 同步读取图片（基础版本，不压缩）
 */
export function readImageFileSync(filePath: string): ImageResult {
  const stat = fs.statSync(filePath);
  const size = stat.size;

  if (size === 0) {
    throw new Error(`Image file is empty: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().slice(1) || 'png';
  const mimeType = getMimeTypeSync(buffer) || `image/${ext}`;

  return createImageResult(buffer, mimeType, size);
}

/**
 * 估算图片的 token 消耗
 */
export function estimateImageTokens(base64: string): number {
  return Math.ceil(base64.length * 0.125);
}

/**
 * v4.0: 压缩 Base64 图片数据
 * 用于蜂群系统中的设计图优化
 *
 * @param base64Data Base64 编码的图片数据（可以带 data:image/xxx;base64, 前缀）
 * @param maxTokens 最大允许的 token 数（默认 25000）
 * @returns 压缩后的 Base64 数据（带 data URI 前缀）
 */
export async function compressBase64Image(
  base64Data: string,
  maxTokens: number = MAX_IMAGE_TOKENS
): Promise<string> {
  // 解析 data URI
  let pureBase64 = base64Data;
  let originalMediaType = 'image/png';

  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (matches) {
      originalMediaType = matches[1];
      pureBase64 = matches[2];
    }
  }

  // 估算当前 token 消耗
  const estimatedTokens = Math.ceil(pureBase64.length * 0.125);

  // 如果在限制内，直接返回
  if (estimatedTokens <= maxTokens) {
    return base64Data.startsWith('data:')
      ? base64Data
      : `data:${originalMediaType};base64,${pureBase64}`;
  }

  // 需要压缩
  try {
    const buffer = Buffer.from(pureBase64, 'base64');

    const compressed = await sharp(buffer)
      .resize(IMAGE_COMPRESSION_CONFIG.maxWidth, IMAGE_COMPRESSION_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMAGE_COMPRESSION_CONFIG.quality })
      .toBuffer();

    const compressedBase64 = compressed.toString('base64');
    const newTokens = Math.ceil(compressedBase64.length * 0.125);

    console.log(`[ImageCompression] 压缩: ${estimatedTokens} -> ${newTokens} tokens (${Math.round((1 - newTokens/estimatedTokens) * 100)}% 减少)`);

    return `data:image/jpeg;base64,${compressedBase64}`;
  } catch (error) {
    console.error('[ImageCompression] 压缩失败，返回原始数据:', error);
    return base64Data.startsWith('data:')
      ? base64Data
      : `data:${originalMediaType};base64,${pureBase64}`;
  }
}

/**
 * 验证图片文件
 */
export function validateImageFile(filePath: string): { valid: boolean; error?: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File does not exist' };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return { valid: false, error: 'Image file is empty' };
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);
    if (!isSupportedImageFormat(ext)) {
      return {
        valid: false,
        error: `Unsupported image format: ${ext}. Supported formats: ${Array.from(SUPPORTED_IMAGE_FORMATS).join(', ')}`
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` };
  }
}
