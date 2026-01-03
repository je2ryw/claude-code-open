# Claude Code 实现路线图 - 对齐官网 v2.0.76

**目标**: 精确对齐官网实现，并保持我们的创新功能
**预计总工时**: 8-10 小时
**优先级**: 高

---

## Phase 1: 错误消息和提示文本标准化 (1-2小时)

### 任务 1.1: 统一工具错误消息

**文件**: `src/tools/*.ts`

需要修改的错误消息格式：

```typescript
// ❌ 当前格式 (假设)
throw new Error(`Tool ${toolName} not found`);

// ✅ 官网格式
throw new Error(`Tool '${toolName}' not found`);
```

**关键错误消息列表**:

1. `Error: Tool '${toolName}' not found`
2. `Error: Cannot specify both allowed_domains and blocked_domains in the same request`
3. `Error: Missing Tool Result Block`
4. `Error: Invalid Model Name for Opus`
5. `Error: Snapshot file was not created at $SNAPSHOT_FILE`

**操作步骤**:
1. ✅ 搜索所有 `throw new Error` 语句
2. ✅ 与官网错误消息对比
3. ✅ 逐个修改为官网格式
4. ✅ 添加单元测试验证

**验收标准**:
- [ ] 所有工具错误消息与官网一致
- [ ] 错误消息测试覆盖率 > 80%

---

### 任务 1.2: 统一警告消息

**文件**: `src/core/*.ts`, `src/tools/*.ts`

官网警告消息:
```javascript
"Warning: Custom betas are only available for API key users"
"Bridge was already shutdown."
"Native image processor not available, falling back to sharp"
```

**操作步骤**:
1. ✅ 搜索所有 `console.warn` 语句
2. ✅ 对齐格式和文本
3. ✅ 确保警告级别正确

**验收标准**:
- [ ] 警告消息格式统一
- [ ] 警告消息文本与官网一致

---

## Phase 2: 环境变量和配置对齐 (1小时)

### 任务 2.1: 补充环境变量文档

**文件**: `README.md`, `CLAUDE.md`, `docs/environment-variables.md`

需要记录的环境变量 (官网确认):

```bash
# 核心认证
ANTHROPIC_API_KEY=<key>
CLAUDE_API_KEY=<key>           # 替代名称
ANTHROPIC_BASE_URL=<url>       # 自定义 API 端点

# Bash 工具
BASH_MAX_OUTPUT_LENGTH=30000   # 输出最大长度
BASH_MAX_TIMEOUT_MS=120000     # 超时时间 (毫秒)

# 系统配置
CLAUDE_DEBUG=*                 # 调试模式 (支持过滤)
USE_BUILTIN_RIPGREP=true       # 使用内置 ripgrep
CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000  # 最大输出 Token
CLAUDE_CODE_GIT_BASH_PATH=/path/to/bash  # Windows Git Bash 路径
CLAUDE_CODE_ENTRYPOINT=cli     # 入口点
```

我们独有的环境变量:
```bash
CLAUDE_SOLO_MODE=true          # 单独模式 (禁用后台进程)
CLAUDE_WEB_PORT=3000           # Web UI 端口
```

**操作步骤**:
1. ✅ 创建环境变量文档
2. ✅ 标记官网变量 vs 我们独有变量
3. ✅ 补充每个变量的说明和默认值
4. ✅ 添加示例配置

**验收标准**:
- [ ] 所有环境变量有完整文档
- [ ] 区分官网和自定义变量

---

### 任务 2.2: 验证配置文件路径

**文件**: `src/config/index.ts`

需要确认的路径:

```bash
✅ ~/.claude/                    # 主配置目录
✅ .claude/settings.json         # 设置文件
✅ .claude/plugins/              # 插件目录
✅ .claude/skills/               # 技能目录
✅ .claude/commands/             # 命令目录

⚠️ .claude/sessions/             # 会话目录 (需确认官网路径)
⚠️ .claude/hooks/                # 钩子目录 (可能不存在)
```

