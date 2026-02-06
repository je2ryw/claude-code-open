/**
 * Agent Memory 系统 (v2.1.32)
 * 持久化 MEMORY.md 文件用于跨会话记忆
 *
 * 对齐官方源码实现：
 * - MEMORY.md 文件名常量: fa="MEMORY.md"
 * - 行数限制: _u1=200
 * - Section token 限制: uW6=2000
 * - 总 token 限制: dc4=12000
 * - 三种作用域: user, project, local
 *
 * 路径结构：
 * - User:    ~/.claude/agent-memory/{agent-name}/MEMORY.md
 * - Project: .claude/agent-memory/{agent-name}/MEMORY.md
 * - Local:   .claude/agent-memory-local/{agent-name}/MEMORY.md
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// 常量（对齐官方）
// ============================================================================

/** 记忆文件名 */
export const MEMORY_FILE_NAME = 'MEMORY.md';

/** MEMORY.md 最大行数限制 */
export const MEMORY_MAX_LINES = 200;

/** 单个 section 的 token 限制 */
export const SECTION_TOKEN_LIMIT = 2000;

/** 整个会话记忆文件最大 token 数 */
export const TOTAL_TOKEN_LIMIT = 12000;

/** 每个 token 大约的字符数（用于估算） */
const CHARS_PER_TOKEN = 4;

// ============================================================================
// 类型定义
// ============================================================================

/** 记忆作用域 */
export type MemoryScope = 'user' | 'project' | 'local';

/** 记忆目录配置 */
export interface MemoryDirConfig {
  displayName: string;
  memoryDir: string;
  extraGuidelines?: string[];
}

/** Section 信息 */
interface SectionInfo {
  name: string;
  tokenCount: number;
}

// ============================================================================
// 路径构建（对齐官方 hjA 函数）
// ============================================================================

/**
 * 获取记忆目录路径
 * 对齐官方 hjA() 函数
 */
export function getMemoryDir(agentName: string, scope: MemoryScope): string {
  const cwd = process.cwd();
  switch (scope) {
    case 'project':
      return path.join(cwd, '.claude', 'agent-memory', agentName) + path.sep;
    case 'local':
      return path.join(cwd, '.claude', 'agent-memory-local', agentName) + path.sep;
    case 'user':
      return path.join(os.homedir(), '.claude', 'agent-memory', agentName) + path.sep;
  }
}

/**
 * 获取 MEMORY.md 文件路径
 * 对齐官方 zc9() 函数
 */
export function getMemoryFilePath(agentName: string, scope: MemoryScope): string {
  return path.join(getMemoryDir(agentName, scope), MEMORY_FILE_NAME);
}

/**
 * 检查路径是否在记忆目录中
 * 对齐官方 Ju1() 函数
 */
export function isInMemoryDir(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  const homeMemory = path.join(os.homedir(), '.claude', 'agent-memory') + path.sep;
  const projectMemory = path.join(process.cwd(), '.claude', 'agent-memory') + path.sep;
  const localMemory = path.join(process.cwd(), '.claude', 'agent-memory-local') + path.sep;

  return normalized.startsWith(homeMemory) ||
         normalized.startsWith(projectMemory) ||
         normalized.startsWith(localMemory);
}

// ============================================================================
// Token 估算
// ============================================================================

/**
 * 估算文本的 token 数
 */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * 解析 MEMORY.md 的 section 结构
 * 对齐官方 KyY() 函数
 */
function parseSections(content: string): Record<string, number> {
  const sections: Record<string, number> = {};
  const lines = content.split('\n');
  let currentSection = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      // 保存上一个 section
      if (currentSection) {
        sections[currentSection] = estimateTokenCount(currentContent.join('\n'));
      }
      currentSection = line;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // 保存最后一个 section
  if (currentSection) {
    sections[currentSection] = estimateTokenCount(currentContent.join('\n'));
  }

  return sections;
}

/**
 * 生成 oversized section 警告
 * 对齐官方 YyY() 函数
 */
