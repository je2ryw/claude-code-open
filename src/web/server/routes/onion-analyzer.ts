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
  moduleId?: string
): Promise<KeyProcessData> {
  // 检查缓存
  const cacheKey = moduleId || 'all';
  const cached = getFromCache<KeyProcessData>(3, cacheKey);
  if (cached) return cached;

  console.log('[Onion] 分析关键流程...');

  const processes: ProcessFlow[] = [];

  // 检测入口点
  const entryPoints = await detectEntryPoints(projectRoot);

  // 为每个入口点生成流程
  for (const entry of entryPoints.slice(0, 5)) { // 限制流程数量
    const process = await analyzeProcessFromEntry(projectRoot, entry);
    if (process) {
      processes.push(process);
    }
  }

  const data: KeyProcessData = { processes };

  // 缓存结果
  setCache(3, data, cacheKey);

  return data;
}

async function analyzeProcessFromEntry(
  projectRoot: string,
  entry: { id: string; name: string; type: string; file: string }
): Promise<ProcessFlow | null> {
  // 简化的流程分析 - 实际实现需要使用 call-graph API
  const steps: ProcessStep[] = [
    {
      order: 1,
      name: '入口调用',
      description: `从 ${entry.name} 开始`,
      file: entry.file,
      symbol: entry.name,
      line: 1,
      type: 'input',
    },
    {
      order: 2,
      name: '处理逻辑',
      description: '执行核心业务逻辑',
      file: entry.file,
      symbol: 'process',
      line: 10,
      type: 'process',
    },
    {
      order: 3,
      name: '返回结果',
      description: '返回处理结果',
      file: entry.file,
      symbol: 'return',
      line: 20,
      type: 'output',
    },
  ];

  return {
    id: `process-${entry.id}`,
    name: `${entry.name} 流程`,
    type: 'user-journey',
    annotation: createAnnotation(
      `process-${entry.id}`,
      'process',
      `${entry.name} 执行流程`,
      `从 ${entry.name} 入口开始的执行链路`,
      ['待 AI 分析生成关键点']
    ),
    steps,
    entryPoint: {
      file: entry.file,
      symbol: entry.name,
      line: 1,
    },
    involvedModules: [],
  };
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
        id: `${filePath}::${name}`,
        name,
        type,
        annotation: createAnnotation(
          `${filePath}::${name}`,
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

export async function generateAIAnnotation(
  targetType: SemanticAnnotation['targetType'],
  targetId: string,
  context: any
): Promise<SemanticAnnotation> {
  // TODO: 调用 AI API 生成语义标注
  // 目前返回占位符
  return createAnnotation(
    targetId,
    targetType,
    'AI 分析中...',
    '正在使用 AI 分析代码意图',
    ['分析中...']
  );
}