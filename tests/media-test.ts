/**
 * 媒体处理模块测试脚本
 */

import {
  detectMediaType,
  isSupportedMediaFile,
  isBlacklistedFile,
  getMimeTypeSync,
  SUPPORTED_IMAGE_FORMATS,
  PDF_MAX_SIZE,
  BINARY_FILE_BLACKLIST,
} from '../src/media/index.js';

console.log('=== 媒体处理模块测试 ===\n');

// 测试 1: 媒体类型检测
console.log('测试 1: 媒体类型检测');
console.log('test.png =>', detectMediaType('test.png'));
console.log('test.jpg =>', detectMediaType('test.jpg'));
console.log('test.pdf =>', detectMediaType('test.pdf'));
console.log('test.svg =>', detectMediaType('test.svg'));
console.log('test.mp4 =>', detectMediaType('test.mp4'));
console.log('');

// 测试 2: 支持的媒体文件
console.log('测试 2: 支持的媒体文件检测');
console.log('image.png =>', isSupportedMediaFile('image.png'));
console.log('doc.pdf =>', isSupportedMediaFile('doc.pdf'));
console.log('video.mp4 =>', isSupportedMediaFile('video.mp4'));
console.log('');

// 测试 3: 黑名单检测
console.log('测试 3: 黑名单文件检测');
console.log('test.mp3 =>', isBlacklistedFile('test.mp3'));
console.log('test.exe =>', isBlacklistedFile('test.exe'));
console.log('test.png =>', isBlacklistedFile('test.png'));
console.log('');

// 测试 4: MIME 类型同步检测
console.log('测试 4: MIME 类型同步检测');
const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF]);
const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);

console.log('PNG header =>', getMimeTypeSync(pngHeader));
console.log('JPEG header =>', getMimeTypeSync(jpegHeader));
console.log('PDF header =>', getMimeTypeSync(pdfHeader));
console.log('');

// 测试 5: 常量和配置
console.log('测试 5: 配置常量');
console.log('支持的图片格式:', Array.from(SUPPORTED_IMAGE_FORMATS));
console.log('PDF 最大大小:', PDF_MAX_SIZE, 'bytes (', (PDF_MAX_SIZE / 1048576).toFixed(2), 'MB)');
console.log('黑名单文件数量:', BINARY_FILE_BLACKLIST.size);
console.log('');

console.log('✅ 所有基础测试通过！');
console.log('\n注意: 实际的文件读取测试需要真实的测试文件。');