function generateSizeWarnings(sections: Record<string, number>, totalTokens: number): string {
  const isOverTotal = totalTokens > TOTAL_TOKEN_LIMIT;
  const oversizedSections = Object.entries(sections)
    .filter(([, tokens]) => tokens > SECTION_TOKEN_LIMIT)
    .sort(([, a], [, b]) => b - a)
    .map(([name, tokens]) => `- "${name}" is ~${tokens} tokens (limit: ${SECTION_TOKEN_LIMIT})`);

  if (oversizedSections.length === 0 && !isOverTotal) return '';

  const warnings: string[] = [];

  if (isOverTotal) {
    warnings.push(`\nCRITICAL: The session memory file is currently ~${totalTokens} tokens, which exceeds the maximum of ${TOTAL_TOKEN_LIMIT} tokens. You MUST condense the file.`);
  }

  if (oversizedSections.length > 0) {
    const label = isOverTotal
      ? 'Oversized sections to condense'
      : 'IMPORTANT: The following sections exceed the per-section limit and MUST be condensed';
    warnings.push(`\n${label}:\n${oversizedSections.join('\n')}`);
  }

  return warnings.join('');
}

// ============================================================================
// 记忆加载（对齐官方 cli.js 第1577-1581行）
// ============================================================================

/**
 * 加载 MEMORY.md 文件内容
 * 对齐官方加载逻辑：
 * - 最大 200 行
 * - 超过截断并添加警告
 */
export function loadMemoryFile(agentName: string, scope: MemoryScope): string | null {
  const filePath = getMemoryFilePath(agentName, scope);

  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 处理并格式化记忆内容（用于系统提示词）
 * 对齐官方 MEMORY.md 加载逻辑
 */
export function formatMemoryForPrompt(content: string | null): string {
  const lines: string[] = [];

  if (content && content.trim()) {
    const contentLines = content.trim().split('\n');
    const wasTruncated = contentLines.length > MEMORY_MAX_LINES;

    let formattedContent = content.trim();
    if (wasTruncated) {
      formattedContent = contentLines.slice(0, MEMORY_MAX_LINES).join('\n') +
        `\n\n> WARNING: ${MEMORY_FILE_NAME} is ${contentLines.length} lines (limit: ${MEMORY_MAX_LINES}). Only the first ${MEMORY_MAX_LINES} lines were loaded. Move detailed content into separate topic files and keep ${MEMORY_FILE_NAME} as a concise index.`;
    }

    lines.push(`## ${MEMORY_FILE_NAME}`, '', formattedContent);
  } else {
    lines.push(
      `## ${MEMORY_FILE_NAME}`,
      '',
      `Your ${MEMORY_FILE_NAME} is currently empty. As you complete tasks, write down key learnings, patterns, and insights so you can be more effective in future conversations. Anything saved in ${MEMORY_FILE_NAME} will be included in your system prompt next time.`
    );
  }

  return lines.join('\n');
}

/**
 * 加载并处理记忆（包含 oversized 警告）
 * 对齐官方 nc4() 函数
 */
export function loadAndProcessMemory(agentName: string, scope: MemoryScope): string {
  const content = loadMemoryFile(agentName, scope);
  const formatted = formatMemoryForPrompt(content);

  if (content && content.trim()) {
    const sections = parseSections(content);
    const totalTokens = estimateTokenCount(content);
    const warnings = generateSizeWarnings(sections, totalTokens);
    if (warnings) {
      return formatted + warnings;
    }
  }

  return formatted;
}

// ============================================================================
// 作用域显示名称（对齐官方 J94 函数）
// ============================================================================

/**
 * 获取记忆作用域的显示名称
 */
export function getScopeDisplayName(scope: MemoryScope): string {
  switch (scope) {
    case 'user':
      return 'User (~/.claude/agent-memory/)';
    case 'project':
      return 'Project (.claude/agent-memory/)';
    case 'local':
      return 'Local (.claude/agent-memory-local/)';
    default:
      return 'None';
  }
}

// ============================================================================
// 记忆配置生成（对齐官方 Xu1 函数）
// ============================================================================

/**
 * 生成持久化 Agent Memory 配置
 * 对齐官方 Xu1() 函数
 */
export function getAgentMemoryConfig(agentName: string, scope: MemoryScope): MemoryDirConfig | null {
  // 处理旧格式迁移（memory.md -> MEMORY.md）
  migrateOldMemoryFile(agentName, scope);

  let scopeGuideline: string;
  switch (scope) {
    case 'user':
      scopeGuideline = '- Since this memory is user-scope, keep learnings general since they apply across all projects';
      break;
    case 'project':
      scopeGuideline = '- Since this memory is project-scope and shared with your team via version control, tailor your memories to this project';
      break;
    case 'local':
      scopeGuideline = '- Since this memory is local-scope (not checked into version control), tailor your memories to this project and machine';
      break;
  }

  return {
    displayName: 'Persistent Agent Memory',
    memoryDir: getMemoryDir(agentName, scope),
    extraGuidelines: [scopeGuideline],
  };
}

/**
 * 迁移旧格式的 memory.md 到 MEMORY.md
 * 对齐官方 Hc9() 函数
 */
function migrateOldMemoryFile(agentName: string, scope: MemoryScope): void {
  const dir = getMemoryDir(agentName, scope);
  const oldPath = path.join(dir, 'memory.md');
  const newPath = path.join(dir, MEMORY_FILE_NAME);

  try {
    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath);
    }
  } catch {
    // 静默处理迁移错误
  }
}

