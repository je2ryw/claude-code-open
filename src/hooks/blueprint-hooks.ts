/**
 * 蓝图相关 Hooks
 *
 * 集成蓝图系统的三层防护到 Hooks 系统：
 * 1. PreToolUse - 边界检查（约束层）
 * 2. PostToolUse - 自动测试（验证层）
 *
 * 这些 hooks 在蓝图活跃时自动生效。
 */

import { blueprintContext } from '../blueprint/blueprint-context.js';
import { acceptanceTestRunner } from '../blueprint/acceptance-test-runner.js';

// ============================================================================
// PreToolUse Hook：边界检查
// ============================================================================

/**
 * PreToolUse 边界检查
 *
 * 在文件修改工具执行前检查是否违反蓝图边界。
 * 此检查是在工具层面（Edit/Write）已有边界检查的补充。
 *
 * @param toolName 工具名称
 * @param toolInput 工具输入
 * @returns 是否允许执行
 */
export async function preToolUseBoundaryCheck(
  toolName: string,
  toolInput: Record<string, any>
): Promise<{ allowed: boolean; message?: string }> {
  // 只检查文件修改类工具
  const fileModifyTools = ['Edit', 'Write', 'MultiEdit'];
  if (!fileModifyTools.includes(toolName)) {
    return { allowed: true };
  }

  // 检查是否有活跃蓝图
  const blueprint = blueprintContext.getBlueprint();
  if (!blueprint) {
    return { allowed: true }; // 没有蓝图，不进行检查
  }

  // 获取文件路径
  const filePath = toolInput.file_path || toolInput.filePath;
  if (!filePath) {
    return { allowed: true };
  }

  // 执行边界检查
  const result = blueprintContext.checkFileOperation(filePath, 'write');

  if (!result.allowed) {
    return {
      allowed: false,
      message: `🚫 蓝图边界检查失败：${result.reason}\n\n如需修改，请先更新蓝图。`,
    };
  }

  // 如果有警告，输出到控制台
  if (result.warnings && result.warnings.length > 0) {
    console.warn(`⚠️ 边界警告: ${result.warnings.join(', ')}`);
  }

  return { allowed: true };
}

// ============================================================================
// PostToolUse Hook：自动测试
// ============================================================================

/**
 * PostToolUse 自动测试
 *
 * 在文件修改成功后自动运行相关的验收测试。
 * 异步执行，不阻塞对话。
 *
 * @param toolName 工具名称
 * @param toolInput 工具输入
 * @param toolResult 工具执行结果
 */
export async function postToolUseTestRunner(
  toolName: string,
  toolInput: Record<string, any>,
  toolResult: any
): Promise<void> {
  // 只在文件修改成功后运行测试
  const fileModifyTools = ['Edit', 'Write', 'MultiEdit'];
  if (!fileModifyTools.includes(toolName)) return;

  // 检查工具是否执行成功
  if (toolResult?.is_error || toolResult?.success === false) return;

  // 检查是否有活跃蓝图
  const blueprint = blueprintContext.getBlueprint();
  if (!blueprint) return;

  // 获取文件路径
  const filePath = toolInput.file_path || toolInput.filePath;
  if (!filePath) return;

  // 异步运行测试，不阻塞对话
  setImmediate(async () => {
    try {
      const results = await acceptanceTestRunner.runTestsForFile(filePath);

      if (results.length > 0) {
        const failed = results.filter(r => !r.passed);
        const passed = results.filter(r => r.passed);

        if (failed.length > 0) {
          // 发送测试失败通知
          console.error(`\n⚠️ ${failed.length} 个验收测试失败:`);
          for (const f of failed) {
            console.error(`  - ${f.testName}`);
          }
          console.error('请检查并修复失败的测试。\n');
        } else if (passed.length > 0) {
          console.log(`\n✅ ${passed.length} 个验收测试全部通过\n`);
        }
      }
    } catch (err) {
      console.error('验收测试运行出错:', err);
    }
  });
}

// ============================================================================
// 注册 Hooks
// ============================================================================

/**
 * 注册蓝图相关的 hooks
 *
 * 调用此函数将蓝图边界检查和自动测试集成到 hooks 系统。
 */
export function registerBlueprintHooks(): void {
  // 动态导入避免循环依赖
  import('./index.js').then(({ registerHook }) => {
    // 注册 PreToolUse 边界检查
    registerHook('PreToolUse', {
      type: 'command',
      command: '__blueprint_boundary_check__', // 内部标识，不会实际执行
      matcher: '/^(Edit|Write|MultiEdit)$/',
    });

    // 注册 PostToolUse 自动测试
    registerHook('PostToolUse', {
      type: 'command',
      command: '__blueprint_test_runner__', // 内部标识，不会实际执行
      matcher: '/^(Edit|Write|MultiEdit)$/',
    });

    console.log('[BlueprintHooks] 蓝图 hooks 已注册');
  }).catch(() => {
    // hooks 模块加载失败，忽略
  });
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 检查是否应该运行蓝图 hooks
 */
export function shouldRunBlueprintHooks(): boolean {
  return blueprintContext.getBlueprint() !== null;
}

/**
 * 获取蓝图边界检查状态
 */
export function getBoundaryCheckStatus(): {
  enabled: boolean;
  blueprintId?: string;
  activeTaskCount: number;
} {
  const status = blueprintContext.getStatus();
  return {
    enabled: status.hasBlueprint && status.boundaryCheckEnabled,
    blueprintId: status.blueprintId,
    activeTaskCount: status.activeTaskCount,
  };
}