**操作步骤**:
1. ⚠️ 通过黑盒测试确认官网的 sessions 存储位置
2. ✅ 更新会话管理代码使用正确路径
3. ✅ 确保向后兼容

**验收标准**:
- [ ] Sessions 路径与官网一致
- [ ] 旧版本 sessions 能正常迁移

---

## Phase 3: 权限系统验证 (30分钟)

### 任务 3.1: 确认所有权限模式

**文件**: `src/types/index.ts`, `src/permissions/*.ts`

当前实现的权限模式:
```typescript
type PermissionMode =
  | 'acceptEdits'        // ✅ 官网确认
  | 'bypassPermissions'  // ✅ 官网确认
  | 'default'            // ⚠️ 需确认
  | 'delegate'           // ⚠️ 需确认
  | 'dontAsk'            // ⚠️ 需确认
  | 'plan';              // ⚠️ 需确认
```

**操作步骤**:
1. ⚠️ 黑盒测试官网的 `--permission-mode` 选项
2. ✅ 验证每个模式的行为
3. ✅ 移除不存在的模式
4. ✅ 补充缺失的模式

**验收标准**:
- [ ] 权限模式与官网完全一致
- [ ] 每个模式有清晰的行为定义

---

## Phase 4: 模型列表验证 (30分钟)

### 任务 4.1: 确认支持的模型

**文件**: `src/models/*.ts`, `src/cli.ts`

官网确认的模型:
```typescript
const models = [
  'claude-opus-4',           // ✅ 确认
  'claude-sonnet-4',         // ✅ 确认
  'claude-3-5-sonnet',       // ✅ 确认
  'claude-3-opus',           // ✅ 确认
  'claude-haiku-3-5',        // ⚠️ 未在官网找到
];
```

**操作步骤**:
1. ⚠️ 验证 haiku-3-5 是否真实存在
2. ✅ 补充模型别名映射
3. ✅ 更新模型文档

**验收标准**:
- [ ] 模型列表与官网一致
- [ ] 模型别名正确映射

---

## Phase 5: 兼容性测试 (4-6小时)

### 任务 5.1: 端到端测试套件

**文件**: `tests/e2e/*.test.ts`

需要测试的场景:

1. **工具调用测试**
   - [ ] 每个工具的基本功能
   - [ ] 工具错误处理
   - [ ] 工具输入验证

2. **权限系统测试**
   - [ ] 各种权限模式
   - [ ] 权限提示行为
   - [ ] 权限绕过场景

3. **会话管理测试**
   - [ ] 会话创建和恢复
   - [ ] 会话持久化
   - [ ] 会话清理

4. **MCP 协议测试**
   - [ ] MCP 服务器连接
   - [ ] 工具调用
   - [ ] 资源读取

5. **CLI 选项测试**
   - [ ] 所有命令行选项
   - [ ] 选项组合
   - [ ] 选项冲突检测

**操作步骤**:
1. ✅ 设计测试用例
2. ✅ 实现自动化测试
3. ✅ 与官网行为对比
4. ✅ 修复发现的差异

**验收标准**:
- [ ] E2E 测试覆盖率 > 70%
- [ ] 所有测试通过
- [ ] 与官网行为一致

---

### 任务 5.2: 黑盒对比测试

**工具**: 官网 Claude Code vs 我们的实现

测试方法:
1. 准备相同的输入
2. 分别运行官网和我们的版本
3. 对比输出和行为
4. 记录差异

**测试场景**:
- [ ] 简单文件读写
- [ ] Bash 命令执行
- [ ] 错误处理
- [ ] 权限提示
- [ ] MCP 工具调用
- [ ] 会话恢复

**验收标准**:
- [ ] 核心功能行为一致
- [ ] 错误消息格式一致
- [ ] 输出格式兼容

---

## Phase 6: 文档和示例 (1小时)

### 任务 6.1: 更新 README

**文件**: `README.md`

需要更新的内容:
- [ ] 功能特性列表
- [ ] 安装说明
- [ ] 配置指南
- [ ] 环境变量说明
- [ ] 权限模式说明
- [ ] MCP 集成指南

---

### 任务 6.2: 补充示例代码

