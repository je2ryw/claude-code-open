/**
 * Skill 工具 - 完全对齐官网实现
 * 基于官网源码 node_modules/@anthropic-ai/claude-code/cli.js 反编译
 *
 * 2.1.3 修复：ExFAT inode 去重
 * - 使用 64 位精度（BigInt）处理 inode 值
 * - 修复在 ExFAT 等文件系统上 inode 超过 Number.MAX_SAFE_INTEGER 导致的误判
 * - 官网实现：function fo5(A){try{let Q=bo5(A,{bigint:!0});return`${Q.dev}:${Q.ino}`}catch{return null}}
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';

/**
 * 获取文件的唯一标识符（基于 inode）- 对齐官网 fo5 函数
 *
 * 官网实现：
 * function fo5(A){try{let Q=bo5(A,{bigint:!0});return`${Q.dev}:${Q.ino}`}catch{return null}}
 *
 * 使用 BigInt 精度来处理大 inode 值（如 ExFAT 文件系统）
 * 返回格式：`${dev}:${ino}` - 设备号:inode号
 * 这样可以唯一标识一个文件，即使通过不同路径（符号链接）访问
 *
 * @param filePath 文件路径
 * @returns 文件唯一标识符，如果获取失败返回 null
 */
function getFileInode(filePath: string): string | null {
  try {
    // 使用 bigint: true 选项获取 64 位精度的 stat 信息
    // 这对于 ExFAT 等文件系统非常重要，因为它们的 inode 可能超过 Number.MAX_SAFE_INTEGER
    const stats = fs.statSync(filePath, { bigint: true });
    // 返回 dev:ino 格式的字符串，确保唯一性
    return `${stats.dev}:${stats.ino}`;
  } catch {
    // 如果无法获取 stat（如文件不存在、权限问题等），返回 null
    return null;
  }
}

interface SkillInput {
  skill: string;
  args?: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  'allowed-tools'?: string;
  'argument-hint'?: string;
  'when-to-use'?: string;
  when_to_use?: string;
  version?: string;
  model?: string;
  'user-invocable'?: string;
  'disable-model-invocation'?: string;
  [key: string]: any;
}

interface SkillDefinition {
  skillName: string;
  displayName: string;
  description: string;
  hasUserSpecifiedDescription: boolean;
  markdownContent: string;
  allowedTools?: string[];
  argumentHint?: string;
  whenToUse?: string;
  version?: string;
  model?: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  source: 'user' | 'project' | 'plugin';
  baseDir: string;
  filePath: string;
  loadedFrom: 'skills' | 'commands_DEPRECATED';
}

// 全局状态：已调用的 skills（对齐官网 KP0/VP0）
const invokedSkills = new Map<string, {
  skillName: string;
  skillPath: string;
  content: string;
  invokedAt: number;
}>();

// Skill 注册表
const skillRegistry = new Map<string, SkillDefinition>();
let skillsLoaded = false;

/**
 * 记录已调用的 skill（对齐官网 KP0 函数）
 */
function recordInvokedSkill(skillName: string, skillPath: string, content: string): void {
  invokedSkills.set(skillName, {
    skillName,
    skillPath,
    content,
    invokedAt: Date.now(),
  });
}

/**
 * 获取已调用的 skills（对齐官网 VP0 函数）
 */
export function getInvokedSkills(): Map<string, any> {
  return invokedSkills;
}

/**
 * 解析 frontmatter（对齐官网 NV 函数）
 * 官网实现：
 * function NV(A) {
 *   let Q = /^---\s*\n([\s\S]*?)---\s*\n?/;
 *   let B = A.match(Q);
 *   if (!B) return { frontmatter: {}, content: A };
 *   let G = B[1] || "";
 *   let Z = A.slice(B[0].length);
 *   let Y = {};
 *   let J = G.split('\n');
 *   for (let X of J) {
 *     let I = X.indexOf(":");
 *     if (I > 0) {
 *       let W = X.slice(0, I).trim();
 *       let K = X.slice(I + 1).trim();
 *       if (W) {
 *         let V = K.replace(/^["']|["']$/g, "");
 *         Y[W] = V;
 *       }
 *     }
 *   }
 *   return { frontmatter: Y, content: Z };
 * }
 */
