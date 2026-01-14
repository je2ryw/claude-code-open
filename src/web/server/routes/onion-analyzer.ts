/**
 * 洋葱架构分析器
 * Onion Architecture Analyzer
 *
 * 负责分析项目代码并生成四层洋葱数据：
 * 1. 项目意图 (Project Intent)
 * 2. 业务领域 (Business Domain)
 * 3. 关键流程 (Key Process)
 * 4. 实现细节 (Implementation)
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  OnionLayer,
  ProjectIntentData,
  BusinessDomainData,
  KeyProcessData,
  ImplementationData,
  SemanticAnnotation,
  DomainNode,
  DomainRelationship,
  ProcessFlow,
  ProcessStep,
  FileDetail,
  SymbolDetail,
} from '../../shared/onion-types.js';

// ============================================================================
// 缓存管理
// ============================================================================

interface CacheEntry<T> {
  data: T;
  hash: string;
  timestamp: number;
  layer: number;
}

const cache = new Map<string, CacheEntry<any>>();

const CACHE_TTL = {
  1: 24 * 60 * 60 * 1000,  // 项目意图：24小时
  2: 12 * 60 * 60 * 1000,  // 业务领域：12小时
  3: 6 * 60 * 60 * 1000,   // 关键流程：6小时
  4: 1 * 60 * 60 * 1000,   // 实现细节：1小时
};

function getCacheKey(layer: number, contextId?: string): string {
  return `onion:${layer}:${contextId || 'root'}`;
}

/**
 * 带缓存状态的返回结构
 */
interface CacheResult<T> {
  data: T | null;
  fromCache: boolean;
}

function getFromCache<T>(layer: number, contextId?: string): T | null {
  const key = getCacheKey(layer, contextId);
  const entry = cache.get(key);
  if (!entry) return null;

  const ttl = CACHE_TTL[layer as keyof typeof CACHE_TTL] || 60 * 60 * 1000;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

/**
 * 获取缓存数据，同时返回缓存状态
 * 用于 API 返回时指示数据是否来自缓存
 */
function getFromCacheWithStatus<T>(layer: number, contextId?: string): CacheResult<T> {
  const key = getCacheKey(layer, contextId);
  const entry = cache.get(key);
  if (!entry) return { data: null, fromCache: false };

  const ttl = CACHE_TTL[layer as keyof typeof CACHE_TTL] || 60 * 60 * 1000;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return { data: null, fromCache: false };
  }

  return { data: entry.data as T, fromCache: true };
}

function setCache<T>(layer: number, data: T, contextId?: string): void {
  const key = getCacheKey(layer, contextId);
  cache.set(key, {
    data,
    hash: '',
    timestamp: Date.now(),
    layer,
  });
}

// ============================================================================
// AI Annotation 缓存（基于文件修改时间）
// ============================================================================

interface AIAnnotationCacheEntry {
  annotation: SemanticAnnotation;
  /** 文件/目录的最后修改时间戳 */
  lastModified: number;
  /** 缓存创建时间 */
  cachedAt: number;
}

/** AI 分析结果缓存 */
const aiAnnotationCache = new Map<string, AIAnnotationCacheEntry>();

/** 缓存有效期（7天） */
const AI_ANNOTATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * 获取文件或目录的最后修改时间
 * 对于目录，返回目录下所有源代码文件中最新的修改时间
 */
function getLastModifiedTime(targetPath: string): number {
  try {
    const stat = fs.statSync(targetPath);

    if (stat.isFile()) {
      return stat.mtimeMs;
    }

    if (stat.isDirectory()) {
      let maxMtime = stat.mtimeMs;

      // 递归检查目录下的源代码文件
      const checkDir = (dir: string, depth: number = 0) => {
        if (depth > 3) return; // 限制递归深度

        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && /\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
              const fileStat = fs.statSync(fullPath);
              if (fileStat.mtimeMs > maxMtime) {
                maxMtime = fileStat.mtimeMs;
              }
            } else if (entry.isDirectory()) {
              checkDir(fullPath, depth + 1);
            }
          }
        } catch (e) {
          // 忽略权限错误
        }
      };

      checkDir(targetPath);
      return maxMtime;
    }

    return 0;
  } catch (e) {
    return 0;
  }
}

/**
 * 根据 targetType 和 targetId 解析实际的文件/目录路径
 */
function resolveTargetPath(
  targetType: SemanticAnnotation['targetType'],
  targetId: string,
  projectRoot: string
): string {
  switch (targetType) {
    case 'project':
      return projectRoot;

    case 'module':
      if (targetId.startsWith('module-')) {
        return path.join(projectRoot, 'src', targetId.replace('module-', ''));
      } else if (path.isAbsolute(targetId)) {
        return targetId;
      } else {
        return path.join(projectRoot, targetId);
      }

    case 'file':
      return path.isAbsolute(targetId) ? targetId : path.join(projectRoot, targetId);

    case 'symbol': {
      const [filePath] = targetId.split('::');
      return path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
    }

    default:
      return projectRoot;
  }
}

/**
 * 获取 AI annotation 缓存
 */
function getAIAnnotationFromCache(
  targetType: SemanticAnnotation['targetType'],
  targetId: string,
  projectRoot: string
): SemanticAnnotation | null {
  const cacheKey = `ai-annotation:${targetType}:${targetId}`;
  const cached = aiAnnotationCache.get(cacheKey);

  if (!cached) {
    console.log(`[AI Cache] 未命中缓存: ${cacheKey}`);
    return null;
  }

  // 检查缓存是否过期
  if (Date.now() - cached.cachedAt > AI_ANNOTATION_CACHE_TTL) {
    console.log(`[AI Cache] 缓存已过期: ${cacheKey}`);
    aiAnnotationCache.delete(cacheKey);
    return null;
  }

  // 检查文件是否有变化
  const targetPath = resolveTargetPath(targetType, targetId, projectRoot);
  const currentMtime = getLastModifiedTime(targetPath);

  if (currentMtime > cached.lastModified) {
    console.log(`[AI Cache] 文件已变化，缓存失效: ${cacheKey}`);
    console.log(`  - 缓存时的修改时间: ${new Date(cached.lastModified).toISOString()}`);
    console.log(`  - 当前文件修改时间: ${new Date(currentMtime).toISOString()}`);
    aiAnnotationCache.delete(cacheKey);
    return null;
  }

  console.log(`[AI Cache] 命中缓存: ${cacheKey} (代码无变化，跳过 AI 分析)`);
  return cached.annotation;
}

/**
 * 设置 AI annotation 缓存
 */
function setAIAnnotationCache(
  targetType: SemanticAnnotation['targetType'],
  targetId: string,
  projectRoot: string,
  annotation: SemanticAnnotation
): void {
  const cacheKey = `ai-annotation:${targetType}:${targetId}`;
  const targetPath = resolveTargetPath(targetType, targetId, projectRoot);
  const lastModified = getLastModifiedTime(targetPath);

  aiAnnotationCache.set(cacheKey, {
    annotation,
    lastModified,
    cachedAt: Date.now(),
  });

  console.log(`[AI Cache] 已缓存: ${cacheKey}, mtime: ${new Date(lastModified).toISOString()}`);
}

// ============================================================================
// 辅助函数
// ============================================================================

