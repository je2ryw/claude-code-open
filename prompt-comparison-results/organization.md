# 组织相关提示词对比报告

## 概述

本报告对比了项目中组织相关的实现与官方 Claude Code 源码中的相关功能。

**对比日期**: 2025-12-30
**项目路径**: `/home/user/claude-code-open/src/organization/`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (v2.0.76)

---

## 主要发现

### 1. 功能范围差异

**项目实现**：完整的企业级组织管理系统
**官方实现**：轻量级的任务协作和审批流程

---

## 详细对比

### 一、项目中的组织功能

#### 1.1 核心数据结构

项目实现了完整的组织管理数据模型：

```typescript
// Organization 接口
interface Organization {
  id: string;
  name: string;
  uuid?: string;
  plan?: 'free' | 'pro' | 'enterprise';  // 订阅计划
  members?: TeamMember[];
  settings?: OrganizationSettings;
  createdAt?: number;
}

// 团队成员
interface TeamMember {
  id: string;
  email: string;
  name?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';  // 4种角色
  status: 'active' | 'pending' | 'suspended';
  joinedAt?: number;
}

// 组织设置
interface OrganizationSettings {
  allowedModels?: string[];        // 允许使用的模型
  maxTokensPerDay?: number;        // 每日Token上限
  maxCostPerDay?: number;          // 每日成本上限
  auditLogging?: boolean;          // 审计日志开关
  ssoEnabled?: boolean;            // SSO单点登录
  ipWhitelist?: string[];          // IP白名单
  defaultPermissionMode?: string;  // 默认权限模式
}
```

#### 1.2 核心功能模块

**环境变量支持**：
- `CLAUDE_ORG_ID` - 组织ID
- `CLAUDE_ORG_NAME` - 组织名称

**配置持久化**：
- 存储路径：`~/.claude/organization/org.json`
- 审计日志：`~/.claude/organization/audit.jsonl`
- 邮箱数据：`~/.claude/organization/mailbox.json`

**权限检查**：
```typescript
function checkOrganizationPermission(action: string): {
  allowed: boolean;
  reason?: string;
}
```
- 检查模型使用权限
- 基于组织策略限制

**审计日志**：
```typescript
function logAuditEvent(event: {
  action: string;
  userId?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
}): void
```
- 记录所有操作
- 支持查询和过滤

**团队邮箱系统**：
```typescript
class TeamManager {
  sendMessage(to: string, subject: string, content: string): TeamMessage | null
  getUnreadMessages(): TeamMessage[]
  markAsRead(messageId: string): boolean
  getAllMessages(): TeamMessage[]
}
```

### 二、官方源码中的相关功能

#### 2.1 任务协作系统

官方实现了基于任务的团队协作（位于 cli.js 830-836行）：

```
- TaskCreate: Create new tasks
- TaskGet: Retrieve task details by ID
- TaskUpdate: Update task status, add comments, or set dependencies
- TaskList: List all tasks

The new tools support team collaboration, task dependencies,
and persistent task storage across sessions.
```

**关键特性**：
- 任务创建和管理
- 任务依赖关系（blockedBy）
- 评论和进度更新
- 跨会话持久化

**协作提示**（cli.js 3090行）：
```
Add a comment with TaskUpdate when starting work,
to signal progress to the team
```

#### 2.2 计划审批流程

官方实现了计划模式的审批机制（cli.js 2367-2379行）：

**ExitPlanMode 工具说明**：
```
Use this tool when you are in plan mode and have finished writing
your plan to the plan file and are ready for user approval.

**What happens next:**
1. Wait for the team lead to review your plan
2. You will receive a message in your inbox with approval/rejection
3. If approved, you can proceed with implementation
4. If rejected, refine your plan based on the feedback

**Important:** Do NOT proceed until you receive approval.
Check your inbox for response.
```

**Plan Mode 特性**（cli.js 2438-2484行）：
- 需要用户批准才能进入计划模式
- 在计划模式中需要：
  1. 探索代码库
  2. 理解现有架构
  3. 设计实现方案
  4. 向用户展示计划以获得批准
  5. 使用 AskUserQuestion 澄清方法
  6. 使用 ExitPlanMode 提交计划供审批

#### 2.3 Guest Passes 功能