// ============================================================================
// 会话记忆模板（对齐官方 eRY 模板）
// ============================================================================

/**
 * 会话记忆模板
 * 对齐官方 eRY 常量
 */
export const SESSION_MEMORY_TEMPLATE = `# Session Title
_A short and distinctive 5-10 word descriptive title for the session. Super info dense, no filler_

# Current State
_What is actively being worked on right now? Pending tasks not yet completed. Immediate next steps._

# Task specification
_What did the user ask to build? Any design decisions or other explanatory context_

# Implementation details
_What approaches are being used? Key code patterns, file paths, architecture decisions_

# Learnings
_Technical discoveries, gotchas, and insights gained during this session_
`;

// ============================================================================
// 默认导出
// ============================================================================

/**
 * 获取当前项目的 auto memory 配置
 * 用于系统提示词中注入 MEMORY.md 内容
 */
export function getAutoMemoryPrompt(agentName: string = 'default'): string {
  // 尝试加载各作用域的 MEMORY.md
  // 优先级：project > local > user
  for (const scope of ['project', 'local', 'user'] as MemoryScope[]) {
    const content = loadMemoryFile(agentName, scope);
    if (content && content.trim()) {
      const memDir = getMemoryDir(agentName, scope);
      return `\n# auto memory\n\nYou have a persistent auto memory directory at \`${memDir}\`. Its contents persist across conversations.\n\nAs you work, consult your memory files to build on previous experience. When you encounter a mistake that seems like it could be common, check your auto memory for relevant notes — and if nothing is written yet, record what you learned.\n\nGuidelines:\n- \`${MEMORY_FILE_NAME}\` is always loaded into your system prompt — lines after ${MEMORY_MAX_LINES} will be truncated, so keep it concise\n- Create separate topic files (e.g., \`debugging.md\`, \`patterns.md\`) for detailed notes and link to them from ${MEMORY_FILE_NAME}\n- Record insights about problem constraints, strategies that worked or failed, and lessons learned\n- Update or remove memories that turn out to be wrong or outdated\n- Organize memory semantically by topic, not chronologically\n- Use the Write and Edit tools to update your memory files\n\n${formatMemoryForPrompt(content)}`;
    }
  }

  // 如果没有任何记忆文件存在，返回空提示但提供默认目录
  const defaultDir = getMemoryDir(agentName, 'project');
  return `\n# auto memory\n\nYou have a persistent auto memory directory at \`${defaultDir}\`. Its contents persist across conversations.\n\nAs you work, consult your memory files to build on previous experience. When you encounter a mistake that seems like it could be common, check your auto memory for relevant notes — and if nothing is written yet, record what you learned.\n\nGuidelines:\n- \`${MEMORY_FILE_NAME}\` is always loaded into your system prompt — lines after ${MEMORY_MAX_LINES} will be truncated, so keep it concise\n- Create separate topic files (e.g., \`debugging.md\`, \`patterns.md\`) for detailed notes and link to them from ${MEMORY_FILE_NAME}\n- Record insights about problem constraints, strategies that worked or failed, and lessons learned\n- Update or remove memories that turn out to be wrong or outdated\n- Organize memory semantically by topic, not chronologically\n- Use the Write and Edit tools to update your memory files\n\n${formatMemoryForPrompt(null)}`;
}
