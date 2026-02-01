/**
 * tRPC 基础设施
 *
 * 端到端类型安全的 API 层
 * 替代手工封装的 1200+ 行 fetch 代码
 */

import { initTRPC } from '@trpc/server';
import { z } from 'zod';

/**
 * tRPC Context
 * 可以在这里添加数据库连接、用户认证等
 */
export interface Context {
  // 可扩展的上下文
}

export const createContext = (): Context => {
  return {};
};

/**
 * tRPC 初始化
 */
const t = initTRPC.context<Context>().create();

/**
 * 导出 router 和 procedure 构建器
 */
export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

/**
 * 合并 routers
 */
export const mergeRouters = t.mergeRouters;