function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; content: string } {
  const regex = /^---\s*\n([\s\S]*?)---\s*\n?/;
  const match = content.match(regex);

  if (!match) {
    return { frontmatter: {}, content };
  }

  const frontmatterText = match[1] || '';
  const bodyContent = content.slice(match[0].length);
  const frontmatter: SkillFrontmatter = {};

  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (key) {
        // 移除前后的引号
        const cleanValue = value.replace(/^["']|["']$/g, '');
        frontmatter[key] = cleanValue;
      }
    }
  }

  return { frontmatter, content: bodyContent };
}

/**
 * 解析 allowed-tools 字段
 * 官网支持字符串或数组
 */
function parseAllowedTools(value: string | undefined): string[] | undefined {
  if (!value) return undefined;

  // 如果是逗号分隔的字符串
  if (value.includes(',')) {
    return value.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  // 单个工具
  if (value.trim()) {
    return [value.trim()];
  }

  return undefined;
}

/**
 * 解析布尔值字段
 */
function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (!value) return defaultValue;
  const lower = value.toLowerCase().trim();
  return ['true', '1', 'yes'].includes(lower);
}

/**
 * 构建 Skill 对象（对齐官网 AY9 函数）
 */
function buildSkillDefinition(params: {
  skillName: string;
  displayName?: string;
  description?: string;
  hasUserSpecifiedDescription: boolean;
  markdownContent: string;
  allowedTools?: string[];
  argumentHint?: string;
  whenToUse?: string;
  version?: string;
  model?: string;
  disableModelInvocation: boolean;
  userInvocable: boolean;
  source: 'user' | 'project' | 'plugin';
  baseDir: string;
  filePath: string;
  loadedFrom: 'skills' | 'commands_DEPRECATED';
}): SkillDefinition {
  return {
    skillName: params.skillName,
    displayName: params.displayName || params.skillName,
    description: params.description || '',
    hasUserSpecifiedDescription: params.hasUserSpecifiedDescription,
    markdownContent: params.markdownContent,
    allowedTools: params.allowedTools,
    argumentHint: params.argumentHint,
    whenToUse: params.whenToUse,
    version: params.version,
    model: params.model,
    disableModelInvocation: params.disableModelInvocation,
    userInvocable: params.userInvocable,
    source: params.source,
    baseDir: params.baseDir,
    filePath: params.filePath,
    loadedFrom: params.loadedFrom,
  };
}

/**
 * 从文件创建 Skill（简化版 CPA 函数）
 */
function createSkillFromFile(
  skillName: string,
  fileInfo: {
    filePath: string;
    baseDir: string;
    frontmatter: SkillFrontmatter;
    content: string;
  },
  source: 'user' | 'project' | 'plugin',
  isSkillMode: boolean
): SkillDefinition | null {
  const { frontmatter, content, filePath, baseDir } = fileInfo;

  // 解析 frontmatter
  const displayName = frontmatter.name || skillName;
  const description = frontmatter.description || '';
  const allowedTools = parseAllowedTools(frontmatter['allowed-tools']);
  const argumentHint = frontmatter['argument-hint'];
  const whenToUse = frontmatter['when-to-use'] || frontmatter.when_to_use;
  const version = frontmatter.version;
  const model = frontmatter.model;
  const disableModelInvocation = parseBoolean(frontmatter['disable-model-invocation']);
  const userInvocable = parseBoolean(frontmatter['user-invocable'], true);

  return buildSkillDefinition({
    skillName,
    displayName,
    description,
    hasUserSpecifiedDescription: !!frontmatter.description,
    markdownContent: content,
    allowedTools,
    argumentHint,
    whenToUse,
    version,
    model,
    disableModelInvocation,
    userInvocable,
    source,
    baseDir,
    filePath,
    loadedFrom: isSkillMode ? 'skills' : 'commands_DEPRECATED',
  });
}

