/**
 * CLAUDE.md @include 指令和二进制文件过滤测试
 *
 * v2.1.2 功能:
 * - @include 指令支持
 * - 二进制文件自动跳过
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ClaudeMdParser,
  isTextFile,
  isBinaryFile,
  getTextFileExtensions,
  hasBinaryContent,
} from '../../src/config/claude-md-parser.js';

describe('CLAUDE.md @include 指令', () => {
  let testDir: string;

  beforeAll(() => {
    // 创建临时测试目录
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-md-test-'));
  });

  afterAll(() => {
    // 清理测试目录
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('isTextFile', () => {
    it('应该识别 markdown 文件为文本文件', () => {
      expect(isTextFile('docs/api.md')).toBe(true);
      expect(isTextFile('README.md')).toBe(true);
    });

    it('应该识别代码文件为文本文件', () => {
      expect(isTextFile('src/index.ts')).toBe(true);
      expect(isTextFile('src/app.tsx')).toBe(true);
      expect(isTextFile('main.py')).toBe(true);
      expect(isTextFile('script.js')).toBe(true);
    });

    it('应该识别配置文件为文本文件', () => {
      expect(isTextFile('.env')).toBe(true);
      expect(isTextFile('config.json')).toBe(true);
      expect(isTextFile('settings.yaml')).toBe(true);
    });

    it('应该识别图片文件为二进制文件', () => {
      expect(isTextFile('logo.png')).toBe(false);
      expect(isTextFile('photo.jpg')).toBe(false);
      expect(isTextFile('icon.gif')).toBe(false);
      expect(isTextFile('image.webp')).toBe(false);
    });

    it('应该识别 PDF 为二进制文件', () => {
      expect(isTextFile('document.pdf')).toBe(false);
    });

    it('应该识别办公文档为二进制文件', () => {
      expect(isTextFile('report.docx')).toBe(false);
      expect(isTextFile('data.xlsx')).toBe(false);
      expect(isTextFile('slides.pptx')).toBe(false);
    });

    it('应该识别压缩文件为二进制文件', () => {
      expect(isTextFile('archive.zip')).toBe(false);
      expect(isTextFile('package.tar.gz')).toBe(false);
    });

    it('应该识别可执行文件为二进制文件', () => {
      expect(isTextFile('app.exe')).toBe(false);
      expect(isTextFile('lib.dll')).toBe(false);
      expect(isTextFile('module.wasm')).toBe(false);
    });

    it('应该将没有扩展名的文件视为文本文件', () => {
      expect(isTextFile('Makefile')).toBe(true);
      expect(isTextFile('Dockerfile')).toBe(true);
    });
  });

  describe('isBinaryFile', () => {
    it('应该与 isTextFile 结果相反', () => {
      expect(isBinaryFile('docs/api.md')).toBe(false);
      expect(isBinaryFile('logo.png')).toBe(true);
    });
  });

  describe('getTextFileExtensions', () => {
    it('应该返回所有允许的扩展名', () => {
      const extensions = getTextFileExtensions();
      expect(extensions).toContain('.md');
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.json');
      expect(extensions.length).toBeGreaterThan(50);
    });
  });

  describe('hasBinaryContent', () => {
    it('应该检测 NULL 字节', () => {
      const textBuffer = Buffer.from('Hello, World!');
      expect(hasBinaryContent(textBuffer)).toBe(false);

      const binaryBuffer = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]);
      expect(hasBinaryContent(binaryBuffer)).toBe(true);
    });

    it('应该只检查前 8000 字节', () => {
      // 创建一个大 buffer，NULL 字节在 8000 之后
      const largeBuffer = Buffer.alloc(10000, 0x41); // 填充 'A'
      largeBuffer[9000] = 0; // NULL 在 9000 位置
      expect(hasBinaryContent(largeBuffer)).toBe(false);

      // NULL 在 7000 位置
      largeBuffer[7000] = 0;
      expect(hasBinaryContent(largeBuffer)).toBe(true);
    });
  });

  describe('ClaudeMdParser @include 处理', () => {
    beforeEach(() => {
      // 清理测试目录内容
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        fs.rmSync(path.join(testDir, file), { recursive: true, force: true });
      }
    });

    it('应该解析不带 @include 的 CLAUDE.md', () => {
      const claudeMdContent = `# Project

This is a simple project.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      expect(result.exists).toBe(true);
      expect(result.content).toContain('This is a simple project');
      expect(result.includedPaths).toBeUndefined();
      expect(result.skippedBinaryFiles).toBeUndefined();
    });

    it('应该处理 @include 指令并包含文本文件', () => {
      // 创建被包含的文件
      const docsDir = path.join(testDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'api.md'), '## API Documentation\n\nThis is API docs.');

      // 创建 CLAUDE.md
      const claudeMdContent = `# Project

@./docs/api.md

Main content here.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      expect(result.exists).toBe(true);
      expect(result.content).toContain('API Documentation');
      expect(result.content).toContain('Main content here');
      expect(result.includedPaths).toContain('./docs/api.md');
    });

    it('应该跳过二进制文件并记录', () => {
      // 创建二进制文件（模拟 PNG）
      const imagesDir = path.join(testDir, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]));

      // 创建 CLAUDE.md
      const claudeMdContent = `# Project

@./images/logo.png

Main content here.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      expect(result.exists).toBe(true);
      expect(result.content).toContain('Main content here');
      expect(result.content).not.toContain('PNG');
      expect(result.skippedBinaryFiles).toContain('./images/logo.png');
    });

    it('应该跳过 PDF 文件', () => {
      const docsDir = path.join(testDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'manual.pdf'), Buffer.from('%PDF-1.4'));

      const claudeMdContent = `# Project

@./docs/manual.pdf

Main content.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      expect(result.skippedBinaryFiles).toContain('./docs/manual.pdf');
    });

    it('应该处理多个 @include 指令', () => {
      const docsDir = path.join(testDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'api.md'), '## API Docs');
      fs.writeFileSync(path.join(docsDir, 'guide.md'), '## User Guide');
      fs.writeFileSync(path.join(docsDir, 'diagram.png'), Buffer.from([0x89, 0x50]));

      const claudeMdContent = `# Project

@./docs/api.md
@./docs/guide.md
@./docs/diagram.png

Main content.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      expect(result.content).toContain('API Docs');
      expect(result.content).toContain('User Guide');
      expect(result.includedPaths).toContain('./docs/api.md');
      expect(result.includedPaths).toContain('./docs/guide.md');
      expect(result.skippedBinaryFiles).toContain('./docs/diagram.png');
    });

    it('应该忽略代码块中的 @include', () => {
      const claudeMdContent = `# Project

\`\`\`markdown
@./docs/example.md
\`\`\`

Main content.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      // 代码块中的 @include 不应被处理
      expect(result.includedPaths).toBeUndefined();
    });

    it('应该处理带空格路径的 @include', () => {
      const docsDir = path.join(testDir, 'my docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'api.md'), '## Spaced Path Docs');

      // 使用转义空格
      const claudeMdContent = `# Project

@./my\\ docs/api.md

Main content.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      expect(result.content).toContain('Spaced Path Docs');
    });

    it('应该优雅处理不存在的文件', () => {
      const claudeMdContent = `# Project

@./nonexistent.md

Main content.
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);
      const result = parser.parse();

      // 不应该崩溃
      expect(result.exists).toBe(true);
      expect(result.content).toContain('Main content');
    });

    it('应该防止循环引用', () => {
      // 创建循环引用
      const docsDir = path.join(testDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });

      // a.md 引用 b.md，b.md 引用 a.md
      fs.writeFileSync(path.join(docsDir, 'a.md'), '## A\n@./b.md');
      fs.writeFileSync(path.join(docsDir, 'b.md'), '## B\n@./a.md');

      const claudeMdContent = `# Project

@./docs/a.md
`;
      fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), claudeMdContent);

      const parser = new ClaudeMdParser(testDir);

      // 不应该无限循环
      const result = parser.parse();
      expect(result.exists).toBe(true);
    });
  });
});
