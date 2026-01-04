/**
 * /map 命令 - 增强版代码蓝图生成和可视化
 *
 * 生成包含以下内容的代码蓝图：
 * 1. 层级结构 - 目录树视图 + 架构分层视图
 * 2. 引用关系 - 模块依赖、符号调用、类型引用
 * 3. 语义描述 - AI 生成的业务含义描述
 */

import * as fs from 'fs';
import * as path from 'path';
import { SlashCommand, CommandContext, CommandResult } from './types.js';
import {
  EnhancedOntologyGenerator,
  EnhancedCodeBlueprint,
  EnhancedAnalysisProgress,
  VisualizationServer,
} from '../map/index.js';
import { ChunkedBlueprintGenerator } from '../map/chunked-generator.js';

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 解析命令参数
 */
function parseArgs(args: string[]): {
  subcommand: string;
  options: Record<string, string | boolean>;
} {
  const subcommand = args[0] || 'generate';
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return { subcommand, options };
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 格式化增强版进度
 */
function formatEnhancedProgress(progress: EnhancedAnalysisProgress): string {
  const phases: Record<string, string> = {
    discover: '发现文件',
    parse: '解析代码',
    symbols: '提取符号',
    references: '分析引用',
    views: '构建视图',
    semantics: '生成语义',
    aggregate: '聚合蓝图',
  };

  const phase = phases[progress.phase] || progress.phase;
  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  if (progress.message) {
    return `${phase}: ${progress.message}`;
  }

  if (progress.currentFile) {
    const fileName = path.basename(progress.currentFile);
    return `${phase}: ${percent}% (${fileName})`;
  }

  return `${phase}: ${percent}%`;
}

/**
 * 生成增强版摘要报告
 */
function generateEnhancedSummary(blueprint: EnhancedCodeBlueprint): string {
  const { project, statistics, views } = blueprint;
  const lines: string[] = [];

  lines.push('');
  lines.push('📊 **增强版代码蓝图生成完成**');
  lines.push('');
  lines.push(`项目: ${project.name}`);
  lines.push(`路径: ${project.rootPath}`);
  lines.push(`语言: ${project.languages.join(', ')}`);

  // 项目语义
  if (project.semantic) {
    lines.push('');
    lines.push('**项目描述:**');
    lines.push(`  ${project.semantic.description}`);
    if (project.semantic.domains.length > 0) {
      lines.push(`  领域: ${project.semantic.domains.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('**统计信息:**');
  lines.push(`  • 模块数: ${statistics.totalModules}`);
  lines.push(`  • 符号数: ${statistics.totalSymbols}`);
  lines.push(`  • 代码行数: ${statistics.totalLines.toLocaleString()}`);
  lines.push(`  • 模块依赖: ${statistics.referenceStats.totalModuleDeps}`);
  lines.push(`  • 符号调用: ${statistics.referenceStats.totalSymbolCalls}`);
  lines.push(`  • 类型引用: ${statistics.referenceStats.totalTypeRefs}`);

  // 语义覆盖率
  lines.push('');
  lines.push('**语义覆盖:**');
  lines.push(`  • 有描述的模块: ${statistics.semanticCoverage.modulesWithDescription}/${statistics.totalModules}`);
  lines.push(`  • 覆盖率: ${statistics.semanticCoverage.coveragePercent}%`);

  // 架构层分布
  lines.push('');
  lines.push('**架构层分布:**');
  const layerNames: Record<string, string> = {
    presentation: '表现层',
    business: '业务层',
    data: '数据层',
    infrastructure: '基础设施',
    crossCutting: '横切关注点',
  };
  for (const [layer, count] of Object.entries(statistics.layerDistribution)) {
    if (count > 0) {
      const name = layerNames[layer] || layer;
      lines.push(`  • ${name}: ${count} 模块`);
    }
  }

  // 语言分布
  if (Object.keys(statistics.languageBreakdown).length > 1) {
    lines.push('');
    lines.push('**语言分布:**');
    for (const [lang, count] of Object.entries(statistics.languageBreakdown)) {
      const percent = Math.round((count / statistics.totalModules) * 100);
      lines.push(`  • ${lang}: ${count} 文件 (${percent}%)`);
    }
  }

  // 最大文件
  if (statistics.largestFiles.length > 0) {
    lines.push('');
    lines.push('**最大文件 (Top 5):**');
    for (const file of statistics.largestFiles.slice(0, 5)) {
      lines.push(`  • ${file.path}: ${file.lines} 行`);
    }
  }

  // 被导入最多的模块
  if (statistics.mostImportedModules.length > 0) {
    lines.push('');
    lines.push('**核心模块 (被导入最多):**');
    for (const mod of statistics.mostImportedModules.slice(0, 5)) {
      lines.push(`  • ${mod.id}: ${mod.importCount} 次导入`);
    }
  }

  // 被调用最多的符号
  if (statistics.mostCalledSymbols.length > 0) {
    lines.push('');
    lines.push('**热点函数 (被调用最多):**');
    for (const sym of statistics.mostCalledSymbols.slice(0, 5)) {
      lines.push(`  • ${sym.name}: ${sym.callCount} 次调用`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// 子命令处理
// ============================================================================

/**
 * generate 子命令 - 生成增强版代码蓝图
 */
async function handleGenerate(
  ctx: CommandContext,
  options: Record<string, string | boolean>
): Promise<CommandResult> {
  const { config, ui } = ctx;

  const skipSemantics = options['skip-semantics'] || options.s;

  // 分块模式：输出到 .claude/map/ 目录
  ui.addMessage(
    'assistant',
    skipSemantics
      ? '正在生成代码蓝图（分块模式，跳过 AI 语义）...'
      : '正在生成增强版代码蓝图（分块模式，包含 AI 语义）...'
  );

  try {
    const generator = new ChunkedBlueprintGenerator(config.cwd, {
      withGlobalDependencyGraph: true,
      withChecksum: true,
      outputDir: path.join(config.cwd, '.claude', 'map'),
      onProgress: (message) => {
        // 显示进度消息（可选）
        // ui.addMessage('assistant', message);
      },
    });

    await generator.generate();

    const mapDir = path.join(config.cwd, '.claude', 'map');

    ui.addMessage(
      'assistant',
      `\n✅ 分块蓝图已生成到: ${mapDir}/\n\n` +
      `文件结构：\n` +
      `  • index.json - 轻量级索引文件\n` +
      `  • chunks/*.json - 按目录分块的数据\n\n` +
      `使用 /map serve 启动可视化服务器查看`
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.addMessage('assistant', `❌ 生成失败: ${message}`);
    return { success: false, message };
  }
}

/**
 * serve 子命令 - 启动可视化服务器
 */
async function handleServe(
  ctx: CommandContext,
  options: Record<string, string | boolean>
): Promise<CommandResult> {
  const { config, ui } = ctx;
  const port = options.port ? parseInt(options.port as string, 10) : 3030;
  const mapDir = path.join(config.cwd, '.claude', 'map');
  const indexFile = path.join(mapDir, 'index.json');

  // 检查分块蓝图是否存在
  if (!fs.existsSync(indexFile)) {
    ui.addMessage(
      'assistant',
      '❌ 未找到分块蓝图文件。请先运行 `/map generate` 生成蓝图。\n\n' +
      `期望位置: ${indexFile}`
    );
    return { success: false, message: 'Blueprint index.json not found' };
  }

  try {
    // 传递 map 目录路径给服务器,让服务器自己推断
    const server = new VisualizationServer({ ontologyPath: mapDir, port });
    await server.start();
    const url = server.getAddress();

    ui.addMessage(
      'assistant',
      `🚀 **可视化服务器已启动**\n\n` +
      `打开浏览器访问: ${url}\n\n` +
      `功能:\n` +
      `  • 依赖图可视化\n` +
      `  • 架构层视图\n` +
      `  • 模块搜索\n` +
      `  • 语义描述查看\n\n` +
      `按 Ctrl+C 停止服务器`
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.addMessage('assistant', `❌ 启动服务器失败: ${message}`);
    return { success: false, message };
  }
}

/**
 * view 子命令 - 生成并打开浏览器
 */
async function handleView(
  ctx: CommandContext,
  options: Record<string, string | boolean>
): Promise<CommandResult> {
  // 先生成
  const result = await handleGenerate(ctx, options);
  if (!result.success) {
    return result;
  }

  // 然后启动服务
  return handleServe(ctx, options);
}

/**
 * status 子命令 - 显示当前蓝图状态
 */
async function handleStatus(
  ctx: CommandContext,
  _options: Record<string, string | boolean>
): Promise<CommandResult> {
  const { config, ui } = ctx;
  const mapDir = path.join(config.cwd, '.claude', 'map');
  const indexFile = path.join(mapDir, 'index.json');

  if (!fs.existsSync(indexFile)) {
    ui.addMessage(
      'assistant',
      '❌ 未找到分块蓝图索引文件。\n\n' +
      '运行 `/map generate` 来生成代码蓝图。\n\n' +
      `期望位置: ${indexFile}`
    );
    return { success: true };
  }

  try {
    const content = fs.readFileSync(indexFile, 'utf-8');
    const index = JSON.parse(content) as import('../map/types-chunked.js').ChunkedIndex;
    const stats = fs.statSync(indexFile);

    // 计算 chunks 目录大小
    const chunksDir = path.join(mapDir, 'chunks');
    let totalChunksSize = 0;
    let chunkCount = 0;
    if (fs.existsSync(chunksDir)) {
      const chunkFiles = fs.readdirSync(chunksDir);
      for (const file of chunkFiles) {
        if (file.endsWith('.json')) {
          const chunkPath = path.join(chunksDir, file);
          totalChunksSize += fs.statSync(chunkPath).size;
          chunkCount++;
        }
      }
    }

    const lines: string[] = [];
    lines.push('');
    lines.push('📁 **分块蓝图状态**');
    lines.push('');
    lines.push(`格式: ${index.format}`);
    lines.push(`版本: ${index.meta.version}`);
    lines.push(`生成时间: ${new Date(index.meta.generatedAt).toLocaleString()}`);
    if (index.meta.updatedAt) {
      lines.push(`更新时间: ${new Date(index.meta.updatedAt).toLocaleString()}`);
    }
    lines.push('');
    lines.push('**存储信息:**');
    lines.push(`  • 索引文件: ${formatSize(stats.size)}`);
    lines.push(`  • 分块数量: ${chunkCount} 个`);
    lines.push(`  • 分块总大小: ${formatSize(totalChunksSize)}`);
    lines.push(`  • 总大小: ${formatSize(stats.size + totalChunksSize)}`);
    lines.push('');
    lines.push(`项目: ${index.project.name}`);
    lines.push(`路径: ${index.project.rootPath}`);
    lines.push(`语言: ${index.project.languages.join(', ')}`);
    lines.push('');
    lines.push('**统计信息:**');
    lines.push(`  • 模块数: ${index.statistics.totalModules}`);
    lines.push(`  • 符号数: ${index.statistics.totalSymbols}`);
    lines.push(`  • 代码行数: ${index.statistics.totalLines.toLocaleString()}`);
    lines.push(`  • 模块依赖: ${index.statistics.referenceStats.totalModuleDeps}`);
    lines.push(`  • 符号调用: ${index.statistics.referenceStats.totalSymbolCalls}`);
    lines.push(`  • 类型引用: ${index.statistics.referenceStats.totalTypeRefs}`);

    // 显示语义覆盖率
    if (index.meta.semanticVersion) {
      lines.push('');
      lines.push('**语义信息:**');
      lines.push(`  • 语义版本: ${index.meta.semanticVersion}`);
      lines.push(`  • 覆盖率: ${index.statistics.semanticCoverage.coveragePercent}%`);
    }

    // 显示项目描述
    if (index.project.semantic?.description) {
      lines.push('');
      lines.push('**项目描述:**');
      lines.push(`  ${index.project.semantic.description}`);
    }

    // 显示架构层分布
    lines.push('');
    lines.push('**架构层分布:**');
    const layerNames: Record<string, string> = {
      presentation: '表现层',
      business: '业务层',
      data: '数据层',
      infrastructure: '基础设施',
      crossCutting: '横切关注点',
    };
    for (const [layer, count] of Object.entries(index.statistics.layerDistribution)) {
      if (count > 0) {
        const name = layerNames[layer] || layer;
        lines.push(`  • ${name}: ${count} 模块`);
      }
    }

    lines.push('');

    ui.addMessage('assistant', lines.join('\n'));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.addMessage('assistant', `❌ 读取分块蓝图索引失败: ${message}`);
    return { success: false, message };
  }
}

/**
 * implement 子命令 - 根据蓝图中的计划模块生成代码
 */
async function handleImplement(
  ctx: CommandContext,
  options: Record<string, string | boolean>
): Promise<CommandResult> {
  const { config, ui } = ctx;
  const mapDir = path.join(config.cwd, '.claude', 'map');
  const chunksDir = path.join(mapDir, 'chunks');

  // 检查蓝图是否存在
  if (!fs.existsSync(mapDir)) {
    ui.addMessage(
      'assistant',
      '❌ 未找到蓝图目录。请先运行 `/map generate` 生成蓝图。'
    );
    return { success: false, message: 'Blueprint not found' };
  }

  ui.addMessage('assistant', '正在扫描计划模块...');

  try {
    // 扫描所有 chunk 文件中的 plannedModules
    const plannedModules: Array<{
      id: string;
      name: string;
      designNotes: string;
      priority: string;
      dependencies: string[];
      chunkPath: string;
    }> = [];

    const chunkFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith('.json'));

    for (const chunkFile of chunkFiles) {
      const chunkPath = path.join(chunksDir, chunkFile);
      const chunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

      if (chunkData.plannedModules && Array.isArray(chunkData.plannedModules)) {
        for (const planned of chunkData.plannedModules) {
          if (planned.status === 'planned' || planned.status === 'in-progress') {
            plannedModules.push({
              ...planned,
              chunkPath: chunkFile.replace('.json', ''),
            });
          }
        }
      }
    }

    if (plannedModules.length === 0) {
      ui.addMessage(
        'assistant',
        '没有找到计划中的模块。\n\n' +
        '您可以通过以下方式添加计划模块：\n' +
        '1. 启动可视化服务器：`/map serve`\n' +
        '2. 在浏览器中点击"添加计划模块"按钮'
      );
      return { success: true };
    }

    // 按优先级排序
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    plannedModules.sort((a, b) =>
      (priorityOrder[a.priority as keyof typeof priorityOrder] || 1) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] || 1)
    );

    // 显示计划模块列表
    let listMessage = '📋 **发现以下计划模块：**\n\n';
    plannedModules.forEach((m, i) => {
      const priorityEmoji = { high: '🔴', medium: '🟡', low: '🟢' }[m.priority] || '⚪';
      listMessage += `${i + 1}. ${priorityEmoji} **${m.id}**\n`;
      listMessage += `   ${m.designNotes}\n`;
      if (m.dependencies.length > 0) {
        listMessage += `   依赖: ${m.dependencies.join(', ')}\n`;
      }
      listMessage += '\n';
    });

    listMessage += '\n请输入要实现的模块序号（或输入 "all" 实现所有模块）：';

    ui.addMessage('assistant', listMessage);

    // 如果指定了 --all 选项，实现所有模块
    if (options.all) {
      return await implementModules(ctx, plannedModules, mapDir);
    }

    // 如果指定了 --id 选项，实现指定模块
    const targetId = options.id as string;
    if (targetId) {
      const target = plannedModules.find(m => m.id === targetId);
      if (!target) {
        ui.addMessage('assistant', `❌ 未找到模块: ${targetId}`);
        return { success: false, message: 'Module not found' };
      }
      return await implementModules(ctx, [target], mapDir);
    }

    // 交互模式：提示用户选择
    // 注：由于 CLI 限制，这里只显示列表，用户需要使用 --id 或 --all 参数
    ui.addMessage(
      'assistant',
      '使用方法：\n' +
      '  `/map implement --id <模块路径>` - 实现指定模块\n' +
      '  `/map implement --all` - 实现所有计划模块'
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ui.addMessage('assistant', `❌ 扫描失败: ${message}`);
    return { success: false, message };
  }
}

/**
 * 实现指定的计划模块
 */
async function implementModules(
  ctx: CommandContext,
  modules: Array<{
    id: string;
    name: string;
    designNotes: string;
    priority: string;
    dependencies: string[];
    chunkPath: string;
  }>,
  mapDir: string
): Promise<CommandResult> {
  const { config, ui } = ctx;

  for (const module of modules) {
    ui.addMessage('assistant', `\n正在生成: **${module.id}**...`);

    // 生成代码骨架
    const code = generateModuleSkeleton(module);

    // 确保目录存在
    const targetPath = path.join(config.cwd, module.id);
    const targetDir = path.dirname(targetPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 检查文件是否已存在
    if (fs.existsSync(targetPath)) {
      ui.addMessage('assistant', `⚠️ 文件已存在，跳过: ${module.id}`);
      continue;
    }

    // 写入文件
    fs.writeFileSync(targetPath, code, 'utf8');

    // 更新 chunk 中的模块状态
    const chunkPath = path.join(mapDir, 'chunks', `${module.chunkPath}.json`);
    if (fs.existsSync(chunkPath)) {
      const chunk = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

      // 从 plannedModules 中移除
      if (chunk.plannedModules) {
        const index = chunk.plannedModules.findIndex((m: any) => m.id === module.id);
        if (index >= 0) {
          chunk.plannedModules.splice(index, 1);
        }
      }

      // 添加到 moduleDesignMeta
      if (!chunk.moduleDesignMeta) {
        chunk.moduleDesignMeta = {};
      }
      chunk.moduleDesignMeta[module.id] = {
        status: 'in-progress',
        designNotes: module.designNotes,
        markedAt: new Date().toISOString(),
      };

      fs.writeFileSync(chunkPath, JSON.stringify(chunk, null, 2), 'utf8');
    }

    ui.addMessage('assistant', `✓ 已生成: ${module.id}`);
  }

  ui.addMessage(
    'assistant',
    `\n🎉 **完成！** 已生成 ${modules.length} 个模块骨架。\n\n` +
    '下一步：\n' +
    '1. 完善生成的代码\n' +
    '2. 运行 `/map generate` 更新蓝图\n' +
    '3. 使用 `/map serve` 查看更新后的架构'
  );

  return { success: true };
}

/**
 * 生成模块代码骨架
 */
function generateModuleSkeleton(module: {
  id: string;
  name: string;
  designNotes: string;
  dependencies: string[];
}): string {
  const isTypeScript = module.id.endsWith('.ts') || module.id.endsWith('.tsx');
  const name = module.name.replace(/\.(ts|tsx|js|jsx)$/, '');
  const className = name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  // 生成导入语句
  let imports = '';
  for (const dep of module.dependencies) {
    const depName = path.basename(dep).replace(/\.(ts|tsx|js|jsx)$/, '');
    const relativePath = getRelativePath(module.id, dep);
    imports += `import { } from '${relativePath}';\n`;
  }

  // 生成代码骨架
  const code = `/**
 * ${name}
 *
 * ${module.designNotes}
 *
 * @module ${module.id}
 * @created ${new Date().toISOString().split('T')[0]}
 */

${imports}
/**
 * TODO: 实现 ${className}
 *
 * 设计说明：
 * ${module.designNotes.split('\n').join('\n * ')}
 */
export class ${className} {
  constructor() {
    // TODO: 初始化
  }

  // TODO: 添加方法
}

/**
 * 默认导出
 */
export default ${className};
`;

  return code;
}

/**
 * 计算相对路径
 */
function getRelativePath(from: string, to: string): string {
  const fromDir = path.dirname(from);
  let relativePath = path.relative(fromDir, to).replace(/\\/g, '/');

  // 移除 .ts/.js 扩展名
  relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');

  // 确保以 ./ 或 ../ 开头
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  return relativePath;
}

// ============================================================================
// 命令定义
// ============================================================================

export const mapCommand: SlashCommand = {
  name: 'map',
  aliases: ['codemap', 'blueprint'],
  description: '生成增强版代码蓝图（含层级、引用、语义）',
  usage: `/map [subcommand] [options]

子命令:
  generate    生成分块代码蓝图 (默认)
  serve       启动可视化服务器
  view        生成并打开可视化
  status      查看当前蓝图状态
  implement   根据计划模块生成代码

选项:
  --skip-semantics, -s  跳过 AI 语义生成
  --port <n>            服务器端口 (默认: 3030)
  --id <path>           指定要实现的模块路径 (implement)
  --all                 实现所有计划模块 (implement)

输出目录: .claude/map/
  • index.json          轻量级索引文件
  • chunks/*.json       按目录分块的数据

蓝图内容:
  • 层级结构: 目录树视图 + 架构分层视图
  • 引用关系: 模块依赖、符号调用、类型引用
  • 语义描述: AI 生成的业务含义描述

示例:
  /map                  生成分块蓝图到 .claude/map/
  /map -s               生成蓝图（跳过语义，更快）
  /map serve            启动可视化服务器
  /map serve --port 8080
  /map status`,
  category: 'development',
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const { subcommand, options } = parseArgs(ctx.args);

    switch (subcommand) {
      case 'generate':
        return handleGenerate(ctx, options);

      case 'serve':
        return handleServe(ctx, options);

      case 'view':
        return handleView(ctx, options);

      case 'status':
        return handleStatus(ctx, options);

      case 'implement':
        return handleImplement(ctx, options);

      default:
        // 默认行为：生成增强版蓝图
        return handleGenerate(ctx, options);
    }
  },
};

// 导出注册函数
import { commandRegistry } from './registry.js';

export function registerMapCommands(): void {
  commandRegistry.register(mapCommand);
}
