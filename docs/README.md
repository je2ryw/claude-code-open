# Claude Code 开源项目文档

欢迎来到 Claude Code 开源项目文档中心！本文档系统提供完整的项目架构、API 参考、开发指南和最佳实践。

## 📚 文档导航

### 快速开始
- [安装指南](./getting-started/installation.md) - 项目安装和环境配置
- [快速入门](./getting-started/quickstart.md) - 5分钟上手教程
- [基础概念](./getting-started/concepts.md) - 核心概念解释

### 架构设计
- [系统架构](./architecture/overview.md) - 整体架构设计
- [三层架构](./architecture/three-layer.md) - 入口层、核心引擎层、工具层
- [数据流](./architecture/data-flow.md) - 数据流转和状态管理
- [插件系统](./architecture/plugin-system.md) - 插件架构和扩展机制

### 核心模块
- [工具系统](./core/tools.md) - 25+ 工具实现详解
- [会话管理](./core/session.md) - 会话持久化和恢复
- [对话循环](./core/conversation-loop.md) - 对话编排引擎
- [上下文管理](./core/context.md) - Token 预估和自动压缩
- [客户端](./core/client.md) - Anthropic API 封装

### 工具参考
- [文件操作](./tools/file-operations.md) - Read/Write/Edit/MultiEdit
- [搜索工具](./tools/search.md) - Glob/Grep
- [执行工具](./tools/execution.md) - Bash/TaskOutput/KillShell
- [Web 工具](./tools/web.md) - WebFetch/WebSearch
- [任务管理](./tools/task-management.md) - TodoWrite/Task
- [代码工具](./tools/code.md) - NotebookEdit/LSP
- [集成工具](./tools/integration.md) - MCP/Skill/Tmux

### UI 系统
- [React/Ink 框架](./ui/framework.md) - 终端 UI 组件系统
- [组件库](./ui/components.md) - 可复用组件详解
- [Web UI](./ui/web-interface.md) - Web 界面开发

### 子系统
- [认证系统](./subsystems/auth.md) - OAuth 和 API Key
- [权限系统](./subsystems/permissions.md) - 权限模式和请求流程
- [Hook 系统](./subsystems/hooks.md) - 事件钩子机制
- [MCP 协议](./subsystems/mcp.md) - Model Context Protocol
- [技能系统](./subsystems/skills.md) - 技能加载和注册
- [遥测系统](./subsystems/telemetry.md) - 本地分析统计
- [沙箱系统](./subsystems/sandbox.md) - Bubblewrap 隔离

### Blueprint 系统
- [Blueprint 概述](./blueprint/overview.md) - 智能项目规划系统
- [需求分析](./blueprint/requirement-analysis.md) - AI 驱动需求对话
- [代码库分析](./blueprint/codebase-analysis.md) - 自动代码结构分析
- [任务树管理](./blueprint/task-tree.md) - 层级任务分解
- [Worker 执行](./blueprint/worker-execution.md) - 并行任务执行
- [边界检查](./blueprint/boundary-checking.md) - 范围控制机制

### 开发指南
- [开发环境](./development/environment.md) - 开发工具和配置
- [代码规范](./development/coding-standards.md) - TypeScript 最佳实践
- [测试指南](./development/testing.md) - 单元测试、集成测试、E2E 测试
- [调试技巧](./development/debugging.md) - 常见问题调试
- [贡献指南](./development/contributing.md) - 如何贡献代码

### API 参考
- [核心 API](./api/core.md) - 核心模块 API
- [工具 API](./api/tools.md) - 工具接口定义
- [类型定义](./api/types.md) - TypeScript 类型系统
- [配置 API](./api/configuration.md) - 配置选项详解

### 最佳实践
- [逆向工程方法](./best-practices/reverse-engineering.md) - 如何分析混淆代码
- [性能优化](./best-practices/performance.md) - 性能调优技巧
- [安全实践](./best-practices/security.md) - 安全最佳实践
- [错误处理](./best-practices/error-handling.md) - 错误处理策略

### 部署运维
- [生产部署](./deployment/production.md) - 生产环境部署
- [Docker 部署](./deployment/docker.md) - 容器化部署
- [监控告警](./deployment/monitoring.md) - 系统监控方案
- [故障排查](./deployment/troubleshooting.md) - 常见问题解决

### 迁移指南
- [从 v2.1.4 迁移](./migration/from-2.1.4.md) - 版本升级指南
- [配置迁移](./migration/config.md) - 配置文件迁移

### 附录
- [术语表](./appendix/glossary.md) - 专业术语解释
- [FAQ](./appendix/faq.md) - 常见问题解答
- [更新日志](./appendix/changelog.md) - 详细变更记录
- [路线图](./appendix/roadmap.md) - 未来规划

## 🎯 文档特色

### 中文优先
所有文档均以中文撰写,面向中文开发者,确保技术细节准确传达。

### 代码示例丰富
每个模块都配有完整的代码示例,可直接复制使用。

### 架构图清晰
使用 Mermaid 图表展示系统架构和数据流,一目了然。

### 持续更新
文档随代码更新同步维护,确保信息准确性。

## 🚀 快速链接

- [GitHub 仓库](https://github.com/kill136/claude-code)
- [在线演示](https://claude-code-open.vercel.app)
- [问题反馈](https://github.com/kill136/claude-code/issues)
- [Discord 社区](https://discord.gg/bNyJKk6PVZ)

## 📝 文档贡献

发现文档问题或想要改进?欢迎提交 PR 到 `docs/` 目录!

## 📖 阅读建议

**初学者路径:**
1. 快速开始 → 基础概念
2. 系统架构 → 核心模块
3. 工具参考 → 实战练习

**进阶开发者路径:**
1. 架构设计 → 子系统详解
2. API 参考 → 最佳实践
3. 开发指南 → 贡献代码

**逆向工程学习路径:**
1. 逆向工程方法 → 代码分析技巧
2. 核心模块源码 → 工具实现细节
3. 调试技巧 → 实战案例

---

**文档版本:** v2.1.14  
**最后更新:** 2026-01-24  
**维护者:** Claude Code 开源社区