/**
 * 从目录加载 skills（完全对齐官网 d62 函数）
 *
 * 官网实现逻辑：
 * async function d62(A, Q, B, G, Z, Y) {
 *   let J = jA(), X = [];
 *   try {
 *     if (!J.existsSync(A)) return [];
 *
 *     // 1. 检查根目录的 SKILL.md（单文件模式）
 *     let I = QKA(A, "SKILL.md");
 *     if (J.existsSync(I)) {
 *       // 加载单个 skill，使用目录名作为 skillName
 *       let K = J.readFileSync(I, { encoding: "utf-8" });
 *       let { frontmatter: V, content: H } = NV(K);
 *       let D = `${Q}:${BKA(A)}`;  // namespace:basename
 *       let F = { filePath: I, baseDir: Ko(I), frontmatter: V, content: H };
 *       let E = CPA(D, F, B, G, Z, !0, { isSkillMode: !0 });
 *       if (E) X.push(E);
 *       return X;
 *     }
 *
 *     // 2. 遍历子目录，查找每个子目录下的 SKILL.md
 *     let W = J.readdirSync(A);
 *     for (let K of W) {
 *       if (!K.isDirectory() && !K.isSymbolicLink()) continue;
 *       let V = QKA(A, K.name);
 *       let H = QKA(V, "SKILL.md");
 *       if (J.existsSync(H)) {
 *         let D = J.readFileSync(H, { encoding: "utf-8" });
 *         let { frontmatter: F, content: E } = NV(D);
 *         let z = `${Q}:${K.name}`;  // namespace:dirname
 *         let $ = { filePath: H, baseDir: Ko(H), frontmatter: F, content: E };
 *         let L = CPA(z, $, B, G, Z, !0, { isSkillMode: !0 });
 *         if (L) X.push(L);
 *       }
 *     }
 *   } catch (I) {
 *     console.error(`Failed to load skills from directory ${A}: ${I}`);
 *   }
 *   return X;
 * }
 */
async function loadSkillsFromDirectory(
  dirPath: string,
  namespace: 'user' | 'project' | 'plugin'
): Promise<SkillDefinition[]> {
  const results: SkillDefinition[] = [];

  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    // 1. 检查根目录的 SKILL.md（单文件模式）
    const rootSkillFile = path.join(dirPath, 'SKILL.md');
    if (fs.existsSync(rootSkillFile)) {
      try {
        const content = fs.readFileSync(rootSkillFile, { encoding: 'utf-8' });
        const { frontmatter, content: markdownContent } = parseFrontmatter(content);

        // 使用目录名作为 skillName
        const skillName = `${namespace}:${path.basename(dirPath)}`;

        const skill = createSkillFromFile(
          skillName,
          {
            filePath: rootSkillFile,
            baseDir: path.dirname(rootSkillFile),
            frontmatter,
            content: markdownContent,
          },
          namespace,
          true // isSkillMode
        );

        if (skill) {
          results.push(skill);
        }
      } catch (error) {
        console.error(`Failed to load skill from ${rootSkillFile}:`, error);
      }

      return results;
    }

    // 2. 遍历子目录，查找每个子目录下的 SKILL.md
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) {
        continue;
      }

      const subDirPath = path.join(dirPath, entry.name);
      const skillFile = path.join(subDirPath, 'SKILL.md');

      if (fs.existsSync(skillFile)) {
        try {
          const content = fs.readFileSync(skillFile, { encoding: 'utf-8' });
          const { frontmatter, content: markdownContent } = parseFrontmatter(content);

          // 使用子目录名作为 skillName（带命名空间）
          const skillName = `${namespace}:${entry.name}`;

          const skill = createSkillFromFile(
            skillName,
            {
              filePath: skillFile,
              baseDir: path.dirname(skillFile),
              frontmatter,
              content: markdownContent,
            },
            namespace,
            true // isSkillMode
          );

          if (skill) {
            results.push(skill);
          }
        } catch (error) {
          console.error(`Failed to load skill from ${skillFile}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Failed to load skills from directory ${dirPath}:`, error);
  }

  return results;
}

/**
 * 发现嵌套的 .claude/skills 目录 (v2.1.6+)
 *
 * 搜索当前工作目录下所有子目录中的 .claude/skills 目录
 * 用于支持 monorepo 等场景
 */
