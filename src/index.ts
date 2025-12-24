/**
 * Claude Code - 主入口
 * 导出所有模块
 */

// 核心模块
export * from './core/index.js';

// 工具系统
export * from './tools/index.js';

// 类型定义
export * from './types/index.js';

// 配置
export * from './config/index.js';

// Hooks 系统
export * from './hooks/index.js';

// 认证系统
export * from './auth/index.js';

// 会话管理
export * from './session/index.js';

// 上下文管理
export * from './context/index.js';

// 代码解析器
export * from './parser/index.js';

// Ripgrep 搜索
export * from './search/ripgrep.js';

// 遥测/分析
export * from './telemetry/index.js';

// 工具函数
export * from './utils/index.js';

// 插件系统
export * from './plugins/index.js';

// 流式 JSON I/O
export * from './streaming/index.js';

// 权限系统
export * from './permissions/index.js';

// IDE 集成
export * from './ide/index.js';

// Chrome 集成
export * from './chrome/index.js';

// 自动更新
export * from './updater/index.js';

// SVG/图像渲染
export * from './renderer/index.js';

// Memory 系统
export * from './memory/index.js';

// GitHub 集成
export * from './github/index.js';

// 云服务提供商 (Bedrock, Vertex, Foundry)
export * from './providers/index.js';

// 诊断系统
export * from './diagnostics/index.js';

// 文件检查点系统
export * from './checkpoint/index.js';

// 组织和团队管理
export * from './organization/index.js';

// 速率限制和重试系统
export * from './ratelimit/index.js';

// 通知系统
export * from './notifications/index.js';

// 代码签名系统
export * from './codesign/index.js';

// CLAUDE.md 和规则系统
export * from './rules/index.js';

// 版本信息
export const VERSION = '2.0.76-restored';
export const NAME = 'claude-code-restored';
