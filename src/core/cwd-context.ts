/**
 * 工作目录上下文
 *
 * 使用 AsyncLocalStorage 在异步调用链中传递工作目录
 * 解决多 Worker 并发时共享 process.cwd() 的竞态条件问题
 *
 * 使用方法：
 * 1. 在 ConversationLoop 中：runWithCwd(workingDir, async () => { ... })
 * 2. 在工具中：getCurrentCwd() 获取当前工作目录
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * 工作目录上下文存储
 */
const cwdStorage = new AsyncLocalStorage<string>();

/**
 * 在指定工作目录上下文中执行函数
 * @param cwd 工作目录
 * @param fn 要执行的函数
 * @returns 函数执行结果
 */
export function runWithCwd<T>(cwd: string, fn: () => T): T {
  return cwdStorage.run(cwd, fn);
}

/**
 * 获取当前工作目录
 * 优先从 AsyncLocalStorage 获取，如果不存在则回退到 process.cwd()
 * @returns 当前工作目录
 */
export function getCurrentCwd(): string {
  return cwdStorage.getStore() || process.cwd();
}

/**
 * 检查是否在工作目录上下文中
 * @returns 是否在上下文中
 */
export function isInCwdContext(): boolean {
  return cwdStorage.getStore() !== undefined;
}
