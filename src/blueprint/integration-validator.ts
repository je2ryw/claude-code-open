/**
 * IntegrationValidator - 集成验证器 v5.0
 *
 * 设计哲学：用 Agent 的智能替代代码的工程化
 *
 * v4.x 的问题：
 * - 7 个独立的检查 Agent，各自为战
 * - 每个 Agent 重复搜索代码库
 * - 无法关联问题（如 API 错误导致测试失败）
 * - 过多的配置选项和类型定义
 *
 * v5.0 的简化：
 * - 单一智能 Agent，全面负责质量保障
 * - 给足上下文，让 Agent 自己决定检查什么
 * - 自然语言契约，不需要结构化类型
 * - 边检查边修复，一次完成
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import type {
  IntegrationIssue,
  IntegrationValidationResult,
  IntegrationFixResult,
  IntegrationValidationConfig,
  SmartTask,
  TechStack,
  Blueprint,
} from './types.js';
import { DEFAULT_INTEGRATION_VALIDATION_CONFIG } from './types.js';
import { ConversationLoop } from '../core/loop.js';

// ============================================================================
// IntegrationValidator v5.0 - 单一智能 Agent
// ============================================================================

export class IntegrationValidator extends EventEmitter {
  private projectPath: string;
  private config: IntegrationValidationConfig;
  private techStack?: TechStack;
  private blueprint?: Blueprint;

  constructor(
    projectPath: string,
    config?: Partial<IntegrationValidationConfig>,
    techStack?: TechStack,
    blueprint?: Blueprint
  ) {
    super();
    this.projectPath = projectPath;
    this.config = { ...DEFAULT_INTEGRATION_VALIDATION_CONFIG, ...config };
    this.techStack = techStack;
    this.blueprint = blueprint;
  }

  // ============================================================================
  // 核心方法：单一 Agent 完成所有工作
  // ============================================================================

  /**
   * 执行集成验证
   * 使用单一智能 Agent 完成：检查 + 修复 + 验证
   */
  async validate(): Promise<IntegrationValidationResult> {
    const startedAt = new Date();
    this.emit('validation:started', { projectPath: this.projectPath });

    try {
      // 构建上下文信息
      const context = this.buildContext();

      // 创建质量守卫 Agent
      const loop = new ConversationLoop({
        model: 'sonnet',
        maxTurns: 30,  // 给足轮数，让 Agent 自由发挥
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: this.projectPath,
        systemPrompt: this.buildSystemPrompt(context),
        isSubAgent: true,
      });

      console.log('[IntegrationValidator] 启动质量守卫 Agent...');
      this.emit('validation:checking', { check: 'quality_guardian' });

      const result = await loop.processMessage(this.buildTaskPrompt());

      // 解析 Agent 返回的结果
      const parsed = this.parseAgentResult(result);

      const completedAt = new Date();
      const validationResult: IntegrationValidationResult = {
        success: parsed.success,
        issues: parsed.issues,
        checksPerformed: parsed.checksPerformed,
        issuesFound: parsed.issues.length,
        summary: parsed.summary,
        startedAt,
        completedAt,
      };

      console.log(`[IntegrationValidator] ${parsed.summary}`);
      this.emit('validation:completed', validationResult);

      return validationResult;

    } catch (error: any) {
      const completedAt = new Date();
      const result: IntegrationValidationResult = {
        success: false,
        issues: [{
          id: uuidv4(),
          type: 'other',
          severity: 'error',
          summary: '质量守卫 Agent 执行失败',
          description: error.message,
          affectedFiles: [],
          affectedSide: 'both',
          fixSuggestion: '检查 Agent 配置和项目结构',
        }],
        checksPerformed: 0,
        issuesFound: 1,
        summary: `验证失败: ${error.message}`,
        startedAt,
        completedAt,
      };

      this.emit('validation:error', { error: error.message });
      return result;
    }
  }

  /**
   * 修复问题（v5.0 中已集成到 validate，此方法保留兼容性）
   */
  async fix(issues: IntegrationIssue[]): Promise<IntegrationFixResult> {
    if (issues.length === 0) {
      return {
        success: true,
        fixedIssues: [],
        remainingIssues: [],
        modifiedFiles: [],
        fixDescription: '没有需要修复的问题',
      };
    }

    // v5.0: 直接调用 validate，它会边检查边修复
    const result = await this.validate();

    return {
      success: result.success,
      fixedIssues: result.success ? issues.map(i => i.id) : [],
      remainingIssues: result.success ? [] : issues.map(i => i.id),
      modifiedFiles: [],
      fixDescription: result.summary,
    };
  }

  /**
   * 生成修复任务（保留兼容性）
   */
  generateFixTasks(issues: IntegrationIssue[]): SmartTask[] {
    return issues.map(issue => ({
      id: `fix-${issue.id}`,
      name: `修复: ${issue.summary}`,
      description: `${issue.description}\n\n修复建议: ${issue.fixSuggestion}`,
      type: 'code' as const,
      category: issue.affectedSide === 'both' ? 'shared' : issue.affectedSide,
      blueprintId: '',
      files: issue.affectedFiles,
      dependencies: [],
      needsTest: false,
      estimatedMinutes: 5,
      complexity: 'simple' as const,
      status: 'pending' as const,
    }));
  }

  // ============================================================================
  // 私有方法：构建 Agent 上下文
  // ============================================================================

  /**
   * 构建上下文信息
   * 把所有相关信息组织成自然语言，让 Agent 理解
   */
  private buildContext(): string {
    const parts: string[] = [];

    // 1. 技术栈信息
    if (this.techStack) {
      const techInfo: string[] = [];
      if (this.techStack.language) techInfo.push(`语言: ${this.techStack.language}`);
      if (this.techStack.framework) techInfo.push(`框架: ${this.techStack.framework}`);
      if (this.techStack.uiFramework) techInfo.push(`UI: ${this.techStack.uiFramework}`);
      if (this.techStack.cssFramework) techInfo.push(`CSS: ${this.techStack.cssFramework}`);
      if (this.techStack.testFramework) techInfo.push(`测试: ${this.techStack.testFramework}`);
      if (this.techStack.additionalTools?.length) {
        techInfo.push(`其他: ${this.techStack.additionalTools.join(', ')}`);
      }

      if (techInfo.length > 0) {
        parts.push(`## 技术栈\n${techInfo.map(t => `- ${t}`).join('\n')}`);
      }
    }

    // 2. API 契约（自然语言形式）
    if (this.blueprint?.apiContract) {
      const contract = this.blueprint.apiContract;
      const endpointList = contract.endpoints
        .map(ep => `  - ${ep.method} ${contract.apiPrefix}${ep.path}: ${ep.description}`)
        .join('\n');

      parts.push(`## API 契约（必须遵守）
API 前缀: ${contract.apiPrefix}
端点列表:
${endpointList}`);
    }

    // 3. 蓝图需求概要
    if (this.blueprint) {
      parts.push(`## 项目需求
${this.blueprint.description || this.blueprint.name || '见蓝图详情'}`);
    }

    // 4. 检查配置
    const enabledChecks: string[] = [];
    if (this.config.checks.apiPathConsistency) enabledChecks.push('API 路径一致性');
    if (this.config.checks.typeConsistency) enabledChecks.push('类型定义一致性');
    if (this.config.checks.envConfig) enabledChecks.push('环境配置');
    if (this.config.checks.build) enabledChecks.push('构建检查');
    if (this.config.checks.lint) enabledChecks.push('代码规范');
    if (this.config.checks.test) enabledChecks.push('测试检查');
    if (this.config.checks.security) enabledChecks.push('安全漏洞');

    if (enabledChecks.length > 0) {
      parts.push(`## 检查范围
${enabledChecks.join('、')}`);
    }

    return parts.join('\n\n');
  }

  /**
   * 构建 Agent 的 System Prompt
   */
  private buildSystemPrompt(context: string): string {
    return `你是**质量守卫 Agent**，负责全面检查项目质量并修复发现的问题。

${context}

## 你的工作方式

1. **全面检查**
   - 使用 Glob 和 Grep 搜索代码
   - 使用 Bash 运行构建、测试、lint 等命令
   - 关注前后端的一致性

2. **智能关联**
   - 理解问题之间的关联（如 API 错误可能导致测试失败）
   - 优先修复根本原因，而不是表面症状
   - 一次修复可能解决多个问题

3. **边检查边修复**
   - 发现问题后立即尝试修复
   - 使用 Edit 工具修改代码
   - 修复后重新验证

4. **最终报告**
   完成后输出 JSON 格式结果：
   \`\`\`json
   {
     "success": true/false,
     "checksPerformed": ["API一致性", "构建", "测试", ...],
     "fixed": [
       {"type": "api_path", "description": "修复了前端 API 路径前缀", "files": ["..."]}
     ],
     "remaining": [
       {"type": "...", "severity": "error|warning", "summary": "...", "description": "...", "reason": "为什么无法修复"}
     ],
     "summary": "一句话总结"
   }
   \`\`\`

## 修复原则
- 后端 API 路径是标准，前端应适配后端
- ${this.blueprint?.apiContract ? 'API 契约是最高标准，必须遵守' : '以实际后端实现为准'}
- 只修复明确的问题，不过度修改
- 需要业务判断的问题，标记为"需人工处理"
- 敏感信息（密钥、密码）绝不自动填写

## 效率要求
- 不要重复搜索同样的内容
- 批量修复同类问题
- 修复后统一验证，避免多次运行测试`;
  }

  /**
   * 构建任务 Prompt
   */
  private buildTaskPrompt(): string {
    return `请对项目进行全面质量检查：

1. 检查前后端 API 路径是否一致
2. 检查类型定义是否匹配
3. 检查环境配置是否正确
4. 运行构建，修复编译错误
5. 运行 Lint，修复代码规范问题
6. 运行测试，修复失败的测试
7. 检查依赖安全漏洞

对于发现的每个问题，请尝试修复。无法修复的问题，记录原因。

最后输出 JSON 格式的检查报告。`;
  }

  /**
   * 解析 Agent 返回的结果
   */
  private parseAgentResult(result: string | null): {
    success: boolean;
    issues: IntegrationIssue[];
    checksPerformed: number;
    summary: string;
  } {
    if (!result) {
      return {
        success: false,
        issues: [{
          id: uuidv4(),
          type: 'other',
          severity: 'error',
          summary: 'Agent 无响应',
          description: '质量守卫 Agent 未返回结果',
          affectedFiles: [],
          affectedSide: 'both',
          fixSuggestion: '重试或检查 Agent 配置',
        }],
        checksPerformed: 0,
        summary: 'Agent 无响应',
      };
    }

    try {
      // 提取 JSON
      const jsonMatch = result.match(/```json\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : result.match(/\{[\s\S]*\}/)?.[0];

      if (!jsonStr) {
        // 无法解析 JSON，但 Agent 可能已经完成了工作
        // 检查是否有成功关键词
        const hasSuccess = /(?:检查通过|验证通过|全部通过|无问题|no issues?)/i.test(result);
        return {
          success: hasSuccess,
          issues: [],
          checksPerformed: 1,
          summary: hasSuccess ? '✅ 质量检查通过' : '⚠️ 检查完成，请查看详情',
        };
      }

      const parsed = JSON.parse(jsonStr);
      const issues: IntegrationIssue[] = [];

      // 转换 remaining 为 IntegrationIssue
      if (parsed.remaining && Array.isArray(parsed.remaining)) {
        for (const item of parsed.remaining) {
          issues.push({
            id: uuidv4(),
            type: item.type || 'other',
            severity: item.severity || 'warning',
            summary: item.summary || item.description?.slice(0, 50) || '未知问题',
            description: item.description || item.reason || '',
            affectedFiles: item.files || [],
            affectedSide: 'both',
            fixSuggestion: item.reason || '需要人工检查',
          });
        }
      }

      // 记录修复统计
      if (parsed.fixed && parsed.fixed.length > 0) {
        console.log(`[IntegrationValidator] ✅ 自动修复了 ${parsed.fixed.length} 个问题`);
      }

      return {
        success: parsed.success ?? (issues.filter(i => i.severity === 'error').length === 0),
        issues,
        checksPerformed: parsed.checksPerformed?.length || 1,
        summary: parsed.summary || (parsed.success ? '✅ 质量检查通过' : `❌ 发现 ${issues.length} 个问题`),
      };

    } catch (e) {
      // JSON 解析失败
      return {
        success: false,
        issues: [{
          id: uuidv4(),
          type: 'other',
          severity: 'warning',
          summary: '结果解析失败',
          description: `Agent 返回的结果无法解析: ${result.slice(0, 200)}...`,
          affectedFiles: [],
          affectedSide: 'both',
          fixSuggestion: '查看 Agent 原始输出',
        }],
        checksPerformed: 1,
        summary: '⚠️ 结果解析失败，请查看详情',
      };
    }
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建集成验证器
 */
export function createIntegrationValidator(
  projectPath: string,
  config?: Partial<IntegrationValidationConfig>,
  techStack?: TechStack,
  blueprint?: Blueprint
): IntegrationValidator {
  return new IntegrationValidator(projectPath, config, techStack, blueprint);
}

export default IntegrationValidator;
