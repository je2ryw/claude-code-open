/**
 * 环境变量检查辅助函数
 * 参考官网源码实现
 */

/**
 * 检查环境变量是否为真值
 * 支持多种格式: "1", "true", "yes", "on" (不区分大小写)
 *
 * 官网源码实现:
 * function i1(A){
 *   if(!A)return!1;
 *   if(typeof A==="boolean")return A;
 *   let Q=A.toLowerCase().trim();
 *   return["1","true","yes","on"].includes(Q)
 * }
 */
export function isTruthy(value: string | boolean | undefined): boolean {
  if (!value) return false;
  if (typeof value === 'boolean') return value;
  const normalized = value.toLowerCase().trim();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

/**
 * 检查后台任务是否被禁用
 */
export function isBackgroundTasksDisabled(): boolean {
  return isTruthy(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS);
}

/**
 * 检查是否启用内置 ripgrep
 */
export function useBuiltinRipgrep(): boolean {
  return isTruthy(process.env.USE_BUILTIN_RIPGREP);
}

/**
 * 检查是否启用沙箱模式
 */
export function isSandboxEnabled(): boolean {
  return isTruthy(process.env.CLAUDE_CODE_SANDBOX);
}

// ============ 自动更新相关 ============

/**
 * 获取主自动更新器被禁用的原因
 * 官网源码实现:
 * function _JA(){
 *   if(i1(process.env.DISABLE_AUTOUPDATER))return"DISABLE_AUTOUPDATER set";
 *   if(process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)return"CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC set";
 *   let A=R1();
 *   if(A.autoUpdates===!1&&(A.installMethod!=="native"||A.autoUpdatesProtectedForNative!==!0))return"config";
 *   return null
 * }
 */
export function getAutoUpdaterDisabledReason(): string | null {
  // 检查 DISABLE_AUTOUPDATER 环境变量
  if (isTruthy(process.env.DISABLE_AUTOUPDATER)) {
    return 'DISABLE_AUTOUPDATER set';
  }

  // 检查 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 环境变量
  if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
    return 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC set';
  }

  // 注意：这里简化了配置检查，完整实现需要访问配置管理器
  // 官方还会检查 config.autoUpdates === false 的情况
  // 但为了避免循环依赖，这里只检查环境变量

  return null;
}

/**
 * 检查主自动更新器是否被禁用
 * 官网源码实现:
 * function Ku(){return _JA()!==null}
 */
export function isAutoUpdaterDisabled(): boolean {
  return getAutoUpdaterDisabledReason() !== null;
}

/**
 * 检查是否应该跳过插件自动更新
 * 官网源码实现:
 * function BOA(){return Ku()&&!i1(process.env.FORCE_AUTOUPDATE_PLUGINS)}
 *
 * 逻辑：
 * - 如果主更新器被禁用 且 FORCE_AUTOUPDATE_PLUGINS 未启用 → 返回 true（跳过插件更新）
 * - 如果主更新器未被禁用 → 返回 false（不跳过插件更新）
 * - 如果主更新器被禁用 但 FORCE_AUTOUPDATE_PLUGINS 启用 → 返回 false（不跳过插件更新）
 */
export function shouldSkipPluginAutoUpdate(): boolean {
  return isAutoUpdaterDisabled() && !isTruthy(process.env.FORCE_AUTOUPDATE_PLUGINS);
}

/**
 * 检查是否强制启用插件自动更新
 * 当主更新器禁用时，如果 FORCE_AUTOUPDATE_PLUGINS 环境变量为真，则强制启用插件自动更新
 */
export function isForcePluginAutoUpdateEnabled(): boolean {
  return isTruthy(process.env.FORCE_AUTOUPDATE_PLUGINS);
}

// ============ Demo 模式相关 ============

/**
 * 检查是否处于 Demo 模式
 *
 * 官方 2.1.0 新增功能：
 * "Added IS_DEMO environment variable to hide email and organization from the UI,
 * useful for streaming or recording sessions"
 *
 * 官网源码实现:
 * process.env.IS_DEMO 用于以下场景:
 * 1. 隐藏组织名称: !process.env.IS_DEMO && D.oauthAccount?.organizationName
 * 2. 隐藏邮箱和组织统计: if(A.organization&&!process.env.IS_DEMO)...if(A.email&&!process.env.IS_DEMO)
 * 3. 禁用项目引导: if(GOB()||JG().projectOnboardingSeenCount>=4||process.env.IS_DEMO)return!1
 */
export function isDemoMode(): boolean {
  return isTruthy(process.env.IS_DEMO);
}