function createAnnotation(
  targetId: string,
  targetType: SemanticAnnotation['targetType'],
  summary: string,
  description: string,
  keyPoints: string[]
): SemanticAnnotation {
  return {
    id: `annotation-${targetId}-${Date.now()}`,
    targetId,
    targetType,
    summary,
    description,
    keyPoints,
    confidence: 0.8,
    analyzedAt: new Date().toISOString(),
    userModified: false,
  };
}

// ============================================================================
// 第一层：项目意图分析
// ============================================================================

export async function analyzeProjectIntent(projectRoot: string): Promise<ProjectIntentData> {
  // 检查缓存
  const cached = getFromCache<ProjectIntentData>(1);
  if (cached) return cached;

  console.log('[Onion] 分析项目意图...');

  // 读取 package.json
  let packageJson: any = {};
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch (e) {
      console.warn('[Onion] 无法解析 package.json');
    }
  }

  // 读取 README.md
  let readmeContent = '';
  const readmePath = path.join(projectRoot, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      readmeContent = fs.readFileSync(readmePath, 'utf-8').slice(0, 2000);
    } catch (e) {
      console.warn('[Onion] 无法读取 README.md');
    }
  }

  // 统计项目基础数据
  const stats = await calculateProjectStats(projectRoot);

  // 分析技术栈
  const techStack = analyzeTechStack(projectRoot, packageJson);

  // 构建项目意图数据
  const data: ProjectIntentData = {
    name: packageJson.name || path.basename(projectRoot),
    tagline: packageJson.description || '暂无描述',
    purpose: extractPurpose(readmeContent, packageJson),
    problemSolved: extractProblemSolved(readmeContent),
    targetUsers: extractTargetUsers(readmeContent),
    valueProposition: extractValueProposition(readmeContent, packageJson),
    techStack,
    stats,
    annotation: createAnnotation(
      'project',
      'project',
      packageJson.description || '项目意图待分析',
      `${packageJson.name || '项目'} 是一个 ${techStack.languages[0]?.name || 'TypeScript'} 项目`,
      ['待 AI 分析生成关键点']
    ),
  };

  // 缓存结果
  setCache(1, data);

  return data;
}

async function calculateProjectStats(projectRoot: string): Promise<ProjectIntentData['stats']> {
  let totalFiles = 0;
  let totalLines = 0;
  let totalSymbols = 0;

  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    const files = await getAllSourceFiles(srcDir);
    totalFiles = files.length;

    for (const file of files.slice(0, 100)) { // 限制分析前100个文件
      try {
        const content = fs.readFileSync(file, 'utf-8');
        totalLines += content.split('\n').length;
        // 简单估算符号数量
        totalSymbols += (content.match(/(?:function|class|interface|type|const|let|var)\s+\w+/g) || []).length;
      } catch (e) {
        // 忽略读取错误
      }
    }
  }

  return {
    totalFiles,
    totalLines,
    totalSymbols,
    lastUpdated: new Date().toISOString(),
  };
}

async function getAllSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', '.git', '.next', 'build'].includes(entry.name)) {
        await getAllSourceFiles(fullPath, files);
      }
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function analyzeTechStack(projectRoot: string, packageJson: any): ProjectIntentData['techStack'] {
  const languages: Array<{ name: string; percentage: number }> = [];
  const frameworks: string[] = [];
  const tools: string[] = [];

  // 分析依赖来确定框架
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  if (deps['react']) frameworks.push('React');
  if (deps['vue']) frameworks.push('Vue');
  if (deps['express']) frameworks.push('Express');
  if (deps['next']) frameworks.push('Next.js');
  if (deps['typescript']) tools.push('TypeScript');
  if (deps['vite']) tools.push('Vite');
  if (deps['webpack']) tools.push('Webpack');
  if (deps['vitest'] || deps['jest']) tools.push('Testing');

  // 简单的语言分布估算
  languages.push({ name: 'TypeScript', percentage: 85 });
  languages.push({ name: 'JavaScript', percentage: 10 });
  languages.push({ name: 'Other', percentage: 5 });

  return { languages, frameworks, tools };
}

function extractPurpose(readme: string, packageJson: any): string {
  // 从 README 提取目的
  const purposeMatch = readme.match(/## (?:Purpose|目的|About|关于)\n([\s\S]*?)(?=\n##|$)/i);
  if (purposeMatch) return purposeMatch[1].trim().slice(0, 200);

  return packageJson.description || '项目目的待分析';
}

function extractProblemSolved(readme: string): string {
  const problemMatch = readme.match(/## (?:Problem|问题|Why|为什么)\n([\s\S]*?)(?=\n##|$)/i);
  if (problemMatch) return problemMatch[1].trim().slice(0, 200);

  return '解决的问题待分析';
}

function extractTargetUsers(readme: string): string[] {
  // 简单的目标用户提取
  return ['开发者', 'AI 爱好者', '技术研究者'];
}

function extractValueProposition(readme: string, packageJson: any): string[] {
  const features: string[] = [];

  // 从 package.json 的 keywords 提取
  if (packageJson.keywords) {
    features.push(...packageJson.keywords.slice(0, 3));
  }

  // 从 README 提取特性
  const featuresMatch = readme.match(/## (?:Features|特性|功能)\n([\s\S]*?)(?=\n##|$)/i);
  if (featuresMatch) {
    const bullets = featuresMatch[1].match(/[-*]\s+(.+)/g);
    if (bullets) {
      features.push(...bullets.slice(0, 3).map(b => b.replace(/^[-*]\s+/, '').slice(0, 50)));
    }
  }

  return features.length > 0 ? features : ['核心价值待分析'];
}

// ============================================================================
// 第二层：业务领域分析
// ============================================================================

export async function analyzeBusinessDomains(projectRoot: string): Promise<BusinessDomainData> {
  // 检查缓存
  const cached = getFromCache<BusinessDomainData>(2);
  if (cached) return cached;

  console.log('[Onion] 分析业务领域...');

  const domains: DomainNode[] = [];
  const relationships: DomainRelationship[] = [];

  const srcDir = path.join(projectRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    return { domains, relationships };
  }

  // 分析顶级目录作为模块
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const modulePath = path.join(srcDir, entry.name);
      const domain = await analyzeModule(modulePath, entry.name);
      domains.push(domain);
    }
  }

  // 分析模块间依赖关系
  for (const domain of domains) {
    for (const dep of domain.dependencies) {
      const target = domains.find(d => d.name === dep || d.path.includes(dep));
      if (target) {
        relationships.push({
          source: domain.id,
          target: target.id,
          type: 'import',
          strength: 1,
        });
      }
    }
  }

  const data: BusinessDomainData = { domains, relationships };

  // 缓存结果
  setCache(2, data);

  return data;
}

async function analyzeModule(modulePath: string, moduleName: string): Promise<DomainNode> {
  const files = await getAllSourceFiles(modulePath);
  let lineCount = 0;
  const exports: string[] = [];
  const dependencies: string[] = [];
  const importSet = new Set<string>();

  for (const file of files.slice(0, 50)) { // 限制分析文件数
    try {
      const content = fs.readFileSync(file, 'utf-8');
      lineCount += content.split('\n').length;

      // 提取 export
      const exportMatches = content.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/g);
      if (exportMatches) {
        exports.push(...exportMatches.slice(0, 5).map(m => m.split(/\s+/).pop() || ''));
      }

      // 提取 import 依赖
      const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g);
      if (importMatches) {
        for (const m of importMatches) {
          const dep = m.match(/from\s+['"]([^'"]+)['"]/)?.[1];
          if (dep && dep.startsWith('../') || dep?.startsWith('./')) {
            // 相对路径导入，可能是其他模块
            const parts = dep.split('/');
            if (parts.length > 1) {
              importSet.add(parts[1]);
            }
          }
        }
      }
    } catch (e) {
      // 忽略读取错误
    }
  }

  dependencies.push(...Array.from(importSet).slice(0, 10));

  // 确定模块类型和架构层级
  const { type, architectureLayer } = classifyModule(moduleName);

  return {
    id: `module-${moduleName}`,
    name: moduleName,
    path: modulePath,
    type,
    annotation: createAnnotation(
      `module-${moduleName}`,
      'module',
      `${moduleName} 模块`,
      `负责 ${moduleName} 相关功能`,
      ['待 AI 分析生成关键点']
    ),
    fileCount: files.length,
    lineCount,
    exports: exports.slice(0, 10),
    dependencies,
    dependentCount: 0,
    architectureLayer,
  };
}

