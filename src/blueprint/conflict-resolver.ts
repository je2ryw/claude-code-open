/**
 * ConflictResolver - 蜂王冲突解决器
 *
 * 核心职责：
 * 1. 分析冲突类型（追加/修改/删除）
 * 2. 追加冲突自动合并
 * 3. 复杂冲突调用 AI 决策
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ConflictFileDetail,
  ConflictDecision,
  ConflictDecisionType,
  ConflictResolutionRequest,
} from './types.js';
import { ConversationLoop } from '../core/loop.js';

// ============================================================================
// 冲突解决器
// ============================================================================

export class ConflictResolver {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * 解决冲突（主入口）
   */
  async resolve(request: ConflictResolutionRequest): Promise<ConflictDecision> {
    console.log(`[ConflictResolver] 开始解决冲突，涉及 ${request.files.length} 个文件`);

    const mergedContents: Record<string, string> = {};
    let allAutoMerged = true;
    const reasons: string[] = [];

    for (const file of request.files) {
      // 分析冲突类型
      const conflictType = this.analyzeConflictType(file);
      file.conflictType = conflictType;

      console.log(`[ConflictResolver] 文件 ${file.path} 冲突类型: ${conflictType}`);

      if (conflictType === 'append') {
        // 追加冲突，自动合并
        const merged = this.autoMergeAppend(file);
        if (merged) {
          mergedContents[file.path] = merged;
          reasons.push(`${file.path}: 自动合并追加内容`);
        } else {
          allAutoMerged = false;
          reasons.push(`${file.path}: 自动合并失败，需要人工干预`);
        }
      } else if (conflictType === 'modify') {
        // 修改冲突，需要 AI 决策或人工干预
        allAutoMerged = false;
        reasons.push(`${file.path}: 修改冲突，需要智能合并`);

        // 尝试 AI 合并
        const aiMerged = await this.aiMerge(file, request.taskDescription);
        if (aiMerged) {
          mergedContents[file.path] = aiMerged;
          reasons.push(`${file.path}: AI智能合并成功`);
        }
      } else {
        allAutoMerged = false;
        reasons.push(`${file.path}: 未知冲突类型，需要人工干预`);
      }
    }

    // 如果所有文件都成功合并
    if (Object.keys(mergedContents).length === request.files.length) {
      return {
        type: allAutoMerged ? 'auto_merge' : 'ai_merge',
        mergedContents,
        reasoning: reasons.join('\n'),
        success: true,
      };
    }

    // 部分文件无法合并
    return {
      type: 'manual',
      mergedContents: Object.keys(mergedContents).length > 0 ? mergedContents : undefined,
      reasoning: reasons.join('\n'),
      success: false,
      error: '部分文件无法自动合并，需要人工干预',
    };
  }

  /**
   * 分析冲突类型
   */
  private analyzeConflictType(file: ConflictFileDetail): 'append' | 'modify' | 'delete' | 'unknown' {
    const { oursContent, theirsContent, baseContent } = file;

    // 如果有共同祖先，可以更精确判断
    if (baseContent) {
      const oursLines = oursContent.split('\n');
      const theirsLines = theirsContent.split('\n');
      const baseLines = baseContent.split('\n');

      // 检查是否是追加模式：双方都在 base 基础上添加内容
      const oursAdded = this.getAddedLines(baseLines, oursLines);
      const theirsAdded = this.getAddedLines(baseLines, theirsLines);

      // 如果双方都只是添加内容，没有修改原有内容
      if (oursAdded.length > 0 && theirsAdded.length > 0) {
        // 检查是否修改了相同的行
        const oursModified = this.getModifiedLines(baseLines, oursLines);
        const theirsModified = this.getModifiedLines(baseLines, theirsLines);

        if (oursModified.length === 0 && theirsModified.length === 0) {
          return 'append';
        }
      }

      return 'modify';
    }

    // 没有共同祖先，使用启发式判断
    // 检查是否是典型的 index.ts 追加模式
    if (this.isTypicalAppendConflict(oursContent, theirsContent)) {
      return 'append';
    }

    return 'unknown';
  }

  /**
   * 获取新增的行
   */
  private getAddedLines(baseLines: string[], newLines: string[]): string[] {
    const baseSet = new Set(baseLines.map(l => l.trim()));
    return newLines.filter(line => !baseSet.has(line.trim()));
  }

  /**
   * 获取修改的行（在 base 中存在但内容不同）
   */
  private getModifiedLines(baseLines: string[], newLines: string[]): string[] {
    const modified: string[] = [];
    const minLen = Math.min(baseLines.length, newLines.length);

    for (let i = 0; i < minLen; i++) {
      if (baseLines[i].trim() !== newLines[i].trim()) {
        // 检查是否是真正的修改还是只是插入导致的偏移
        if (baseLines.includes(newLines[i])) {
          continue; // 行还在，只是位置变了
        }
        modified.push(newLines[i]);
      }
    }

    return modified;
  }

  /**
   * 检查是否是典型的追加冲突（如 index.ts 导出）
   */
  private isTypicalAppendConflict(ours: string, theirs: string): boolean {
    // 检查是否都包含 import 和 export 语句
    const hasImportExport = (content: string) => {
      return content.includes('import ') &&
             (content.includes('export {') || content.includes('export default'));
    };

    if (!hasImportExport(ours) || !hasImportExport(theirs)) {
      return false;
    }

    // 提取 import 语句
    const getImports = (content: string) => {
      const matches = content.match(/import\s+\w+\s+from\s+['"][^'"]+['"]/g);
      return matches || [];
    };

    const oursImports = new Set(getImports(ours));
    const theirsImports = new Set(getImports(theirs));

    // 如果双方都有独特的 import，很可能是追加模式
    const uniqueToOurs = [...oursImports].filter(i => !theirsImports.has(i));
    const uniqueToTheirs = [...theirsImports].filter(i => !oursImports.has(i));

    return uniqueToOurs.length > 0 && uniqueToTheirs.length > 0;
  }

  /**
   * 自动合并追加冲突
   */
  private autoMergeAppend(file: ConflictFileDetail): string | null {
    try {
      const { oursContent, theirsContent, baseContent } = file;

      // 如果是 TypeScript/JavaScript 文件，使用智能合并
      if (file.path.endsWith('.ts') || file.path.endsWith('.js')) {
        return this.mergeTypeScriptFile(oursContent, theirsContent, baseContent);
      }

      // 其他文件类型，简单合并
      return this.simpleAppendMerge(oursContent, theirsContent, baseContent);
    } catch (err) {
      console.error(`[ConflictResolver] 自动合并失败:`, err);
      return null;
    }
  }

  /**
   * 合并 TypeScript 文件（智能处理 import/export）
   */
  private mergeTypeScriptFile(ours: string, theirs: string, base?: string): string {
    // 提取各部分
    const oursImports = this.extractImports(ours);
    const theirsImports = this.extractImports(theirs);
    const baseImports = base ? this.extractImports(base) : [];

    // 合并 imports（去重）
    const allImports = new Map<string, string>();
    [...baseImports, ...oursImports, ...theirsImports].forEach(imp => {
      const key = this.getImportKey(imp);
      if (key) {
        allImports.set(key, imp);
      }
    });

    // 提取 export 语句
    const oursExports = this.extractNamedExports(ours);
    const theirsExports = this.extractNamedExports(theirs);
    const baseExports = base ? this.extractNamedExports(base) : [];

    // 合并 exports（去重）
    const allExports = new Set([...baseExports, ...oursExports, ...theirsExports]);

    // 提取 models 对象内容
    const oursModels = this.extractModelsObject(ours);
    const theirsModels = this.extractModelsObject(theirs);
    const baseModels = base ? this.extractModelsObject(base) : [];

    // 合并 models
    const allModels = new Set([...baseModels, ...oursModels, ...theirsModels]);

    // 提取其他代码（如 initializeModels 函数）
    const otherCode = this.extractOtherCode(ours, theirs);

    // 重新组装文件
    const result = this.assembleTypeScriptFile(
      Array.from(allImports.values()),
      Array.from(allExports),
      Array.from(allModels),
      otherCode
    );

    return result;
  }

  /**
   * 提取 import 语句
   */
  private extractImports(content: string): string[] {
    const lines = content.split('\n');
    const imports: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('import ')) {
        imports.push(line.trim());
      }
    }

    return imports;
  }

  /**
   * 获取 import 的唯一标识（模块名）
   */
  private getImportKey(importLine: string): string | null {
    const match = importLine.match(/from\s+['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  }

  /**
   * 提取命名导出
   */
  private extractNamedExports(content: string): string[] {
    const match = content.match(/export\s*\{\s*([^}]+)\s*\}/);
    if (!match) return [];

    return match[1]
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * 提取 models 对象成员
   */
  private extractModelsObject(content: string): string[] {
    const match = content.match(/export\s+const\s+models\s*=\s*\{([^}]+)\}/);
    if (!match) return [];

    return match[1]
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('//'));
  }

  /**
   * 提取其他代码（函数定义等）
   */
  private extractOtherCode(ours: string, theirs: string): string {
    // 优先使用 theirs 中的其他代码（新版本）
    // 提取 initializeModels 等函数
    const funcMatch = theirs.match(/(\/\/\s*Model initialization[\s\S]*$)/);
    if (funcMatch) {
      return funcMatch[1];
    }

    const oursFuncMatch = ours.match(/(\/\/\s*Model initialization[\s\S]*$)/);
    if (oursFuncMatch) {
      return oursFuncMatch[1];
    }

    return '';
  }

  /**
   * 组装 TypeScript 文件
   */
  private assembleTypeScriptFile(
    imports: string[],
    exports: string[],
    models: string[],
    otherCode: string
  ): string {
    const lines: string[] = [];

    // 文件头注释
    lines.push('/**');
    lines.push(' * Models index - centralized export for all database models');
    lines.push(' */');
    lines.push('');

    // Import 语句
    imports.forEach(imp => lines.push(imp));
    lines.push('');

    // Export 语句
    if (exports.length > 0) {
      lines.push('// Export individual models');
      lines.push(`export { ${exports.join(', ')} };`);
      lines.push('');
    }

    // Models 对象
    if (models.length > 0) {
      lines.push('// Export all models as a collection');
      lines.push('export const models = {');
      models.forEach((model, i) => {
        const comma = i < models.length - 1 ? ',' : ',';
        lines.push(`  ${model}${comma}`);
      });
      lines.push('};');
      lines.push('');
    }

    // 其他代码
    if (otherCode) {
      lines.push(otherCode);
    }

    // 默认导出
    lines.push('export default models;');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 简单追加合并
   */
  private simpleAppendMerge(ours: string, theirs: string, base?: string): string {
    if (!base) {
      // 没有共同祖先，简单拼接（可能不是最优解）
      return ours + '\n' + theirs;
    }

    // 找出双方新增的内容
    const oursLines = ours.split('\n');
    const theirsLines = theirs.split('\n');
    const baseLines = base.split('\n');

    const baseSet = new Set(baseLines);
    const oursAdded = oursLines.filter(l => !baseSet.has(l));
    const theirsAdded = theirsLines.filter(l => !baseSet.has(l));

    // 合并：base + ours新增 + theirs新增
    return [...baseLines, ...oursAdded, ...theirsAdded].join('\n');
  }

  /**
   * AI 智能合并（调用 Claude）
   *
   * 核心理念：像人类程序员一样解决冲突
   * 1. 理解双方的修改意图
   * 2. 分析是否可以共存
   * 3. 生成正确的合并代码
   */
  private async aiMerge(file: ConflictFileDetail, taskDescription: string): Promise<string | null> {
    console.log(`[ConflictResolver] 启动 AI 智能合并: ${file.path}`);

    try {
      const prompt = this.buildAiMergePrompt(file, taskDescription);

      // 使用 ConversationLoop 调用 Claude
      const loop = new ConversationLoop({
        model: 'sonnet',  // 使用 sonnet 平衡速度和质量
        maxTurns: 3,
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: this.projectPath,
        isSubAgent: true,
        systemPrompt: this.buildAiMergeSystemPrompt(),
        thinking: { enabled: false },
        allowedTools: [],  // 不需要工具，纯文本生成
      });

      let responseText = '';

      for await (const event of loop.processMessageStream(prompt)) {
        if (event.type === 'text' && event.content) {
          responseText += event.content;
        }
      }

      // 从响应中提取合并后的代码
      const mergedCode = this.extractMergedCode(responseText, file.path);

      if (mergedCode) {
        console.log(`[ConflictResolver] AI 合并成功: ${file.path}`);
        return mergedCode;
      }

      console.log(`[ConflictResolver] AI 无法提取合并代码: ${file.path}`);
      return null;
    } catch (err) {
      console.error(`[ConflictResolver] AI 合并异常:`, err);
      return null;
    }
  }

  /**
   * 构建 AI 合并的 System Prompt
   */
  private buildAiMergeSystemPrompt(): string {
    return `你是一个专业的 Git 冲突解决专家。你的任务是像人类程序员一样解决合并冲突。

## 工作流程
1. 理解双方的修改意图
2. 分析修改是否可以共存
3. 生成正确的合并代码

## 输出要求
- 必须返回完整的合并后代码
- 用 \`\`\`merged 代码块包裹
- 不要包含任何冲突标记（<<<<<<< ======= >>>>>>>）
- 保留双方有效的修改
- 确保代码语法正确`;
  }

  /**
   * 构建 AI 合并的 Prompt
   */
  private buildAiMergePrompt(file: ConflictFileDetail, taskDescription: string): string {
    return `# Git 合并冲突解决请求

## 任务背景
${taskDescription}

## 冲突文件
\`${file.path}\`

## 主分支内容（ours - 已合并的其他 Worker 改动）
\`\`\`
${file.oursContent}
\`\`\`

## Worker 分支内容（theirs - 当前 Worker 的改动）
\`\`\`
${file.theirsContent}
\`\`\`

${file.baseContent ? `## 共同祖先内容（base - 合并前的原始内容）
\`\`\`
${file.baseContent}
\`\`\`
` : ''}

## 你的任务

1. **分析双方意图**：
   - 主分支（ours）添加/修改了什么？
   - Worker分支（theirs）添加/修改了什么？

2. **判断是否冲突**：
   - 如果两边修改不同的部分 → 保留两边
   - 如果两边修改相同部分 → 选择更合理的或合并逻辑

3. **生成合并结果**：
   - 必须是完整的文件内容
   - 不能有任何冲突标记
   - 语法必须正确

请返回合并后的完整代码，用 \`\`\`merged 代码块包裹：

\`\`\`merged
// 合并后的完整代码
\`\`\``;
  }

  /**
   * 从 AI 响应中提取合并后的代码
   */
  private extractMergedCode(response: string, filePath: string): string | null {
    // 优先查找 ```merged 代码块
    const mergedMatch = response.match(/```merged\s*([\s\S]*?)\s*```/);
    if (mergedMatch) {
      return mergedMatch[1].trim();
    }

    // 查找带语言标识的代码块（如 ```typescript, ```javascript）
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string[]> = {
      'ts': ['typescript', 'ts'],
      'tsx': ['typescript', 'tsx'],
      'js': ['javascript', 'js'],
      'jsx': ['javascript', 'jsx'],
    };

    const langs = langMap[ext || ''] || [ext];
    for (const lang of langs) {
      const regex = new RegExp(`\`\`\`${lang}\\s*([\\s\\S]*?)\\s*\`\`\``);
      const match = response.match(regex);
      if (match) {
        return match[1].trim();
      }
    }

    // 查找任意代码块
    const anyCodeMatch = response.match(/```\w*\s*([\s\S]*?)\s*```/);
    if (anyCodeMatch) {
      const code = anyCodeMatch[1].trim();
      // 验证没有冲突标记
      if (!code.includes('<<<<<<<') && !code.includes('=======') && !code.includes('>>>>>>>')) {
        return code;
      }
    }

    return null;
  }

  /**
   * 应用合并结果到文件系统
   */
  async applyMergedContents(mergedContents: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(mergedContents)) {
      const fullPath = path.join(this.projectPath, filePath);
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`[ConflictResolver] 已写入合并结果: ${filePath}`);
    }
  }
}

export default ConflictResolver;
