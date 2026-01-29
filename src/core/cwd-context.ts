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

/**
 * 包装 AsyncGenerator，确保在每次迭代时都在正确的工作目录上下文中
 *
 * 解决问题：AsyncLocalStorage.run() 不能跨 generator 边界传播上下文
 * 当使用 yield* 委托给另一个 generator 时，迭代发生在 run() 上下文之外
 *
 * @param cwd 工作目录
 * @param generator 要包装的 AsyncGenerator
 * @returns 包装后的 AsyncGenerator，每次迭代都在正确的上下文中
 */
export async function* runGeneratorWithCwd<T>(
  cwd: string,
  generator: AsyncGenerator<T, void, undefined>
): AsyncGenerator<T, void, undefined> {
  try {
    while (true) {
      // 在正确的上下文中执行 next()
      const result = await cwdStorage.run(cwd, () => generator.next());

      if (result.done) {
        return;
      }

      // TypeScript 无法正确推断 result.done === false 时 result.value 的类型
      yield result.value as T;
    }
  } finally {
    // 确保 generator 被正确关闭
    await generator.return?.(undefined);
  }
}