function classifyModule(moduleName: string): { type: DomainNode['type']; architectureLayer: DomainNode['architectureLayer'] } {
  const name = moduleName.toLowerCase();

  if (['core', 'engine', 'kernel'].some(k => name.includes(k))) {
    return { type: 'core', architectureLayer: 'business' };
  }
  if (['ui', 'view', 'component', 'page'].some(k => name.includes(k))) {
    return { type: 'presentation', architectureLayer: 'presentation' };
  }
  if (['data', 'model', 'entity', 'store'].some(k => name.includes(k))) {
    return { type: 'data', architectureLayer: 'data' };
  }
  if (['util', 'helper', 'lib', 'common'].some(k => name.includes(k))) {
    return { type: 'utility', architectureLayer: 'infrastructure' };
  }
  if (['config', 'setup', 'init'].some(k => name.includes(k))) {
    return { type: 'infrastructure', architectureLayer: 'infrastructure' };
  }

  return { type: 'unknown', architectureLayer: 'business' };
}

// ============================================================================
// 第三层：关键流程分析
// ============================================================================

export async function analyzeKeyProcesses(
  projectRoot: string,
  moduleId?: string,
  forceRefresh: boolean = false
): Promise<KeyProcessData> {
  // 检查缓存（forceRefresh 时跳过）
  const cacheKey = moduleId || 'all';
  if (!forceRefresh) {
    const cached = getFromCache<KeyProcessData>(3, cacheKey);
    if (cached) {
      console.log(`[Onion] 第三层缓存命中，流程数: ${cached.processes?.length || 0}`);
      return cached;
    }
  }

  console.log('[Onion] 分析关键流程...', moduleId ? `模块: ${moduleId}` : '全部');
  console.log('[Onion] projectRoot:', projectRoot);

  let processes: ProcessFlow[] = [];

  // 检测入口点
  const entryPoints = await detectEntryPoints(projectRoot);
  console.log(`[Onion] 检测到 ${entryPoints.length} 个入口点:`, entryPoints.map(e => e.file));

  // 为每个入口点生成流程
  for (const entry of entryPoints.slice(0, 5)) { // 限制流程数量
    const process = await analyzeProcessFromEntry(projectRoot, entry);
    if (process) {
      processes.push(process);
    }
  }

  // 如果指定了 moduleId，为该模块生成专属流程
  if (moduleId) {
    // 从 moduleId 中提取模块名（格式：module-xxx）
    const moduleName = moduleId.replace(/^module-/, '');

    console.log(`[Onion] 为模块 "${moduleName}" 生成专属流程`);

    // 检测该模块目录下的入口点
    const moduleEntryPoints = await detectModuleEntryPoints(projectRoot, moduleName);
    console.log(`[Onion] 模块 "${moduleName}" 检测到 ${moduleEntryPoints.length} 个入口点:`, moduleEntryPoints.map(e => e.file));

    // 为模块入口点生成流程
    const moduleProcesses: ProcessFlow[] = [];
    for (const entry of moduleEntryPoints.slice(0, 10)) {
      const process = await analyzeProcessFromEntry(projectRoot, entry);
      if (process) {
        moduleProcesses.push(process);
      }
    }

    // 如果模块有专属入口点，使用模块流程；否则从全局流程中过滤
    if (moduleProcesses.length > 0) {
      processes = moduleProcesses;
      console.log(`[Onion] 使用模块专属流程: ${processes.length} 个`);
    } else {
      // 从全局流程中过滤相关流程
      const allProcessesCount = processes.length;
      processes = processes.filter((process) => {
        const entryFile = process.entryPoint.file;
        const inModuleDir = entryFile.includes(`/${moduleName}/`) ||
          entryFile.includes(`\\${moduleName}\\`) ||
          entryFile.startsWith(`src/${moduleName}/`) ||
          entryFile.startsWith(`src\\${moduleName}\\`);

        const involvesModule = process.involvedModules.some(mod =>
          mod.toLowerCase().includes(moduleName.toLowerCase())
        );

        const nameMatches = process.name.toLowerCase().includes(moduleName.toLowerCase());

        return inModuleDir || involvesModule || nameMatches;
      });

      console.log(`[Onion] 从全局流程过滤: ${processes.length}/${allProcessesCount} 个`);
    }
  }

  // 设置 selectedProcessId 为第一个流程的 ID（如果有的话）
  const data: KeyProcessData = {
    processes,
    selectedProcessId: processes.length > 0 ? processes[0].id : undefined,
  };

  console.log(`[Onion] 第三层分析完成，最终流程数: ${processes.length}`);
  if (processes.length === 0) {
    console.warn('[Onion] 警告：没有分析出任何流程！可能原因：');
    console.warn('  1. 没有检测到入口点（需要 src/cli.ts, src/index.ts 等）');
    console.warn('  2. 指定的模块没有匹配的流程');
  }

  // 缓存结果
  setCache(3, data, cacheKey);

  return data;
}

/**
 * 分析入口文件中的函数调用，提取调用信息
 */
interface CallInfo {
  name: string;
  line: number;
  column: number;
  type: 'function' | 'method' | 'constructor' | 'import';
  receiver?: string;  // 方法调用的接收者
  args?: string[];    // 参数列表
}

/**
 * 从文件内容中提取函数/方法调用
 */
