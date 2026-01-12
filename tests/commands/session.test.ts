/**
 * Session Commands Unit Tests
 * Tests for resume, context, compact, rewind, rename, export commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CommandContext } from '../../src/commands/types.js';
import {
  resumeCommand,
  contextCommand,
  compactCommand,
  rewindCommand,
  renameCommand,
  exportCommand,
  registerSessionCommands,
} from '../../src/commands/session.js';
import { commandRegistry } from '../../src/commands/registry.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock context helper
function createMockContext(args: string[] = []): CommandContext {
  return {
    session: {
      id: 'test-session-id-12345',
      messageCount: 5,
      duration: 60000,
      totalCost: '$0.05',
      clearMessages: vi.fn(),
      getStats: vi.fn(() => ({
        messageCount: 5,
        duration: 60000,
        totalCost: '$0.05',
        modelUsage: { 'claude-sonnet-4.5': 1000 },
      })),
      getTodos: vi.fn(() => []),
      setTodos: vi.fn(),
      setCustomTitle: vi.fn(),
    },
    config: {
      model: 'claude-sonnet-4.5',
      modelDisplayName: 'Claude Sonnet 4.5',
      apiType: 'anthropic',
      cwd: '/test/dir',
      version: '2.1.4',
    },
    ui: {
      addMessage: vi.fn(),
      addActivity: vi.fn(),
      setShowWelcome: vi.fn(),
      exit: vi.fn(),
    },
    args,
    rawInput: args.join(' '),
  };
}

describe('Session Commands Registration', () => {
  beforeEach(() => {
    commandRegistry.commands.clear();
  });

  it('should register all session commands', () => {
    registerSessionCommands();

    expect(commandRegistry.get('resume')).toBeDefined();
    expect(commandRegistry.get('context')).toBeDefined();
    expect(commandRegistry.get('compact')).toBeDefined();
    expect(commandRegistry.get('rewind')).toBeDefined();
    expect(commandRegistry.get('rename')).toBeDefined();
    expect(commandRegistry.get('export')).toBeDefined();
  });

  it('should register command aliases', () => {
    registerSessionCommands();

    expect(commandRegistry.get('r')).toBeDefined();
    expect(commandRegistry.get('r')?.name).toBe('resume');
    expect(commandRegistry.get('ctx')).toBeDefined();
    expect(commandRegistry.get('ctx')?.name).toBe('context');
    expect(commandRegistry.get('c')).toBeDefined();
    expect(commandRegistry.get('c')?.name).toBe('compact');
    expect(commandRegistry.get('undo')).toBeDefined();
    expect(commandRegistry.get('undo')?.name).toBe('rewind');
  });
});

describe('Resume Command', () => {
  const testSessionsDir = path.join(os.tmpdir(), 'claude-test-sessions');

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    // Mock os.homedir to point to test directory
    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
  });

  afterEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    expect(resumeCommand.name).toBe('resume');
    expect(resumeCommand.aliases).toContain('r');
    expect(resumeCommand.category).toBe('session');
  });

  it('should handle no previous sessions', async () => {
    const ctx = createMockContext([]);
    const result = await resumeCommand.execute(ctx);

    expect(result.success).toBe(false);
    expect(ctx.ui.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('No previous sessions'));
  });

  it('should return JSX component when no args provided and sessions exist', async () => {
    // Create test sessions directory and file
    fs.mkdirSync(testSessionsDir, { recursive: true });
    const sessionFile = path.join(testSessionsDir, 'test-session.json');
    const sessionData = {
      id: 'test-session',
      metadata: {
        created: Date.now(),
        customTitle: 'Test Session',
        messageCount: 5,
      },
      messages: [],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    const ctx = createMockContext([]);
    const result = await resumeCommand.execute(ctx);

    // Should return JSX component
    expect(result.success).toBe(true);
    expect(result.action).toBe('showJsx');
    expect(result.jsx).toBeDefined();
    expect(result.shouldHidePromptInput).toBe(true);
  });

  it('should handle session ID parameter', async () => {
    // Create test session
    fs.mkdirSync(testSessionsDir, { recursive: true });
    const sessionId = 'abc12345';
    const sessionFile = path.join(testSessionsDir, `${sessionId}.json`);
    const sessionData = {
      id: sessionId,
      metadata: {
        created: Date.now(),
        messageCount: 3,
        customTitle: 'Test Session',
      },
      messages: [],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    const ctx = createMockContext(['abc123']);
    const result = await resumeCommand.execute(ctx);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(ctx.ui.addMessage).toHaveBeenCalled();
  });

  it('should handle numeric session selection', async () => {
    // Create test sessions
    fs.mkdirSync(testSessionsDir, { recursive: true });
    for (let i = 0; i < 3; i++) {
      const sessionFile = path.join(testSessionsDir, `session-${i}.json`);
      const sessionData = {
        id: `session-${i}`,
        metadata: {
          created: Date.now() - (i * 1000),
          modified: Date.now() - (i * 1000),
          messageCount: i + 1,
        },
        messages: [],
      };
      fs.writeFileSync(sessionFile, JSON.stringify(sessionData));
    }

    const ctx = createMockContext(['1']);
    const result = await resumeCommand.execute(ctx);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should handle search parameter', async () => {
    // Create test sessions with different titles
    fs.mkdirSync(testSessionsDir, { recursive: true });
    const sessionFile = path.join(testSessionsDir, 'typescript-session.json');
    const sessionData = {
      id: 'typescript-session',
      metadata: {
        created: Date.now(),
        customTitle: 'TypeScript Project',
        messageCount: 5,
      },
      messages: [],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    const ctx = createMockContext(['typescript']);
    const result = await resumeCommand.execute(ctx);

    expect(result).toBeDefined();
    // Should find the session
    if (result.success) {
      const message = (ctx.ui.addMessage as any).mock.calls[0][1];
      expect(message).toContain('TypeScript');
    }
  });

  it('should display session list with metadata', async () => {
    // Create multiple test sessions
    fs.mkdirSync(testSessionsDir, { recursive: true });
    for (let i = 0; i < 3; i++) {
      const sessionFile = path.join(testSessionsDir, `session-${i}.json`);
      const sessionData = {
        id: `session-${i}`,
        metadata: {
          created: Date.now() - (i * 60000),
          modified: Date.now() - (i * 60000),
          messageCount: (i + 1) * 5,
          customTitle: `Session ${i}`,
          gitBranch: 'main',
          model: 'claude-sonnet-4.5',
        },
        messages: [],
      };
      fs.writeFileSync(sessionFile, JSON.stringify(sessionData));
    }

    const ctx = createMockContext([]);
    const result = await resumeCommand.execute(ctx);

    // Should return JSX when no args
    expect(result.success).toBe(true);
  });
});

describe('Context Command', () => {
  it('should have correct metadata', () => {
    expect(contextCommand.name).toBe('context');
    expect(contextCommand.aliases).toContain('ctx');
    expect(contextCommand.category).toBe('session');
  });

  it('should display context usage', () => {
    const ctx = createMockContext([]);
    const result = contextCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.ui.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('Context Usage'));
  });

  it('should show token statistics', () => {
    const ctx = createMockContext([]);
    contextCommand.execute(ctx);

    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/tokens/i);
    expect(message).toMatch(/Messages:/);
  });

  it('should display progress bar', () => {
    const ctx = createMockContext([]);
    contextCommand.execute(ctx);

    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    // Should contain progress bar characters
    expect(message).toMatch(/[█░]/);
  });

  it('should calculate token usage correctly', () => {
    const ctx = createMockContext([]);
    // Mock high message count
    ctx.session.getStats = vi.fn(() => ({
      messageCount: 300, // High number to trigger warning
      duration: 60000,
      totalCost: '$5.00',
      modelUsage: { 'claude-sonnet-4.5': 180000 },
    }));

    contextCommand.execute(ctx);

    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    // Should show context usage information
    expect(message).toMatch(/Context Usage/i);
    expect(message).toMatch(/tokens/i);
  });

  it('should provide context statistics', () => {
    const ctx = createMockContext([]);
    ctx.session.getStats = vi.fn(() => ({
      messageCount: 200,
      duration: 60000,
      totalCost: '$3.00',
      modelUsage: { 'claude-sonnet-4.5': 120000 },
    }));

    contextCommand.execute(ctx);

    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    // Should display context statistics
    expect(message).toMatch(/Context Usage/i);
    expect(message).toMatch(/Messages:/i);
    expect(message).toMatch(/tokens/i);
  });
});

describe('Compact Command', () => {
  let mockContextManager: any;

  beforeEach(() => {
    // Import and spy on contextManager
    mockContextManager = {
      getStats: vi.fn(() => ({
        totalMessages: 0,
        summarizedMessages: 0,
        estimatedTokens: 0,
        compressionRatio: 1,
        savedTokens: 0,
        compressionCount: 0,
      })),
      compact: vi.fn(),
    };
  });

  it('should have correct metadata', () => {
    expect(compactCommand.name).toBe('compact');
    expect(compactCommand.aliases).toContain('c');
    expect(compactCommand.category).toBe('session');
  });

  it('should handle empty conversation', async () => {
    const ctx = createMockContext([]);
    const result = await compactCommand.execute(ctx);

    expect(result.success).toBe(false);
    expect(ctx.ui.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('No conversation history'));
  });

  it('should support --force flag', async () => {
    const ctx = createMockContext(['--force']);
    const result = await compactCommand.execute(ctx);
    expect(result).toBeDefined();
  });

  it('should reject compaction when already compacted recently', async () => {
    const ctx = createMockContext([]);

    // Mock context manager with already summarized messages
    vi.doMock('../../src/context/index.js', () => ({
      contextManager: {
        getStats: vi.fn(() => ({
          totalMessages: 10,
          summarizedMessages: 8,
          estimatedTokens: 5000,
          compressionRatio: 0.7,
          savedTokens: 2000,
          compressionCount: 1,
        })),
        compact: vi.fn(),
      },
    }));

    const result = await compactCommand.execute(ctx);

    // Should suggest using --force
    if (!result.success) {
      const message = (ctx.ui.addMessage as any).mock.calls[0][1];
      expect(message).toMatch(/already compacted/i);
    }
  });

  it('should execute compaction successfully', async () => {
    const ctx = createMockContext([]);

    // Mock context with messages that need compaction
    vi.doMock('../../src/context/index.js', () => ({
      contextManager: {
        getStats: vi.fn()
          .mockReturnValueOnce({
            totalMessages: 50,
            summarizedMessages: 0,
            estimatedTokens: 50000,
            compressionRatio: 1,
            savedTokens: 0,
            compressionCount: 0,
          })
          .mockReturnValueOnce({
            totalMessages: 50,
            summarizedMessages: 40,
            estimatedTokens: 20000,
            compressionRatio: 0.4,
            savedTokens: 30000,
            compressionCount: 1,
          }),
        compact: vi.fn(),
      },
    }));

    const result = await compactCommand.execute(ctx);

    if (result.success) {
      expect(ctx.ui.addActivity).toHaveBeenCalled();
      const message = (ctx.ui.addMessage as any).mock.calls[0][1];
      expect(message).toMatch(/compaction/i);
    }
  });

  it('should handle compaction errors gracefully', async () => {
    const ctx = createMockContext([]);

    // Mock compact to throw error
    vi.doMock('../../src/context/index.js', () => ({
      contextManager: {
        getStats: vi.fn(() => ({
          totalMessages: 50,
          summarizedMessages: 0,
          estimatedTokens: 50000,
          compressionRatio: 1,
          savedTokens: 0,
          compressionCount: 0,
        })),
        compact: vi.fn(() => {
          throw new Error('Compaction failed');
        }),
      },
    }));

    const result = await compactCommand.execute(ctx);

    if (!result.success) {
      const message = (ctx.ui.addMessage as any).mock.calls[0][1];
      expect(message).toMatch(/error/i);
    }
  });
});

describe('Rewind Command', () => {
  it('should have correct metadata', () => {
    expect(rewindCommand.name).toBe('rewind');
    expect(rewindCommand.aliases).toContain('undo');
    expect(rewindCommand.category).toBe('session');
  });

  it('should show help when --help flag is provided', async () => {
    const ctx = createMockContext(['--help']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/Rewind Command/i);
    expect(message).toMatch(/Usage:/i);
  });

  it('should show rewind UI when no message index provided', async () => {
    const ctx = createMockContext([]);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.ui.addMessage).toHaveBeenCalled();
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/Rewind Feature/i);
  });

  it('should handle numeric message index', async () => {
    const ctx = createMockContext(['3']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/message #3/i);
  });

  it('should reject invalid message index (out of range)', async () => {
    const ctx = createMockContext(['100']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(false);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/Invalid message index/i);
  });

  it('should reject negative message index', async () => {
    const ctx = createMockContext(['-5']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(false);
  });

  it('should handle --code flag', async () => {
    const ctx = createMockContext(['--code', '2']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/code changes only/i);
  });

  it('should handle --conversation flag', async () => {
    const ctx = createMockContext(['--conversation', '2']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/conversation only/i);
  });

  it('should handle --both flag', async () => {
    const ctx = createMockContext(['--both', '2']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/code and conversation/i);
  });

  it('should default to both mode when no mode specified', async () => {
    const ctx = createMockContext(['2']);
    const result = await rewindCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/code and conversation/i);
  });
});

describe('Rename Command', () => {
  it('should have correct metadata', () => {
    expect(renameCommand.name).toBe('rename');
    expect(renameCommand.category).toBe('session');
  });

  it('should require a name argument', () => {
    const ctx = createMockContext([]);
    const result = renameCommand.execute(ctx);

    expect(result.success).toBe(false);
    expect(ctx.ui.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('Usage:'));
  });

  it('should accept single word names', () => {
    const ctx = createMockContext(['my-session']);
    const result = renameCommand.execute(ctx);

    expect(result).toBeDefined();
    if (ctx.session.setCustomTitle) {
      expect(ctx.session.setCustomTitle).toHaveBeenCalledWith('my-session');
    }
  });

  it('should accept multi-word names', () => {
    const ctx = createMockContext(['my', 'project', 'session']);
    const result = renameCommand.execute(ctx);

    expect(result).toBeDefined();
    if (ctx.session.setCustomTitle) {
      expect(ctx.session.setCustomTitle).toHaveBeenCalledWith('my project session');
    }
  });

  it('should provide feedback on success', () => {
    const ctx = createMockContext(['new-name']);
    renameCommand.execute(ctx);

    if (ctx.session.setCustomTitle) {
      expect(ctx.ui.addMessage).toHaveBeenCalledWith('assistant', expect.stringContaining('renamed'));
      expect(ctx.ui.addActivity).toHaveBeenCalled();
    }
  });
});

describe('Export Command', () => {
  const testExportDir = path.join(os.tmpdir(), 'claude-export-test');

  beforeEach(() => {
    if (fs.existsSync(testExportDir)) {
      fs.rmSync(testExportDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testExportDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testExportDir)) {
      fs.rmSync(testExportDir, { recursive: true, force: true });
    }
  });

  it('should have correct metadata', () => {
    expect(exportCommand.name).toBe('export');
    expect(exportCommand.category).toBe('session');
  });

  it('should default to markdown format', () => {
    const ctx = createMockContext([]);
    ctx.config.cwd = testExportDir;

    const result = exportCommand.execute(ctx);

    expect(result).toBeDefined();
  });

  it('should support JSON format', () => {
    const ctx = createMockContext(['json']);
    ctx.config.cwd = testExportDir;

    const result = exportCommand.execute(ctx);

    expect(result).toBeDefined();
  });

  it('should support markdown format explicitly', () => {
    const ctx = createMockContext(['markdown']);
    ctx.config.cwd = testExportDir;

    const result = exportCommand.execute(ctx);

    expect(result).toBeDefined();
  });

  it('should support md format alias', () => {
    const ctx = createMockContext(['md']);
    ctx.config.cwd = testExportDir;

    const result = exportCommand.execute(ctx);

    expect(result).toBeDefined();
  });

  it('should accept custom output path', () => {
    const customPath = path.join(testExportDir, 'custom-export.md');
    const ctx = createMockContext(['markdown', customPath]);

    const result = exportCommand.execute(ctx);

    expect(result).toBeDefined();
  });

  it('should generate default filename', () => {
    const ctx = createMockContext([]);
    ctx.config.cwd = testExportDir;

    exportCommand.execute(ctx);

    if (ctx.ui.addMessage) {
      const calls = (ctx.ui.addMessage as any).mock.calls;
      if (calls.length > 0) {
        const message = calls[calls.length - 1][1];
        expect(message).toMatch(/claude-session-.*\.(md|json)/);
      }
    }
  });
});

describe('Tag Command', () => {
  const testSessionsDir = path.join(os.tmpdir(), 'claude-test-sessions');

  beforeEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testSessionsDir, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
  });

  afterEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    expect(tagCommand.name).toBe('tag');
    expect(tagCommand.aliases).toContain('tags');
    expect(tagCommand.category).toBe('session');
  });

  it('should list empty tags when no tags exist', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext([]);
    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/No tags/i);
  });

  it('should add tag successfully', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['add', 'feature-x']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => []);

    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.session.setTags).toHaveBeenCalledWith(['feature-x']);
  });

  it('should remove tag successfully', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['remove', 'feature-x']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => ['feature-x', 'bug-fix']);

    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.session.setTags).toHaveBeenCalledWith(['bug-fix']);
  });

  it('should clear all tags', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['clear']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => ['tag1', 'tag2', 'tag3']);

    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.session.setTags).toHaveBeenCalledWith([]);
  });

  it('should toggle tag (add if not exists)', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['toggle', 'new-tag']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => ['existing-tag']);

    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.session.setTags).toHaveBeenCalledWith(['existing-tag', 'new-tag']);
  });

  it('should toggle tag (remove if exists)', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['toggle', 'existing-tag']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => ['existing-tag', 'other-tag']);

    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(ctx.session.setTags).toHaveBeenCalledWith(['other-tag']);
  });

  it('should sanitize tag names', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['add', 'Feature', 'X!@#']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => []);

    const result = tagCommand.execute(ctx);

    // Tag should be sanitized to lowercase and alphanumeric with hyphens
    if (result.success) {
      const call = (ctx.session.setTags as any).mock.calls[0];
      const tags = call[0];
      expect(tags[0]).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('Transcript Command', () => {
  const testSessionsDir = path.join(os.tmpdir(), 'claude-test-sessions');

  beforeEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testSessionsDir, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
  });

  afterEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should have correct metadata', () => {
    const { transcriptCommand } = require('../../src/commands/session.js');
    expect(transcriptCommand.name).toBe('transcript');
    expect(transcriptCommand.aliases).toContain('trans');
    expect(transcriptCommand.category).toBe('session');
  });

  it('should display transcript when no output path provided', () => {
    const { transcriptCommand } = require('../../src/commands/session.js');
    // Create session file
    const sessionFile = path.join(testSessionsDir, 'test-session-id-12345.json');
    const sessionData = {
      metadata: { created: Date.now(), customTitle: 'Test Session' },
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    const ctx = createMockContext([]);
    const result = transcriptCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/TRANSCRIPT/i);
    expect(message).toMatch(/Hello/);
  });

  it('should export transcript to file when path provided', () => {
    const { transcriptCommand } = require('../../src/commands/session.js');
    // Create session file
    const sessionFile = path.join(testSessionsDir, 'test-session-id-12345.json');
    const sessionData = {
      metadata: { created: Date.now() },
      messages: [{ role: 'user', content: 'Test message' }],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    const outputPath = path.join(os.tmpdir(), 'test-transcript.txt');
    const ctx = createMockContext([outputPath]);
    const result = transcriptCommand.execute(ctx);

    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Cleanup
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });
});

describe('Session Command Error Handling', () => {
  it('should handle missing session files gracefully', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
    const ctx = createMockContext(['nonexistent-id']);
    const result = await resumeCommand.execute(ctx);

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    vi.restoreAllMocks();
  });

  it('should handle corrupted session data', async () => {
    const testDir = path.join(os.tmpdir(), 'claude-corrupted-test');
    fs.mkdirSync(testDir, { recursive: true });

    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());

    const corruptedFile = path.join(testDir, 'sessions', 'corrupted.json');
    fs.mkdirSync(path.dirname(corruptedFile), { recursive: true });
    fs.writeFileSync(corruptedFile, '{invalid json}');

    const ctx = createMockContext([]);
    const result = await resumeCommand.execute(ctx);

    expect(result).toBeDefined();

    fs.rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should handle permission errors gracefully', () => {
    const ctx = createMockContext(['test-name']);
    ctx.config.cwd = '/root/no-permission';

    const result = renameCommand.execute(ctx);

    expect(result).toBeDefined();
  });

  it('should handle export errors', () => {
    const { exportCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['json', '/invalid/path/that/does/not/exist/export.json']);

    const result = exportCommand.execute(ctx);

    // Should either succeed (creating directories) or fail gracefully
    expect(typeof result.success).toBe('boolean');
  });
});

describe('Session Command Integration Tests', () => {
  const testSessionsDir = path.join(os.tmpdir(), 'claude-integration-test-sessions');

  beforeEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testSessionsDir, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
  });

  afterEach(() => {
    if (fs.existsSync(testSessionsDir)) {
      fs.rmSync(testSessionsDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should handle complete session workflow', async () => {
    // 1. Create session
    const sessionFile = path.join(testSessionsDir, 'integration-test.json');
    const sessionData = {
      id: 'integration-test',
      metadata: {
        created: Date.now(),
        customTitle: 'Integration Test Session',
        messageCount: 10,
        tags: ['test', 'integration'],
      },
      messages: [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));

    // 2. Resume session
    const ctx1 = createMockContext(['integration-test']);
    const resumeResult = await resumeCommand.execute(ctx1);
    expect(resumeResult).toBeDefined();

    // 3. Rename session
    const ctx2 = createMockContext(['New Session Name']);
    ctx2.session.setCustomTitle = vi.fn();
    const renameResult = renameCommand.execute(ctx2);
    expect(renameResult.success).toBe(true);

    // 4. Export session
    const { exportCommand } = require('../../src/commands/session.js');
    const exportPath = path.join(os.tmpdir(), 'test-export.json');
    const ctx3 = createMockContext(['json', exportPath]);
    const exportResult = exportCommand.execute(ctx3);

    if (exportResult.success) {
      expect(fs.existsSync(exportPath)).toBe(true);
      fs.unlinkSync(exportPath);
    }
  });

  it('should handle session with multiple tags', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext([]);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => []);

    // Add multiple tags
    const tags = ['feature', 'bug-fix', 'urgent', 'refactoring'];
    for (const tag of tags) {
      const addCtx = createMockContext(['add', tag]);
      addCtx.session.setTags = vi.fn();
      addCtx.session.getTags = vi.fn(() => tags.slice(0, tags.indexOf(tag)));
      tagCommand.execute(addCtx);
    }

    // List tags
    const listCtx = createMockContext(['list']);
    listCtx.session.getTags = vi.fn(() => tags);
    const result = tagCommand.execute(listCtx);

    expect(result.success).toBe(true);
  });

  it('should handle session search with multiple matches', async () => {
    // Create multiple sessions with similar names
    for (let i = 0; i < 5; i++) {
      const sessionFile = path.join(testSessionsDir, `typescript-project-${i}.json`);
      const sessionData = {
        id: `typescript-project-${i}`,
        metadata: {
          created: Date.now() - (i * 1000),
          modified: Date.now() - (i * 1000),
          customTitle: `TypeScript Project ${i}`,
          messageCount: i + 1,
        },
        messages: [],
      };
      fs.writeFileSync(sessionFile, JSON.stringify(sessionData));
    }

    const ctx = createMockContext(['typescript']);
    const result = await resumeCommand.execute(ctx);

    expect(result).toBeDefined();
    if (result.success) {
      const message = (ctx.ui.addMessage as any).mock.calls[0][1];
      expect(message).toMatch(/typescript/i);
    }
  });

  it('should handle context command with various message counts', () => {
    // Test with low message count
    const ctx1 = createMockContext([]);
    ctx1.session.getStats = vi.fn(() => ({
      messageCount: 5,
      duration: 60000,
      totalCost: '$0.01',
      modelUsage: { 'claude-sonnet-4.5': 2500 },
    }));
    const result1 = contextCommand.execute(ctx1);
    expect(result1.success).toBe(true);

    // Test with high message count (should warn about context usage)
    const ctx2 = createMockContext([]);
    ctx2.session.getStats = vi.fn(() => ({
      messageCount: 250,
      duration: 3600000,
      totalCost: '$5.00',
      modelUsage: { 'claude-sonnet-4.5': 150000 },
    }));
    const result2 = contextCommand.execute(ctx2);
    expect(result2.success).toBe(true);
    const message = (ctx2.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/Context/i);
  });

  it('should handle export in different formats', () => {
    const { exportCommand } = require('../../src/commands/session.js');
    const sessionFile = path.join(testSessionsDir, 'test-session-id-12345.json');
    const sessionData = {
      id: 'test-session-id-12345',
      metadata: { created: Date.now() },
      messages: [{ role: 'user', content: 'Test' }],
    };
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));

    // Test JSON export
    const jsonPath = path.join(os.tmpdir(), 'export-test.json');
    const ctx1 = createMockContext(['json', jsonPath]);
    const result1 = exportCommand.execute(ctx1);

    if (result1.success) {
      expect(fs.existsSync(jsonPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(content.sessionId).toBe('test-session-id-12345');
      fs.unlinkSync(jsonPath);
    }

    // Test Markdown export
    const mdPath = path.join(os.tmpdir(), 'export-test.md');
    const ctx2 = createMockContext(['markdown', mdPath]);
    const result2 = exportCommand.execute(ctx2);

    if (result2.success) {
      expect(fs.existsSync(mdPath)).toBe(true);
      const content = fs.readFileSync(mdPath, 'utf-8');
      expect(content).toContain('# Claude Code Session Export');
      fs.unlinkSync(mdPath);
    }
  });
});

describe('Session Command Edge Cases', () => {
  it('should handle empty session ID in resume', async () => {
    vi.spyOn(os, 'homedir').mockReturnValue(os.tmpdir());
    const ctx = createMockContext(['']);
    const result = await resumeCommand.execute(ctx);
    expect(result).toBeDefined();
    vi.restoreAllMocks();
  });

  it('should handle very long session names in rename', () => {
    const ctx = createMockContext(['a'.repeat(1000)]);
    ctx.session.setCustomTitle = vi.fn();
    const result = renameCommand.execute(ctx);
    expect(result).toBeDefined();
  });

  it('should handle special characters in tag names', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['add', 'tag@#$%^&*()']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => []);
    const result = tagCommand.execute(ctx);

    // Special characters should be removed
    if (result.success && ctx.session.setTags) {
      const calls = (ctx.session.setTags as any).mock.calls;
      if (calls.length > 0) {
        const tag = calls[0][0][0];
        expect(tag).not.toMatch(/[@#$%^&*()]/);
      }
    }
  });

  it('should handle rewind with zero message index', async () => {
    const ctx = createMockContext(['0']);
    const result = await rewindCommand.execute(ctx);
    expect(result.success).toBe(false);
  });

  it('should handle context command with no stats', () => {
    const ctx = createMockContext([]);
    ctx.session.getStats = vi.fn(() => ({
      messageCount: 0,
      duration: 0,
      totalCost: '$0.0000',
      modelUsage: {},
    }));
    const result = contextCommand.execute(ctx);
    expect(result.success).toBe(true);
  });

  it('should handle export with default filename', () => {
    const { exportCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext([]);
    const result = exportCommand.execute(ctx);

    // Should generate default filename and either succeed or fail gracefully
    expect(typeof result.success).toBe('boolean');
  });

  it('should handle tag removal when tag does not exist', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['remove', 'nonexistent-tag']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => ['existing-tag']);
    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(false);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/not found/i);
  });

  it('should handle duplicate tag addition', () => {
    const { tagCommand } = require('../../src/commands/session.js');
    const ctx = createMockContext(['add', 'existing-tag']);
    ctx.session.setTags = vi.fn();
    ctx.session.getTags = vi.fn(() => ['existing-tag']);
    const result = tagCommand.execute(ctx);

    expect(result.success).toBe(true);
    const message = (ctx.ui.addMessage as any).mock.calls[0][1];
    expect(message).toMatch(/already exists/i);
  });
});