function discoverNestedSkillsDirectories(rootDir: string, maxDepth: number = 3): string[] {
  const result: string[] = [];

  function scanDir(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // 跳过隐藏目录（除了 .claude）
        if (entry.name.startsWith('.') && entry.name !== '.claude') continue;

        // 跳过常见的不需要扫描的目录
        if (['node_modules', 'vendor', 'dist', 'build', 'out', '.git', '__pycache__', '.venv', 'venv'].includes(entry.name)) {
          continue;
        }

        const subDirPath = path.join(dir, entry.name);

        // 检查是否有 .claude/skills 目录
        if (entry.name === '.claude') {
          const skillsDir = path.join(subDirPath, 'skills');
          if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
            result.push(skillsDir);
          }
        } else {
          // 继续递归扫描
          scanDir(subDirPath, depth + 1);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  scanDir(rootDir, 0);
  return result;
}

/**
 * 获取已启用的插件列表（对齐官网 u7 函数）
 *
 * enabledPlugins 格式：{ "plugin-name@marketplace": true/false }
 * 返回格式：Set<"plugin-name@marketplace">
 */
function getEnabledPlugins(): Set<string> {
  const enabledPlugins = new Set<string>();
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');

  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, { encoding: 'utf-8' });
      const settings = JSON.parse(content);

      if (settings.enabledPlugins && typeof settings.enabledPlugins === 'object') {
        for (const [pluginId, enabled] of Object.entries(settings.enabledPlugins)) {
          if (enabled === true) {
            enabledPlugins.add(pluginId);
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to read enabledPlugins from settings:', error);
  }

  return enabledPlugins;
}

/**
 * 从插件缓存目录加载 skills（对齐官网 sG0 函数）
 *
 * 官网实现：
 * - 先通过 u7() 获取已启用的插件列表
 * - 只加载已启用插件的 skills
 * - 插件 skills 存储在 ~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/skills/{skill-name}/SKILL.md
 * - 命名空间格式：{plugin-name}:{skill-name}
 */
async function loadSkillsFromPluginCache(): Promise<SkillDefinition[]> {
  const results: SkillDefinition[] = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const pluginsCacheDir = path.join(homeDir, '.claude', 'plugins', 'cache');

  // 获取已启用的插件列表（对齐官网 u7 函数）
  const enabledPlugins = getEnabledPlugins();

  try {
    if (!fs.existsSync(pluginsCacheDir)) {
      return [];
    }

    // 遍历 marketplace 目录
    const marketplaces = fs.readdirSync(pluginsCacheDir, { withFileTypes: true });
    for (const marketplace of marketplaces) {
      if (!marketplace.isDirectory()) continue;

      const marketplacePath = path.join(pluginsCacheDir, marketplace.name);
      const plugins = fs.readdirSync(marketplacePath, { withFileTypes: true });

      for (const plugin of plugins) {
        if (!plugin.isDirectory()) continue;

        // 检查插件是否启用（对齐官网实现）
        // enabledPlugins 格式：{plugin-name}@{marketplace}
        const pluginId = `${plugin.name}@${marketplace.name}`;
        if (!enabledPlugins.has(pluginId)) {
          continue; // 跳过未启用的插件
        }

        const pluginPath = path.join(marketplacePath, plugin.name);
        const versions = fs.readdirSync(pluginPath, { withFileTypes: true });

        for (const version of versions) {
          if (!version.isDirectory()) continue;

          // 检查 skills 目录
          const skillsPath = path.join(pluginPath, version.name, 'skills');
          if (!fs.existsSync(skillsPath)) continue;

          const skillDirs = fs.readdirSync(skillsPath, { withFileTypes: true });
          for (const skillDir of skillDirs) {
            if (!skillDir.isDirectory()) continue;

            // 查找 SKILL.md
            const skillMdPath = path.join(skillsPath, skillDir.name, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) continue;

            try {
              const content = fs.readFileSync(skillMdPath, { encoding: 'utf-8' });
              const { frontmatter, content: markdownContent } = parseFrontmatter(content);

              // 命名空间格式：{plugin-name}:{skill-name}（对齐官网格式）
              const skillName = `${plugin.name}:${skillDir.name}`;

              const skill = createSkillFromFile(
                skillName,
                {
                  filePath: skillMdPath,
                  baseDir: path.dirname(skillMdPath),
                  frontmatter,
                  content: markdownContent,
                },
                'plugin',
                true // isSkillMode
              );

              if (skill) {
                results.push(skill);
              }
            } catch (error) {
              console.error(`Failed to load skill from ${skillMdPath}:`, error);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`Failed to load skills from plugin cache:`, error);
  }

  return results;
}

/**
 * 初始化并加载所有 skills（对齐官网 JN0 函数）
 *
 * 官网实现包含基于 inode 的去重逻辑：
 * ```
 * let W=new Map,D=[];
 * for(let{skill:V,filePath:F}of I){
 *   if(V.type!=="prompt")continue;
 *   let H=fo5(F);  // fo5 获取 inode
 *   if(H===null){D.push(V);continue}
 *   let E=W.get(H);
 *   if(E!==void 0){
 *     k(`Skipping duplicate skill '${V.name}' from ${V.source} (same inode already loaded from ${E})`);
 *     continue
 *   }
 *   W.set(H,V.source),D.push(V)
 * }
 * ```
 */
export async function initializeSkills(): Promise<void> {
  if (skillsLoaded) return;

  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const claudeDir = path.join(homeDir, '.claude');
  const projectDir = path.join(process.cwd(), '.claude');

  // 清空注册表
  skillRegistry.clear();

  // 收集所有 skills（带 filePath）
  const allSkillsWithPath: Array<{ skill: SkillDefinition; filePath: string }> = [];

  // 1. 加载插件 skills（优先级最低）
  const pluginSkills = await loadSkillsFromPluginCache();
  for (const skill of pluginSkills) {
    allSkillsWithPath.push({ skill, filePath: skill.filePath });
  }

  // 2. 加载用户级 skills
  const userSkillsDir = path.join(claudeDir, 'skills');
  const userSkills = await loadSkillsFromDirectory(userSkillsDir, 'user');
  for (const skill of userSkills) {
    allSkillsWithPath.push({ skill, filePath: skill.filePath });
  }

  // 3. 加载项目级 skills（优先级最高）
  const projectSkillsDir = path.join(projectDir, 'skills');
  const projectSkills = await loadSkillsFromDirectory(projectSkillsDir, 'project');
  for (const skill of projectSkills) {
    allSkillsWithPath.push({ skill, filePath: skill.filePath });
  }

  // 4. v2.1.6+: 发现并加载嵌套的 .claude/skills 目录
  // 搜索当前工作目录下子目录中的 .claude/skills 目录
  const nestedSkillsDirs = discoverNestedSkillsDirectories(process.cwd());
  for (const nestedDir of nestedSkillsDirs) {
    // 避免重复加载根目录的 skills
    if (nestedDir === projectSkillsDir) continue;

    const nestedSkills = await loadSkillsFromDirectory(nestedDir, 'project');
    for (const skill of nestedSkills) {
      // 添加子目录路径前缀以区分来源
      const relativePath = path.relative(process.cwd(), nestedDir);
      const parentDir = path.dirname(path.dirname(relativePath)); // 获取 .claude 的父目录
      const prefixedSkillName = parentDir ? `${skill.skillName}@${parentDir}` : skill.skillName;

      // 重新设置 skillName 以包含路径前缀
      // source 保持为 'project'，但在 skillName 中添加路径信息以区分来源
      const modifiedSkill = {
        ...skill,
        skillName: prefixedSkillName,
        // source 必须是 'user' | 'plugin' | 'project'，使用 project 表示嵌套的项目级 skills
      };

      allSkillsWithPath.push({ skill: modifiedSkill, filePath: skill.filePath });
    }
  }

  // 基于 inode 去重（对齐官网 JN0 函数）
  // 使用 Map<inode, source> 记录已加载的 inode
  const seenInodes = new Map<string, string>();
  const uniqueSkills: SkillDefinition[] = [];
  let duplicateCount = 0;

  for (const { skill, filePath } of allSkillsWithPath) {
    // 获取文件的 inode（使用 64 位精度）
    const inode = getFileInode(filePath);

    if (inode === null) {
      // 无法获取 inode，直接添加（不进行去重）
      uniqueSkills.push(skill);
      continue;
    }

    // 检查是否已存在相同 inode 的 skill
    const existingSource = seenInodes.get(inode);
    if (existingSource !== undefined) {
      // 跳过重复的 skill（对齐官网日志格式）
      console.log(`Skipping duplicate skill '${skill.skillName}' from ${skill.source} (same inode already loaded from ${existingSource})`);
      duplicateCount++;
      continue;
    }

    // 记录 inode 并添加 skill
    seenInodes.set(inode, skill.source);
    uniqueSkills.push(skill);
  }

  // 将去重后的 skills 添加到注册表
  for (const skill of uniqueSkills) {
    skillRegistry.set(skill.skillName, skill);
  }

  // 输出去重统计（对齐官网日志格式）
  if (duplicateCount > 0) {
    console.log(`Deduplicated ${duplicateCount} skills (same inode)`);
  }

  skillsLoaded = true;

  console.log(`Loaded ${skillRegistry.size} unique skills (plugin: ${pluginSkills.length}, user: ${userSkills.length}, project: ${projectSkills.length})`);
}

/**
 * 清除缓存
 */
export function clearSkillCache(): void {
  skillRegistry.clear();
  skillsLoaded = false;
}

/**
 * 获取所有 skills
 */
export function getAllSkills(): SkillDefinition[] {
  return Array.from(skillRegistry.values());
}

/**
 * 查找 skill（支持命名空间）
 */
export function findSkill(skillInput: string): SkillDefinition | undefined {
  // 1. 精确匹配
  if (skillRegistry.has(skillInput)) {
    return skillRegistry.get(skillInput);
  }

  // 2. 如果没有命名空间，尝试查找第一个匹配的 skill
  if (!skillInput.includes(':')) {
    for (const [fullName, skill] of skillRegistry.entries()) {
      const parts = fullName.split(':');
      const name = parts[parts.length - 1];
      if (name === skillInput) {
        return skill;
      }
    }
  }

  return undefined;
}

/**
 * Skill 工具类
 */
export class SkillTool extends BaseTool<SkillInput, any> {
  name = 'Skill';

  get description(): string {
    const skills = getAllSkills();
    const skillsXml = skills.map(skill => {
      return `<skill>
<name>
${skill.skillName}
</name>
<description>
${skill.description}
</description>
<location>
${skill.source}
</location>
</skill>`;
    }).join('\n');

    return `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.

<example>
User: "run /commit"
Assistant: [Calls Skill tool with skill: "commit"]
</example>

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments
  - \`skill: "review-pr", args: "123"\` - invoke with arguments
  - \`skill: "user:pdf"\` - invoke using fully qualified name

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
</skills_instructions>

<available_skills>
${skillsXml}
</available_skills>
`;
  }

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        skill: {
          type: 'string',
          description: 'The skill name. E.g., "pdf", "user:my-skill"',
        },
        args: {
          type: 'string',
          description: 'Optional arguments for the skill',
        },
      },
      required: ['skill'],
    };
  }

  async execute(input: SkillInput): Promise<any> {
    const { skill: skillInput, args } = input;

    // 确保 skills 已加载
    if (!skillsLoaded) {
      await initializeSkills();
    }

    // 查找 skill
    const skill = findSkill(skillInput);
    if (!skill) {
      const available = Array.from(skillRegistry.keys()).join(', ');
      return {
        success: false,
        error: `Skill "${skillInput}" not found. Available skills: ${available || 'none'}`,
      };
    }

    // 检查是否禁用模型调用
    if (skill.disableModelInvocation) {
      return {
        success: false,
        error: `Skill "${skill.skillName}" has model invocation disabled`,
      };
    }

    // 构建输出内容
    let skillContent = skill.markdownContent;
    if (args) {
      skillContent += `\n\n**ARGUMENTS:** ${args}`;
    }

    // 记录已调用的 skill（对齐官网 KP0）
    recordInvokedSkill(skill.skillName, skill.filePath, skillContent);

    // 构建 skill 内容消息（对齐官网格式）
    // 官网实现：skill 内容通过 newMessages 传递，而不是 tool_result
    let skillMessage = `<command-message>The "${skill.displayName}" skill is loading</command-message>\n\n`;
    skillMessage += `<skill name="${skill.skillName}" location="${skill.source}"`;

    if (skill.version) {
      skillMessage += ` version="${skill.version}"`;
    }
    if (skill.model) {
      skillMessage += ` model="${skill.model}"`;
    }
    if (skill.allowedTools && skill.allowedTools.length > 0) {
      skillMessage += ` allowed-tools="${skill.allowedTools.join(',')}"`;
    }

    skillMessage += `>\n${skillContent}\n</skill>`;

    // 对齐官网实现：
    // - output（tool_result 内容）只是简短的 "Launching skill: xxx"
    // - skill 的完整内容通过 newMessages 作为独立的 user 消息传递
    return {
      success: true,
      output: `Launching skill: ${skill.displayName}`,
      // 官网格式的额外字段
      commandName: skill.displayName,
      allowedTools: skill.allowedTools,
      model: skill.model,
      // newMessages：skill 内容作为独立的 user 消息（对齐官网实现）
      newMessages: [
        {
          role: 'user' as const,
          content: [
            {
              type: 'text' as const,
              text: skillMessage,
            },
          ],
        },
      ],
    };
  }
}

/**
 * 启用技能热重载（占位函数）
 *
 * 注：完整的热重载功能需要 chokidar 库支持
 * 这里提供一个占位实现，避免导入错误
 */
export function enableSkillHotReload(): void {
  // 热重载功能的占位实现
  // 完整实现需要监听 ~/.claude/skills 和 .claude/skills 目录
  console.log('[Skill] Hot reload feature is available');
}

/**
 * 禁用技能热重载
 */
export function disableSkillHotReload(): void {
  // 占位实现
  console.log('[Skill] Hot reload disabled');
}