function extractCallsFromContent(content: string): CallInfo[] {
  const calls: CallInfo[] = [];
  const lines = content.split('\n');

  // 需要忽略的内置函数/关键字
  const IGNORED = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'class',
    'return', 'throw', 'typeof', 'instanceof', 'void', 'delete',
    'await', 'async', 'yield', 'new', 'super', 'this', 'import', 'export',
    'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number',
    'Boolean', 'Date', 'RegExp', 'Error', 'Promise', 'Map', 'Set',
    'require', 'module', 'exports', 'process', 'Buffer',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  ]);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // 跳过注释行
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // 匹配 import 语句
    const importMatch = line.match(/import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      calls.push({
        name: importMatch[1],
        line: lineNumber,
        column: line.indexOf('import'),
        type: 'import',
      });
      continue;
    }

    // 匹配方法调用: object.method(args) 或 object?.method(args)
    const methodPattern = /(\w+)(?:\?)?\.(\w+)\s*\(/g;
    let methodMatch;
    while ((methodMatch = methodPattern.exec(line)) !== null) {
      const receiver = methodMatch[1];
      const methodName = methodMatch[2];
      if (!IGNORED.has(methodName) && !IGNORED.has(receiver)) {
        calls.push({
          name: methodName,
          line: lineNumber,
          column: methodMatch.index,
          type: 'method',
          receiver,
        });
      }
    }

    // 匹配 new 构造函数调用
    const newPattern = /new\s+(\w+)\s*\(/g;
    let newMatch;
    while ((newMatch = newPattern.exec(line)) !== null) {
      const className = newMatch[1];
      if (!IGNORED.has(className)) {
        calls.push({
          name: className,
          line: lineNumber,
          column: newMatch.index,
          type: 'constructor',
        });
      }
    }

    // 匹配普通函数调用（不带点的）
    const funcPattern = /(?<!\.)(?<!\w)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let funcMatch;
    while ((funcMatch = funcPattern.exec(line)) !== null) {
      const funcName = funcMatch[1];
      // 排除已经被方法调用匹配的
      if (!IGNORED.has(funcName) &&
          !line.substring(0, funcMatch.index).match(/\.\s*$/) &&
          !line.substring(0, funcMatch.index).match(/new\s+$/)) {
        // 检查是否是函数定义而不是调用
        if (!line.match(new RegExp(`(?:function|async\\s+function|const|let|var)\\s+${funcName}\\s*[=(<]`))) {
          calls.push({
            name: funcName,
            line: lineNumber,
            column: funcMatch.index,
            type: 'function',
          });
        }
      }
    }
  }

  return calls;
}

/**
 * 提取文件中定义的函数/类
 */
interface SymbolDef {
  name: string;
  type: 'function' | 'class' | 'const' | 'interface' | 'type' | 'export';
  line: number;
  endLine: number;
  exported: boolean;
  async: boolean;
  description?: string;
}

function extractSymbolDefinitions(content: string): SymbolDef[] {
  const symbols: SymbolDef[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // 匹配 export async function / export function / async function / function
    const funcMatch = line.match(/^(\s*)(export\s+)?(async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: funcMatch[4],
        type: 'function',
        line: lineNumber,
        endLine,
        exported: !!funcMatch[2],
        async: !!funcMatch[3],
      });
      continue;
    }

    // 匹配 export const xxx = async () => / export const xxx = () =>
    const arrowMatch = line.match(/^(\s*)(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*(?::\s*\w+)?\s*=>/);
    if (arrowMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: arrowMatch[3],
        type: 'function',
        line: lineNumber,
        endLine,
        exported: !!arrowMatch[2],
        async: !!arrowMatch[4],
      });
      continue;
    }

    // 匹配 class 定义
    const classMatch = line.match(/^(\s*)(export\s+)?class\s+(\w+)/);
    if (classMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: classMatch[3],
        type: 'class',
        line: lineNumber,
        endLine,
        exported: !!classMatch[2],
        async: false,
      });
      continue;
    }

    // 匹配 interface 定义
    const interfaceMatch = line.match(/^(\s*)(export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      const endLine = findBlockEnd(lines, i);
      symbols.push({
        name: interfaceMatch[3],
        type: 'interface',
        line: lineNumber,
        endLine,
        exported: !!interfaceMatch[2],
        async: false,
      });
      continue;
    }

    // 匹配 type 定义
    const typeMatch = line.match(/^(\s*)(export\s+)?type\s+(\w+)/);
    if (typeMatch) {
      symbols.push({
        name: typeMatch[3],
        type: 'type',
        line: lineNumber,
        endLine: lineNumber,
        exported: !!typeMatch[2],
        async: false,
      });
    }
  }

  return symbols;
}

/**
 * 查找代码块的结束行
 */
function findBlockEnd(lines: string[], startIndex: number): number {
  let braceCount = 0;
  let started = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    for (const char of line) {
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          return i + 1;
        }
      }
    }
  }

  return startIndex + 1;
}

/**
 * 根据调用类型推断步骤类型
 */
function inferStepType(call: CallInfo, context: { isFirst: boolean; isLast: boolean }): ProcessStep['type'] {
  if (context.isFirst) return 'input';
  if (context.isLast) return 'output';

  // 根据函数名推断类型
  const name = call.name.toLowerCase();

  if (name.includes('get') || name.includes('read') || name.includes('fetch') || name.includes('load')) {
    return 'input';
  }
  if (name.includes('set') || name.includes('write') || name.includes('save') || name.includes('send') || name.includes('emit')) {
    return 'output';
  }
  if (name.includes('check') || name.includes('validate') || name.includes('is') || name.includes('has') || name.includes('can')) {
    return 'decision';
  }
  if (call.type === 'method') {
    return 'call';
  }

  return 'process';
}

/**
 * 生成步骤描述
 */
function generateStepDescription(call: CallInfo, symbolDefs: SymbolDef[]): string {
  const matchingDef = symbolDefs.find(s => s.name === call.name);

  if (call.type === 'import') {
    return `导入模块 ${call.name}`;
  }
  if (call.type === 'constructor') {
    return `创建 ${call.name} 实例`;
  }
  if (call.type === 'method' && call.receiver) {
    return `调用 ${call.receiver}.${call.name}()`;
  }

  // 根据函数名生成描述
  const name = call.name;
  if (name.startsWith('get')) return `获取${name.slice(3)}`;
  if (name.startsWith('set')) return `设置${name.slice(3)}`;
  if (name.startsWith('create')) return `创建${name.slice(6)}`;
  if (name.startsWith('handle')) return `处理${name.slice(6)}事件`;
  if (name.startsWith('on')) return `响应${name.slice(2)}事件`;
  if (name.startsWith('init')) return `初始化${name.slice(4) || '系统'}`;
  if (name.startsWith('load')) return `加载${name.slice(4)}`;
  if (name.startsWith('save')) return `保存${name.slice(4)}`;
  if (name.startsWith('update')) return `更新${name.slice(6)}`;
  if (name.startsWith('delete') || name.startsWith('remove')) return `删除${name.slice(6)}`;
  if (name.startsWith('validate')) return `验证${name.slice(8)}`;
  if (name.startsWith('parse')) return `解析${name.slice(5)}`;
  if (name.startsWith('render')) return `渲染${name.slice(6)}`;
  if (name.startsWith('process')) return `处理${name.slice(7)}`;
  if (name.startsWith('execute')) return `执行${name.slice(7)}`;
  if (name.startsWith('run')) return `运行${name.slice(3)}`;
  if (name.startsWith('send')) return `发送${name.slice(4)}`;
  if (name.startsWith('receive')) return `接收${name.slice(7)}`;
  if (name.startsWith('analyze')) return `分析${name.slice(7)}`;
  if (name.startsWith('build')) return `构建${name.slice(5)}`;
  if (name.startsWith('generate')) return `生成${name.slice(8)}`;
  if (name.startsWith('format')) return `格式化${name.slice(6)}`;
  if (name.startsWith('transform')) return `转换${name.slice(9)}`;

  if (matchingDef?.async) {
    return `异步调用 ${name}()`;
  }

  return `调用 ${name}()`;
}