官方提到了 Guest Passes 功能（cli.js 2705-2707行）：

```
{id:"guest-passes",content:async(A)=>{
  let Q=sQ("claude",A.theme);
  return`┌──────────┐
      ) CC ${Q("✻")} ┊ (  You have free guest passes
```

这是一个用户激励或邀请机制的提示。

---

## 核心差异分析

### 1. 架构差异

| 维度 | 项目实现 | 官方实现 |
|------|---------|---------|
| **组织管理** | ✅ 完整的组织实体 | ❌ 无独立组织概念 |
| **成员管理** | ✅ 多角色成员系统 | ❌ 无成员管理 |
| **权限控制** | ✅ 基于角色和设置 | ⚠️ 基于用户批准 |
| **审计日志** | ✅ 完整审计系统 | ❌ 无审计日志 |
| **协作方式** | 📧 邮箱消息系统 | 📋 任务和计划系统 |

### 2. 功能对比

#### 项目独有功能

1. **企业级组织管理**
   - 组织创建、配置、删除
   - 订阅计划管理（free/pro/enterprise）
   - 组织设置持久化

2. **成员管理**
   - 多角色权限（owner/admin/member/viewer）
   - 成员状态管理（active/pending/suspended）
   - 成员邀请和加入

3. **安全与合规**
   - SSO 单点登录支持
   - IP 白名单控制
   - 完整的审计日志系统
   - 操作记录和查询

4. **资源限制**
   - 模型使用限制（allowedModels）
   - Token 使用配额（maxTokensPerDay）
   - 成本控制（maxCostPerDay）

5. **内部通信**
   - 团队邮箱系统
   - 消息发送和接收
   - 已读/未读状态管理

#### 官方独有功能

1. **任务管理系统**
   - 任务创建和分配
   - 任务依赖关系
   - 任务状态跟踪
   - 评论和进度更新

2. **计划审批流程**
   - Plan Mode 工作流
   - Team Lead 审批机制
   - Inbox 消息通知
   - 批准/拒绝反馈循环

3. **Guest Passes**
   - 用户邀请机制
   - 免费试用通行证

### 3. 设计理念差异

**项目实现**：
- 面向企业级用户
- 强调组织结构和层级
- 注重安全和合规
- 中心化的权限控制
- 类似传统企业管理系统

**官方实现**：
- 面向小团队协作
- 强调工作流和任务
- 基于审批的轻量级控制
- 去中心化的协作模式
- 类似现代敏捷开发流程

---

## 提示词和消息对比

### 项目中的提示词/消息

项目主要通过代码实现功能，**没有发现明显的提示词或用户消息**。

功能主要体现在：
- 接口定义（TypeScript 类型）
- 函数实现（权限检查、审计日志等）
- 存储管理（文件系统操作）

### 官方源码中的提示词/消息

官方实现包含丰富的提示词指导 AI 行为：

#### 1. Plan Mode 相关提示（cli.js 2343-2484行）

**EnterPlanMode 工具描述**：
```
Use this tool when you are in plan mode and have finished writing
your plan to the plan file and are ready for user approval.

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the
implementation steps of a task that requires writing code. For
research tasks where you're gathering information, searching files,
reading files or in general trying to understand the codebase -
do NOT use this tool.

## Examples

1. Initial task: "Search for and understand the implementation of
   vim mode in the codebase" - Do not use the exit plan mode tool
   because you are not planning the implementation steps of a task.

2. Initial task: "Help me implement yank mode for vim" - Use the
   exit plan mode tool after you have finished planning the
   implementation steps of the task.

3. Initial task: "Add a new feature to handle user authentication" -
   If unsure about auth method (OAuth, JWT, etc.), use AskUserQuestion
   first, then use exit plan mode tool after clarifying the approach.
```

**Plan Mode 工作流程**：
```
In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use AskUserQuestion if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement
```

**审批后的消息**：
```
User has approved your plan. You can now start coding.
Start with updating your todo list if applicable

Your plan has been saved to: ${planFile}
You can refer back to it if needed during implementation.
```

#### 2. 任务协作相关提示（cli.js 3067-3136行）

**TaskGet 工具说明**：
```
## When to Use This Tool

- When you need the full description and context before starting
  work on a task
- To check comments and progress history on a task
- To understand task dependencies (what it blocks, what blocks it)
- After being assigned a task, to get complete requirements
```

**TaskUpdate 提示**：
```
Mark resolved with a completion comment:
{"taskId": "3", "status": "resolved",
 "addComment": {"author": "your-agent-id-here",
                "content": "Implemented and tested"}}

Task completed. Call TaskList now to find your next available
task or see if your work unblocked others.
```

#### 3. 团队协作提示（cli.js 835行）

```
The new tools support team collaboration, task dependencies,
and persistent task storage across sessions.
```

---

## 代码量对比

| 项目 | 文件 | 代码行数 |
|------|------|---------|
| 项目实现 | `src/organization/index.ts` | 342 行 |
| 官方实现 | `cli.js`（组织相关部分） | ~200 行（估算，分散在任务系统中） |

---

## 集成方式对比

### 项目实现

**初始化**：
```typescript
import { initOrganization } from './organization';

// 在应用启动时
const org = initOrganization();
if (org) {
  console.log(`Organization: ${org.name}`);
}
```

**权限检查**：
```typescript
import { checkOrganizationPermission } from './organization';

const check = checkOrganizationPermission('use_model:opus');
if (!check.allowed) {
  console.error(check.reason);
  return;
}
```

**审计日志**：
```typescript
import { logAuditEvent } from './organization';

logAuditEvent({
  action: 'model_usage',
  userId: 'user-123',
  details: { model: 'opus', tokens: 1500 }
});
```

### 官方实现

通过工具系统集成，AI 直接调用工具：

```json
{
  "type": "tool_use",
  "name": "TaskCreate",
  "input": {
    "title": "Implement authentication",
    "description": "Add JWT-based auth"
  }
}
```

工具返回结果后，AI 继续对话。

---

## 使用场景对比

### 项目适用场景

1. **大型企业部署**
   - 需要中心化管理
   - 严格的权限控制
   - 审计和合规要求

2. **多租户SaaS**
   - 不同组织独立配置
   - 订阅计划差异化
   - 资源使用限制

3. **安全敏感环境**
   - IP 访问控制
   - SSO 集成
   - 完整审计追踪

### 官方适用场景

1. **小型开发团队**
   - 2-10人协作
   - 灵活的工作流
   - 快速迭代

2. **项目管理**
   - 任务跟踪
   - 依赖管理
   - 进度可视化

3. **代码审查流程**
   - 计划审批
   - 反馈循环
   - 质量控制

---

## 总结

### 核心差异

1. **定位不同**：
   - 项目：企业级组织管理平台
   - 官方：协作式开发助手

2. **实现方式不同**：
   - 项目：传统后端架构（数据模型 + API）
   - 官方：AI 工具驱动（自然语言 + 工具调用）

3. **复杂度不同**：
   - 项目：完整的企业功能集
   - 官方：精简的协作工具集

### 互补性

两者可以结合使用：
- 用项目的组织管理作为基础设施层
- 用官方的任务系统作为协作工具层
- 组织设置可以控制任务系统的权限和资源

### 建议

**如果是企业部署**：
- 优先使用项目的组织管理功能
- 考虑集成官方的任务协作工具
- 基于组织设置限制工具使用

**如果是小团队协作**：
- 直接使用官方的任务系统
- 如需扩展，可参考项目的设计
- 保持轻量级，避免过度设计

---

## 附录：关键代码位置

### 项目代码

- 组织接口定义：`/home/user/claude-code-open/src/organization/index.ts:10-53`
- 初始化函数：`/home/user/claude-code-open/src/organization/index.ts:65-93`
- 权限检查：`/home/user/claude-code-open/src/organization/index.ts:143-168`
- 审计日志：`/home/user/claude-code-open/src/organization/index.ts:173-246`
- 团队管理：`/home/user/claude-code-open/src/organization/index.ts:251-341`

### 官方代码

- 任务协作说明：`cli.js:830-836`
- Plan Mode 提示：`cli.js:2343-2484`
- 审批流程消息：`cli.js:2367-2379`
- TaskGet 说明：`cli.js:3067-3136`
- Guest Passes：`cli.js:2705-2707`

---

**报告生成时间**: 2025-12-30
**分析工具**: Claude Code
**对比方法**: 代码阅读 + 正则搜索