**文件**: `examples/*.ts`

需要添加的示例:
- [ ] 基本使用
- [ ] MCP 服务器配置
- [ ] 插件开发
- [ ] 技能编写
- [ ] 权限配置

---

## 可选增强功能 (不影响对齐目标)

### 增强 1: 成本追踪 UI

**我们的创新功能**

**文件**: `src/ui/components/CostTracker.tsx`

功能:
- 实时显示 API 成本
- 预算警告
- 成本历史

**优先级**: 低
**工时**: 2-3小时

---

### 增强 2: Rewind 增强

**我们的创新功能**

**文件**: `src/rewind/*.ts`

功能:
- 文件历史可视化
- 快速回退到任意版本
- Diff 视图优化

**优先级**: 低
**工时**: 3-4小时

---

### 增强 3: Web UI 完善

**我们的创新功能**

**文件**: `src/web/**`

功能:
- 移动端适配
- 黑暗模式
- 会话分享
- 实时协作

**优先级**: 低
**工时**: 8-10小时

---

## 实施时间表

### Week 1: 核心对齐 (8-10小时)

**Day 1 (2-3小时)**:
- ✅ Phase 1.1: 错误消息标准化
- ✅ Phase 1.2: 警告消息统一

**Day 2 (1.5-2小时)**:
- ✅ Phase 2.1: 环境变量文档
- ✅ Phase 2.2: 配置路径验证
- ✅ Phase 3.1: 权限模式确认

**Day 3 (1小时)**:
- ✅ Phase 4.1: 模型列表验证
- ✅ Phase 6.1: README 更新

**Day 4-5 (4-6小时)**:
- ✅ Phase 5.1: E2E 测试套件
- ✅ Phase 5.2: 黑盒对比测试

---

### Week 2-3: 可选增强 (可选)

根据时间和优先级决定是否实施增强功能。

---

## 风险和缓解措施

### 风险 1: 官网行为无法完全确定

**原因**: 官网代码混淆，无法查看源码

**缓解措施**:
- 通过黑盒测试验证行为
- 参考官方文档和 API 定义
- 社区反馈和用户报告

### 风险 2: 功能对齐可能破坏现有功能

**缓解措施**:
- 完整的测试覆盖
- 向后兼容性检查
- 渐进式部署

### 风险 3: 时间估算不准确

**缓解措施**:
- 分阶段实施
- 优先级明确
- 可以分批发布

---

## 成功指标

### 必达指标 (Phase 1-4)

- [x] 所有工具实现与官网一致
- [ ] 错误消息格式完全对齐
- [ ] 环境变量完整文档
- [ ] 权限模式准确无误
- [ ] 配置文件路径正确

### 期望指标 (Phase 5)

- [ ] E2E 测试覆盖率 > 70%
- [ ] 黑盒测试全部通过
- [ ] 无已知兼容性问题

### 加分指标 (Phase 6 + 可选增强)

- [ ] 完整的使用文档
- [ ] 丰富的示例代码
- [ ] 创新功能稳定可用

---

## 实施检查清单

### 开始前

- [ ] 备份当前代码
- [ ] 创建专用分支 `feat/align-official-v2.0.76`
- [ ] 设置测试环境
- [ ] 准备官网 Claude Code 用于对比

### 实施中

- [ ] 每个 Phase 完成后提交
- [ ] 编写详细的提交消息
- [ ] 更新 CHANGELOG
- [ ] 记录发现的差异

### 完成后

- [ ] 完整的回归测试
- [ ] 更新所有文档
- [ ] 准备发布说明
- [ ] 代码审查

---

## 联系和反馈

**问题反馈**: 在实施过程中发现的问题应记录在 `.claude/ISSUES.md`
**进度跟踪**: 使用 TodoWrite 工具追踪任务进度
**文档更新**: 及时更新 CLAUDE.md 和 README.md

---

**文档版本**: v1.0
**创建时间**: 2026-01-03
**预计完成**: 2026-01-10 (7天)
**Ralph Loop**: Iteration 1/500

---

**下一步**: 开始 Phase 1.1 - 错误消息标准化