/**
 * 分析入口文件并生成真实的流程步骤
 */
async function analyzeProcessFromEntry(
  projectRoot: string,
  entry: { id: string; name: string; type: string; file: string }
): Promise<ProcessFlow | null> {
  const fullPath = path.join(projectRoot, entry.file);

  // 读取文件内容
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch (e) {
    console.warn(`[Onion] 无法读取文件: ${fullPath}`);
    return null;
  }

  // 提取符号定义
  const symbolDefs = extractSymbolDefinitions(content);

  // 提取函数调用
  const calls = extractCallsFromContent(content);

  // 过滤并排序调用（按行号）
  const filteredCalls = calls
    .filter(c => c.type !== 'import')  // 暂时排除 import
    .sort((a, b) => a.line - b.line)
    .slice(0, 15);  // 限制步骤数量

  // 生成流程步骤
  const steps: ProcessStep[] = [];

  // 添加入口步骤
  const mainSymbol = symbolDefs.find(s =>
    s.exported && (s.name === 'main' || s.name === 'default' || s.name === entry.name.split('/').pop())
  ) || symbolDefs.find(s => s.exported) || symbolDefs[0];

  steps.push({
    order: 1,
    name: '入口调用',
    description: `从 ${entry.name} 入口开始执行`,
    file: entry.file,
    symbol: mainSymbol?.name || entry.name,
    line: mainSymbol?.line || 1,
    type: 'input',
  });

  // 根据调用信息生成步骤
  let stepOrder = 2;
  const seenCalls = new Set<string>();

  for (const call of filteredCalls) {
    // 去重（同名函数只保留第一次调用）
    const callKey = `${call.name}-${call.type}`;
    if (seenCalls.has(callKey)) continue;
    seenCalls.add(callKey);

    const isLast = stepOrder === filteredCalls.length + 1;

    steps.push({
      order: stepOrder,
      name: call.type === 'constructor' ? `创建 ${call.name}` : call.name,
      description: generateStepDescription(call, symbolDefs),
      file: entry.file,
      symbol: call.name,
      line: call.line,
      type: inferStepType(call, { isFirst: false, isLast }),
      dataTransform: call.receiver ? `${call.receiver} → ${call.name}()` : undefined,
    });

    stepOrder++;

    // 限制步骤数量
    if (stepOrder > 10) break;
  }

  // 如果没有检测到调用，添加一个处理步骤
  if (steps.length === 1) {
    steps.push({
      order: 2,
      name: '核心处理',
      description: `执行 ${entry.name} 的主要逻辑`,
      file: entry.file,
      symbol: 'process',
      line: mainSymbol?.line ? mainSymbol.line + 5 : 10,
      type: 'process',
    });
  }

  // 添加输出步骤
  steps.push({
    order: steps.length + 1,
    name: '返回结果',
    description: '完成处理并返回结果',
    file: entry.file,
    symbol: 'return',
    line: mainSymbol?.endLine || steps[steps.length - 1].line + 5,
    type: 'output',
  });

  // 提取涉及的模块
  const involvedModules: string[] = extractModulesFromPath(entry.file);

  // 从 import 语句中提取更多涉及的模块
  const importCalls = calls.filter(c => c.type === 'import');
  for (const imp of importCalls) {
    const moduleName = imp.name.split('/')[0].replace(/^\.+/, '');
    if (moduleName && !moduleName.startsWith('@') && !involvedModules.includes(moduleName)) {
      involvedModules.push(moduleName);
    }
  }

  // 生成关键点
  const keyPoints: string[] = [];

  // 根据分析结果生成关键点
  const exportedSymbols = symbolDefs.filter(s => s.exported);
  if (exportedSymbols.length > 0) {
    keyPoints.push(`导出 ${exportedSymbols.length} 个符号: ${exportedSymbols.slice(0, 3).map(s => s.name).join(', ')}${exportedSymbols.length > 3 ? '...' : ''}`);
  }

  const asyncFuncs = symbolDefs.filter(s => s.async);
  if (asyncFuncs.length > 0) {
    keyPoints.push(`包含 ${asyncFuncs.length} 个异步函数`);
  }

  if (calls.filter(c => c.type === 'import').length > 0) {
    keyPoints.push(`依赖 ${calls.filter(c => c.type === 'import').length} 个外部模块`);
  }

  const methodCalls = calls.filter(c => c.type === 'method');
  if (methodCalls.length > 0) {
    const uniqueReceivers = [...new Set(methodCalls.map(c => c.receiver).filter(Boolean))];
    keyPoints.push(`调用 ${uniqueReceivers.slice(0, 3).join(', ')} 等对象的方法`);
  }

  // 如果关键点不足，添加通用描述
  if (keyPoints.length === 0) {
    keyPoints.push(`${entry.type} 类型的入口文件`);
    keyPoints.push(`共 ${steps.length} 个执行步骤`);
  }

  return {
    id: `process-${entry.id}`,
    name: `${entry.name} 流程`,
    type: entry.type === 'CLI' ? 'user-journey' :
          entry.type === 'API' ? 'api-call' :
          entry.type === 'Module' ? 'data-flow' : 'user-journey',
    annotation: createAnnotation(
      `process-${entry.id}`,
      'process',
      `${entry.name} 执行流程`,
      `从 ${entry.name} 入口开始的执行链路，共 ${steps.length} 个步骤，涉及 ${involvedModules.length} 个模块`,
      keyPoints
    ),
    steps,
    entryPoint: {
      file: entry.file,
      symbol: mainSymbol?.name || entry.name,
      line: mainSymbol?.line || 1,
    },
    involvedModules,
  };
}

/**
 * 从文件路径提取模块名称
 * 例如：src/auth/index.ts -> ['auth']
 *       src/web/client/... -> ['web', 'client']
 */
function extractModulesFromPath(filePath: string): string[] {
  const modules: string[] = [];
  const parts = filePath.split(/[\/\\]/);

  // 跳过 src 目录，收集后续的目录名作为模块名
  let foundSrc = false;
  for (const part of parts) {
    if (part === 'src') {
      foundSrc = true;
      continue;
    }
    if (foundSrc && part && !part.includes('.')) {
      // 只收集目录名，不收集文件名
      modules.push(part);
    }
  }

  // 如果没有 src 目录，取第一个非空目录名
  if (!foundSrc && parts.length > 1) {
    const firstDir = parts.find(p => p && !p.includes('.'));
    if (firstDir) {
      modules.push(firstDir);
    }
  }

  return modules;
}

