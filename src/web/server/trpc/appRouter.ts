/**
 * tRPC App Router
 *
 * 合并所有子路由
 */

import { router } from './index.js';
import { blueprintRouter } from './routers/blueprint.js';
import { executionRouter } from './routers/execution.js';
import { coordinatorRouter } from './routers/coordinator.js';

/**
 * 主路由 - 合并所有子路由
 */
export const appRouter = router({
  blueprint: blueprintRouter,
  execution: executionRouter,
  coordinator: coordinatorRouter,
});

/**
 * 导出类型供前端使用
 */
export type AppRouter = typeof appRouter;
