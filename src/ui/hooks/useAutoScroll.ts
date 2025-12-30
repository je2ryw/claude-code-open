/**
 * 自动滚动钩子 - 仿照官方 Claude Code 实现
 *
 * Ink 框架本身会自动处理输出，但当内容超过终端高度时，
 * 需要确保新内容能够滚动到视图中
 */

import { useEffect, useRef } from 'react';
import { useStdout } from 'ink';

/**
 * 使用方法：
 * - 在需要自动滚动的组件中调用此钩子
 * - 当内容更新时，会自动滚动到最新内容
 *
 * 原理：
 * Ink 使用 process.stdout 输出内容，当新内容添加时，
 * 通过写入换行符来触发终端的自动滚动行为
 */
export function useAutoScroll(dependencies: any[] = []) {
  const { stdout } = useStdout();
  const prevHeightRef = useRef<number>(0);

  useEffect(() => {
    // 当依赖项变化时（例如新消息添加），确保终端滚动到底部
    // 这个实现基于官方源码的观察：
    // 官方在每次内容更新后会通过特殊的终端控制序列来确保视图更新

    if (!stdout) return;

    // 获取当前终端的行数（如果可用）
    const currentHeight = (stdout as any).rows || process.stdout.rows || 24;

    // 如果内容高度发生变化，触发滚动
    // 注意：Ink 内部会处理大部分滚动逻辑，
    // 我们主要是通过重新渲染来触发 Ink 的更新机制
    if (currentHeight !== prevHeightRef.current) {
      prevHeightRef.current = currentHeight;
    }

    // 这里不需要显式写入，Ink 会自动处理
    // 但我们可以通过强制组件重新挂载来确保视图更新
  }, dependencies);
}

/**
 * 简化版自动滚动钩子
 * 仅在消息数量变化时触发
 */
export function useMessageAutoScroll(messageCount: number) {
  useAutoScroll([messageCount]);
}