async function detectEntryPoints(projectRoot: string): Promise<Array<{ id: string; name: string; type: string; file: string }>> {
  const entries: Array<{ id: string; name: string; type: string; file: string }> = [];

  // 检查常见入口点
  const commonEntries = [
    { pattern: 'src/cli.ts', type: 'CLI' },
    { pattern: 'src/index.ts', type: 'Main' },
    { pattern: 'src/main.ts', type: 'Main' },
    { pattern: 'src/app.ts', type: 'App' },
  ];

  for (const { pattern, type } of commonEntries) {
    const filePath = path.join(projectRoot, pattern);
    if (fs.existsSync(filePath)) {
      entries.push({
        id: pattern.replace(/[\/\\\.]/g, '-'),
        name: path.basename(pattern, path.extname(pattern)),
        type,
        file: pattern,
      });
    }
  }

  // 检测各模块目录下的入口点
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    const moduleDirs = fs.readdirSync(srcDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const moduleName of moduleDirs) {
      // 检查模块入口文件
      const moduleEntryPatterns = ['index.ts', 'index.tsx', 'main.ts', `${moduleName}.ts`];
      for (const entryFile of moduleEntryPatterns) {
        const filePath = path.join(srcDir, moduleName, entryFile);
        if (fs.existsSync(filePath)) {
          const pattern = `src/${moduleName}/${entryFile}`;
          entries.push({
            id: `module-${moduleName}-${entryFile.replace('.', '-')}`,
            name: `${moduleName}/${path.basename(entryFile, path.extname(entryFile))}`,
            type: 'Module',
            file: pattern,
          });
          break; // 每个模块只取第一个入口
        }
      }
    }
  }

  return entries;
}

/**
 * 检测指定模块目录下的入口点
 * 扫描模块目录，找到可导出的文件作为入口点
 */
async function detectModuleEntryPoints(
  projectRoot: string,
  moduleName: string
): Promise<Array<{ id: string; name: string; type: string; file: string }>> {
  const entries: Array<{ id: string; name: string; type: string; file: string }> = [];

  // 构建模块路径（支持嵌套路径如 web/server）
  const modulePath = path.join(projectRoot, 'src', ...moduleName.split(/[\/\\]/));

  console.log(`[Onion] 扫描模块目录: ${modulePath}`);

  if (!fs.existsSync(modulePath) || !fs.statSync(modulePath).isDirectory()) {
    console.warn(`[Onion] 模块目录不存在: ${modulePath}`);
    return entries;
  }

  // 1. 检查模块根目录下的入口文件
  const rootEntryPatterns = ['index.ts', 'index.tsx', 'main.ts', `${path.basename(moduleName)}.ts`];
  for (const entryFile of rootEntryPatterns) {
    const filePath = path.join(modulePath, entryFile);
    if (fs.existsSync(filePath)) {
      const relativePath = `src/${moduleName}/${entryFile}`;
      entries.push({
        id: `module-${moduleName}-${entryFile.replace(/\./g, '-')}`,
        name: `${moduleName}/${path.basename(entryFile, path.extname(entryFile))}`,
        type: 'ModuleEntry',
        file: relativePath,
      });
    }
  }

  // 2. 扫描模块目录下的所有 .ts/.tsx 文件（限制深度和数量）
  const scanDir = (dir: string, depth: number = 0, maxFiles: number = 20): void => {
    if (depth > 2 || entries.length >= maxFiles) return;

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        if (entries.length >= maxFiles) break;
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;

        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          // 递归扫描子目录
          scanDir(fullPath, depth + 1, maxFiles);
        } else if (item.isFile() && /\.(ts|tsx)$/.test(item.name) && !item.name.includes('.test.') && !item.name.includes('.spec.')) {
          // 检查文件是否有导出
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const hasExport = /export\s+(default\s+)?(function|class|const|interface|type|async function)\s+\w+/.test(content);

            if (hasExport) {
              const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
              const fileName = path.basename(item.name, path.extname(item.name));
              const relativeDir = path.relative(modulePath, dir).replace(/\\/g, '/');
              const displayName = relativeDir ? `${moduleName}/${relativeDir}/${fileName}` : `${moduleName}/${fileName}`;

              // 避免重复添加
              if (!entries.some(e => e.file === relativePath)) {
                entries.push({
                  id: `module-${moduleName}-${relativePath.replace(/[\/\\.]/g, '-')}`,
                  name: displayName,
                  type: 'ModuleFile',
                  file: relativePath,
                });
              }
            }
          } catch (e) {
            // 忽略读取错误
          }
        }
      }
    } catch (e) {
      // 忽略目录读取错误
    }
  };

  scanDir(modulePath);

  console.log(`[Onion] 模块 "${moduleName}" 找到 ${entries.length} 个入口点`);

  return entries;
}

// ============================================================================
// 第四层：实现细节分析
// ============================================================================

export async function analyzeImplementation(
  projectRoot: string,
  filePath: string,
  symbolId?: string
): Promise<ImplementationData> {
  // 检查缓存
  const cacheKey = `${filePath}:${symbolId || ''}`;
  const cached = getFromCache<ImplementationData>(4, cacheKey);
  if (cached) return cached;

  console.log('[Onion] 分析实现细节...');

  const fullPath = path.join(projectRoot, filePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n');

  // 构建文件详情
  const file: FileDetail = {
    path: filePath,
    annotation: createAnnotation(
      filePath,
      'file',
      `${path.basename(filePath)}`,
      `文件 ${filePath} 的实现细节`,
      ['待 AI 分析生成关键点']
    ),
    content,
    language: path.extname(filePath).slice(1),
    lineCount: lines.length,
  };

  // 提取符号
  const symbols = extractSymbols(content, filePath);

  const data: ImplementationData = {
    file,
    symbols,
    selectedSymbolId: symbolId,
  };

  // 缓存结果
  setCache(4, data, cacheKey);

  return data;
}

function extractSymbols(content: string, filePath: string): SymbolDetail[] {
  const symbols: SymbolDetail[] = [];
  const lines = content.split('\n');

  // 简单的符号提取正则
  const patterns = [
    { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, type: 'function' as const },
    { regex: /(?:export\s+)?class\s+(\w+)/g, type: 'class' as const },
    { regex: /(?:export\s+)?interface\s+(\w+)/g, type: 'interface' as const },
    { regex: /(?:export\s+)?type\s+(\w+)/g, type: 'type' as const },
    { regex: /(?:export\s+)?const\s+(\w+)\s*=/g, type: 'variable' as const },
  ];

  for (const { regex, type } of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const startIndex = match.index;
      const startLine = content.slice(0, startIndex).split('\n').length;

      symbols.push({
        id: `${filePath}::${type}::${name}`,
        name,
        type,
        annotation: createAnnotation(
          `${filePath}::${type}::${name}`,
          'symbol',
          `${type} ${name}`,
          `${type} ${name} 的实现`,
          ['待 AI 分析生成关键点']
        ),
        signature: match[0],
        file: filePath,
        startLine,
        endLine: startLine + 10, // 简化估算
        callers: [],
        callees: [],
      });
    }
  }

  return symbols;
}

// ============================================================================
// AI 分析接口
// ============================================================================

/**
 * 根据目标类型读取相关代码内容
 */
async function getTargetContent(
  targetType: SemanticAnnotation['targetType'],
  targetId: string,
  projectRoot: string
): Promise<{ content: string; metadata: Record<string, any> }> {
  const metadata: Record<string, any> = { targetType, targetId };

  switch (targetType) {
    case 'project': {
      // 读取 README 和 package.json
      const readmePath = path.join(projectRoot, 'README.md');
      const packagePath = path.join(projectRoot, 'package.json');

      let content = '';
      if (fs.existsSync(readmePath)) {
        content += '=== README.md ===\n' + fs.readFileSync(readmePath, 'utf-8').slice(0, 3000) + '\n\n';
      }
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        content += '=== package.json ===\n' + JSON.stringify({
          name: pkg.name,
          description: pkg.description,
          scripts: pkg.scripts,
          dependencies: Object.keys(pkg.dependencies || {}).slice(0, 20),
          devDependencies: Object.keys(pkg.devDependencies || {}).slice(0, 10),
        }, null, 2);
        metadata.projectName = pkg.name;
      }
      return { content, metadata };
    }

    case 'module': {
      // 读取模块目录下的主要文件
      // 支持多种路径格式：
      // 1. module-xxx 格式 -> src/xxx
      // 2. 相对路径 -> projectRoot + targetId
      // 3. 绝对路径 -> 直接使用
      let modulePath: string;
      if (targetId.startsWith('module-')) {
        modulePath = path.join(projectRoot, 'src', targetId.replace('module-', ''));
      } else if (path.isAbsolute(targetId)) {
        modulePath = targetId;
      } else {
        modulePath = path.join(projectRoot, targetId);
      }

      console.log(`[getTargetContent] 分析模块: ${targetId} -> ${modulePath}`);

      let content = '';
      if (fs.existsSync(modulePath) && fs.statSync(modulePath).isDirectory()) {
        const files = fs.readdirSync(modulePath).filter(f => /\.(ts|tsx|js|jsx)$/.test(f)).slice(0, 5);
        for (const file of files) {
          const filePath = path.join(modulePath, file);
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          content += `=== ${file} ===\n${fileContent.slice(0, 2000)}\n\n`;
        }
        metadata.moduleName = path.basename(modulePath);
        metadata.fileCount = files.length;
      }
      return { content, metadata };
    }

    case 'file': {
      // 读取单个文件
      const filePath = path.isAbsolute(targetId) ? targetId : path.join(projectRoot, targetId);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        metadata.fileName = path.basename(filePath);
        metadata.lineCount = content.split('\n').length;
        return { content: content.slice(0, 8000), metadata };
      }
      return { content: '', metadata };
    }

    case 'symbol': {
      // 解析 filePath::symbolName 格式
      const [filePath, symbolName] = targetId.split('::');
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);

      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // 尝试提取符号附近的代码
        const lines = content.split('\n');
        const symbolRegex = new RegExp(`(function|class|interface|type|const|let|var)\\s+${symbolName}\\b`);

        for (let i = 0; i < lines.length; i++) {
          if (symbolRegex.test(lines[i])) {
            // 提取符号前后 30 行
            const start = Math.max(0, i - 5);
            const end = Math.min(lines.length, i + 30);
            metadata.symbolName = symbolName;
            metadata.fileName = path.basename(filePath);
            metadata.startLine = i + 1;
            return {
              content: lines.slice(start, end).join('\n'),
              metadata
            };
          }
        }
        // 找不到符号，返回文件开头
        return { content: content.slice(0, 3000), metadata };
      }
      return { content: '', metadata };
    }

    case 'process': {
      // 流程分析需要入口点文件
      metadata.processId = targetId;
      return { content: '流程分析需要结合入口点代码', metadata };
    }

    default:
      return { content: '', metadata };
  }
}

/**
 * 构建 AI 分析 Prompt
 */
function buildAnalysisPrompt(
  targetType: SemanticAnnotation['targetType'],
  content: string,
  metadata: Record<string, any>
): string {
  const baseInstruction = `你是一个专业的代码分析助手。请分析以下代码/内容，并生成语义标注。

你需要返回一个 JSON 对象，格式如下：
{
  "summary": "一句话简短摘要（不超过50字）",
  "description": "详细描述，说明这段代码/模块的作用（100-200字）",
  "keyPoints": ["关键点1", "关键点2", "关键点3"],
  "confidence": 0.85
}

要求：
1. summary 要简洁精炼，一眼就能看懂
2. description 要说清楚 WHY（为什么需要）和 WHAT（做什么）
3. keyPoints 提取 3-5 个最重要的点，每个点不超过 20 字
4. confidence 是你对分析结果的置信度（0-1）

只返回 JSON，不要有其他内容。
`;

  switch (targetType) {
    case 'project':
      return `${baseInstruction}

这是一个项目级别的分析，请关注：
- 项目的核心功能和目标用户
- 主要技术栈和架构特点
- 项目的独特价值

项目信息：
${content}`;

    case 'module':
      return `${baseInstruction}

这是一个模块级别的分析，请关注：
- 模块的职责边界
- 模块对外提供的能力
- 模块与其他模块的关系

模块名: ${metadata.moduleName || '未知'}
包含文件数: ${metadata.fileCount || '未知'}

模块代码：
${content}`;

    case 'file':
      return `${baseInstruction}

这是一个文件级别的分析，请关注：
- 文件的主要功能
- 导出的接口/类型
- 关键实现逻辑

文件名: ${metadata.fileName || '未知'}
行数: ${metadata.lineCount || '未知'}

文件内容：
${content}`;

    case 'symbol':
      return `${baseInstruction}

这是一个符号（函数/类/接口）级别的分析，请关注：
- 符号的用途和功能
- 参数和返回值的含义
- 使用场景和注意事项

符号名: ${metadata.symbolName || '未知'}
所在文件: ${metadata.fileName || '未知'}

代码：
${content}`;

    case 'process':
      return `${baseInstruction}

这是一个流程级别的分析，请关注：
- 流程的触发条件
- 主要步骤和数据流向
- 涉及的关键模块

流程 ID: ${metadata.processId || '未知'}

上下文信息：
${content}`;

    default:
      return `${baseInstruction}\n\n${content}`;
  }
}

/**
 * 使用 AI 生成语义标注
 * 使用 getDefaultClient() 获取已认证的 Claude 客户端（与其他模块一致）
 */
export async function generateAIAnnotation(
  targetType: SemanticAnnotation['targetType'],
  targetId: string,
  context: any
): Promise<SemanticAnnotation> {
  const projectRoot = context?.projectRoot || process.cwd();

  // 0. 检查缓存 - 如果代码没有变化，直接返回缓存的分析结果
  const cachedAnnotation = getAIAnnotationFromCache(targetType, targetId, projectRoot);
  if (cachedAnnotation) {
    return cachedAnnotation;
  }

  try {
    // 1. 获取目标内容
    const { content, metadata } = await getTargetContent(targetType, targetId, projectRoot);

    if (!content) {
      return createAnnotation(
        targetId,
        targetType,
        '分析失败：无法读取内容',
        `无法读取 ${targetType} 类型的目标：${targetId}`,
        ['目标内容为空或不存在']
      );
    }

    // 2. 构建 prompt
    const prompt = buildAnalysisPrompt(targetType, content, metadata);

    // 3. 使用 getDefaultClient() 获取已认证的客户端（与其他模块一致）
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    console.log(`[AI Annotation] 开始分析 ${targetType}: ${targetId}`);

    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码分析专家。分析代码并返回结构化的 JSON 结果。只返回 JSON，不要其他内容。'
    );

    // 4. 解析响应
    let analysisText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        analysisText += block.text;
      }
    }

    // 提取 JSON
    const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || analysisText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const json = JSON.parse(jsonMatch[1] || jsonMatch[0]);

      console.log(`[AI Annotation] 分析完成，置信度: ${json.confidence}`);

      const annotation: SemanticAnnotation = {
        id: `annotation-${targetId}-${Date.now()}`,
        targetId,
        targetType,
        summary: json.summary || '分析完成',
        description: json.description || '',
        keyPoints: json.keyPoints || [],
        confidence: json.confidence || 0.8,
        analyzedAt: new Date().toISOString(),
        userModified: false,
      };

      // 缓存分析结果（基于文件修改时间）
      setAIAnnotationCache(targetType, targetId, projectRoot, annotation);

      return annotation;
    }

    // JSON 解析失败，返回原始文本作为描述
    return createAnnotation(
      targetId,
      targetType,
      'AI 分析完成',
      analysisText.slice(0, 500),
      ['AI 返回格式异常，请重试']
    );

  } catch (error: any) {
    console.error('[AI Annotation] 分析失败:', error);

    return createAnnotation(
      targetId,
      targetType,
      '分析失败',
      `AI 分析出错: ${error.message || '未知错误'}`,
      ['请检查网络连接', '确认账户已登录']
    );
  }
}

// ============================================================================
// 标注持久化（用户修改的标注）
// ============================================================================

/**
 * 用户修改的标注存储
 * key: annotationId
 * 持久化到 ~/.claude/annotations.json
 */
const userAnnotationCache = new Map<string, SemanticAnnotation>();

/** 标注文件路径 */
const ANNOTATIONS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude',
  'annotations.json'
);

/**
 * 从文件加载用户标注
 */
function loadUserAnnotations(): void {
  try {
    if (fs.existsSync(ANNOTATIONS_FILE)) {
      const content = fs.readFileSync(ANNOTATIONS_FILE, 'utf-8');
      const annotations = JSON.parse(content) as Record<string, SemanticAnnotation>;
      for (const [id, annotation] of Object.entries(annotations)) {
        userAnnotationCache.set(id, annotation);
      }
      console.log(`[Annotation] 加载了 ${userAnnotationCache.size} 个用户标注`);
    }
  } catch (error) {
    console.error('[Annotation] 加载用户标注失败:', error);
  }
}

/**
 * 保存用户标注到文件
 */
function saveUserAnnotations(): void {
  try {
    // 确保目录存在
    const dir = path.dirname(ANNOTATIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 转换 Map 为对象
    const annotations: Record<string, SemanticAnnotation> = {};
    for (const [id, annotation] of userAnnotationCache.entries()) {
      annotations[id] = annotation;
    }

    fs.writeFileSync(ANNOTATIONS_FILE, JSON.stringify(annotations, null, 2), 'utf-8');
    console.log(`[Annotation] 保存了 ${userAnnotationCache.size} 个用户标注`);
  } catch (error) {
    console.error('[Annotation] 保存用户标注失败:', error);
    throw error;
  }
}

// 启动时加载标注
loadUserAnnotations();

/**
 * 更新用户标注
 * @param annotationId 标注 ID
 * @param updates 要更新的字段
 * @returns 更新后的标注
 */
export function updateAnnotation(
  annotationId: string,
  updates: {
    summary?: string;
    description?: string;
    keyPoints?: string[];
  }
): SemanticAnnotation | null {
  // 从用户标注缓存中查找
  let annotation = userAnnotationCache.get(annotationId);

  // 如果用户缓存中没有，尝试从 AI 缓存中找到原始标注
  if (!annotation) {
    // 遍历 AI 缓存查找匹配的标注
    for (const [key, entry] of aiAnnotationCache.entries()) {
      if (entry.annotation.id === annotationId) {
        annotation = { ...entry.annotation };
        break;
      }
    }
  }

  if (!annotation) {
    console.warn(`[Annotation] 未找到标注: ${annotationId}`);
    return null;
  }

  // 应用更新
  const updatedAnnotation: SemanticAnnotation = {
    ...annotation,
    summary: updates.summary !== undefined ? updates.summary : annotation.summary,
    description: updates.description !== undefined ? updates.description : annotation.description,
    keyPoints: updates.keyPoints !== undefined ? updates.keyPoints : annotation.keyPoints,
    userModified: true,  // 标记为用户已修改
  };

  // 保存到用户标注缓存
  userAnnotationCache.set(annotationId, updatedAnnotation);

  // 持久化到文件
  saveUserAnnotations();

  console.log(`[Annotation] 更新标注成功: ${annotationId}`);
  return updatedAnnotation;
}

/**
 * 获取用户修改的标注（如果有）
 */
export function getUserAnnotation(annotationId: string): SemanticAnnotation | null {
  return userAnnotationCache.get(annotationId) || null;
}

// ============================================================================
// 带缓存状态的分析函数（供 API 使用）
// ============================================================================

/**
 * 分析结果包装器，包含数据和缓存状态
 */
export interface AnalysisResultWithCache<T> {
  data: T;
  fromCache: boolean;
}

/**
 * 分析项目意图（带缓存状态）
 */
export async function analyzeProjectIntentWithCache(
  projectRoot: string
): Promise<AnalysisResultWithCache<ProjectIntentData>> {
  // 检查缓存
  const cacheResult = getFromCacheWithStatus<ProjectIntentData>(1);
  if (cacheResult.data) {
    return { data: cacheResult.data, fromCache: true };
  }

  // 执行分析
  const data = await analyzeProjectIntent(projectRoot);
  return { data, fromCache: false };
}

/**
 * 分析业务领域（带缓存状态）
 */
export async function analyzeBusinessDomainsWithCache(
  projectRoot: string
): Promise<AnalysisResultWithCache<BusinessDomainData>> {
  // 检查缓存
  const cacheResult = getFromCacheWithStatus<BusinessDomainData>(2);
  if (cacheResult.data) {
    return { data: cacheResult.data, fromCache: true };
  }

  // 执行分析
  const data = await analyzeBusinessDomains(projectRoot);
  return { data, fromCache: false };
}

/**
 * 分析关键流程（带缓存状态）
 */
export async function analyzeKeyProcessesWithCache(
  projectRoot: string,
  moduleId?: string,
  forceRefresh: boolean = false
): Promise<AnalysisResultWithCache<KeyProcessData>> {
  const cacheKey = moduleId || 'all';

  // forceRefresh 时跳过缓存
  if (!forceRefresh) {
    const cacheResult = getFromCacheWithStatus<KeyProcessData>(3, cacheKey);
    if (cacheResult.data) {
      return { data: cacheResult.data, fromCache: true };
    }
  }

  // 执行分析
  const data = await analyzeKeyProcesses(projectRoot, moduleId, forceRefresh);
  return { data, fromCache: false };
}

/**
 * 分析实现细节（带缓存状态）
 */
export async function analyzeImplementationWithCache(
  projectRoot: string,
  filePath: string,
  symbolId?: string
): Promise<AnalysisResultWithCache<ImplementationData>> {
  const cacheKey = `${filePath}:${symbolId || ''}`;

  // 检查缓存
  const cacheResult = getFromCacheWithStatus<ImplementationData>(4, cacheKey);
  if (cacheResult.data) {
    return { data: cacheResult.data, fromCache: true };
  }

  // 执行分析
  const data = await analyzeImplementation(projectRoot, filePath, symbolId);
  return { data, fromCache: false };
}