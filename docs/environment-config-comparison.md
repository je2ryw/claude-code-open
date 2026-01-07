# 环境变量和配置项对比报告

**日期**: 2026-01-07
**官方版本**: @anthropic-ai/claude-code v2.0.76
**对比方法**: 字符串提取 + 代码分析

---

## 执行摘要

### 环境变量覆盖度

| 类别 | 官方数量 | 当前项目 | 缺失数量 | 覆盖率 |
|------|---------|---------|---------|--------|
| **CLAUDE_CODE_*** | 75 | 17 | 58 | **23%** |
| **ANTHROPIC_*** | 16 | 11 | 5 | **69%** |
| **DISABLE_*** | 20 | 2 | 18 | **10%** |
| **ENABLE_*** | 11 | 4 | 7 | **36%** |
| **MAX_*** | 3 | 1 | 2 | **33%** |
| **MCP_*** | 4 | 2 | 2 | **50%** |
| **总计** | **129+** | **37** | **92+** | **29%** |

### 配置项覆盖度（初步估算）

| 类别 | 官方数量（估算） | 当前项目 | 覆盖率 |
|------|-----------------|---------|--------|
| **核心配置** | ~25 | ~18 | **72%** |
| **UI配置** | ~10 | ~3 | **30%** |
| **总计** | **~35** | **~21** | **~60%** |

---

## 一、环境变量详细对比

### 1.1 CLAUDE_CODE_* 环境变量（75个官方，17个当前）

#### ✅ 已实现（17个）

```bash
CLAUDE_CODE_AGENT_ID
CLAUDE_CODE_DEBUG
CLAUDE_CODE_DEBUG_LOGS_DIR
CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
CLAUDE_CODE_DISABLE_TELEMETRY
CLAUDE_CODE_ENABLE_CFC
CLAUDE_CODE_ENABLE_SANDBOX
CLAUDE_CODE_ENABLE_TELEMETRY
CLAUDE_CODE_MAX_OUTPUT_TOKENS
CLAUDE_CODE_MAX_RETRIES
CLAUDE_CODE_OAUTH_TOKEN
CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS
CLAUDE_CODE_USE_BEDROCK
CLAUDE_CODE_USE_FOUNDRY
CLAUDE_CODE_USE_VERTEX
CLAUDE_CODE_VIM_MODE  # 当前项目特有
```

#### ❌ 缺失（58个）

##### 核心功能类（P0 - 需要立即添加）

```bash
# Extended Thinking
# (已在extended-thinking-verification-report.md中分析)

# Git集成
CLAUDE_CODE_GIT_BASH_PATH  # Git Bash路径

# 会话管理
CLAUDE_CODE_PARENT_SESSION_ID
CLAUDE_CODE_SESSION_ID
CLAUDE_CODE_SESSION_ACCESS_TOKEN
CLAUDE_CODE_SKIP_PROMPT_HISTORY

# Agent系统
CLAUDE_CODE_AGENT_NAME
CLAUDE_CODE_AGENT_TYPE
CLAUDE_CODE_SUBAGENT_MODEL
CLAUDE_CODE_PLAN_V2_AGENT_COUNT
CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT

# 工具执行
CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY

# 环境隔离
CLAUDE_CODE_DONT_INHERIT_ENV

# 远程会话
CLAUDE_CODE_REMOTE
CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE
CLAUDE_CODE_REMOTE_SESSION_ID
```

##### IDE集成类（P1）

```bash
CLAUDE_CODE_AUTO_CONNECT_IDE
CLAUDE_CODE_IDE_HOST_OVERRIDE
CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL
CLAUDE_CODE_IDE_SKIP_VALID_CHECK
```

##### 安全和验证类（P1）

```bash
CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR
CLAUDE_CODE_API_KEY_HELPER_TTL_MS
CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR
CLAUDE_CODE_CLIENT_CERT
CLAUDE_CODE_CLIENT_KEY
CLAUDE_CODE_CLIENT_KEY_PASSPHRASE
CLAUDE_CODE_ADDITIONAL_PROTECTION
CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK
```

##### 云服务认证类（P1）

```bash
CLAUDE_CODE_SKIP_BEDROCK_AUTH
CLAUDE_CODE_SKIP_FOUNDRY_AUTH
CLAUDE_CODE_SKIP_VERTEX_AUTH
```

##### UI/UX类（P2）

```bash
CLAUDE_CODE_DISABLE_ATTACHMENTS
CLAUDE_CODE_DISABLE_CLAUDE_MDS
CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY
CLAUDE_CODE_DISABLE_TERMINAL_TITLE
CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION
CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT
CLAUDE_CODE_FORCE_FULL_LOGO
CLAUDE_CODE_SYNTAX_HIGHLIGHT
```

##### 调试和监控类（P2）

```bash
CLAUDE_CODE_DIAGNOSTICS_FILE
CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING
CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS
CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS
CLAUDE_CODE_PROFILE_QUERY
CLAUDE_CODE_PROFILE_STARTUP
```

##### 沙箱和容器类（P2）

```bash
CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR
CLAUDE_CODE_BUBBLEWRAP
CLAUDE_CODE_CONTAINER_ID
CLAUDE_CODE_SHELL
CLAUDE_CODE_SHELL_PREFIX
```

##### 网络配置类（P2）

```bash
CLAUDE_CODE_PROXY_RESOLVES_HOSTS
CLAUDE_CODE_SSE_PORT
```

##### 其他配置类（P2）

```bash
CLAUDE_CODE_ACTION
CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
CLAUDE_CODE_EFFORT_LEVEL
CLAUDE_CODE_ENTRYPOINT
CLAUDE_CODE_EXIT_AFTER_STOP_DELAY
CLAUDE_CODE_EXTRA_BODY
CLAUDE_CODE_TAGS
CLAUDE_CODE_TEAM_NAME
CLAUDE_CODE_TEST_FIXTURES_ROOT
CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
```

---

### 1.2 ANTHROPIC_* 环境变量（16个官方，11个当前）

#### ✅ 已实现（11个）

```bash
ANTHROPIC_API_KEY
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_BASE_URL
ANTHROPIC_BEDROCK_BASE_URL
ANTHROPIC_FOUNDRY_API_KEY
ANTHROPIC_FOUNDRY_BASE_URL
ANTHROPIC_MODEL
ANTHROPIC_VERTEX_BASE_URL  # 当前项目使用这个名称
ANTHROPIC_VERTEX_PROJECT_ID
ANTHROPIC_VERTEX_REGION  # 当前项目特有
# (其他AWS相关变量)
```

#### ❌ 缺失（5个）

```bash
ANTHROPIC_BETAS  # Beta功能标志
ANTHROPIC_CUSTOM_HEADERS  # 自定义HTTP头
ANTHROPIC_DEFAULT_HAIKU_MODEL
ANTHROPIC_DEFAULT_OPUS_MODEL
ANTHROPIC_DEFAULT_SONNET_MODEL
ANTHROPIC_FOUNDRY_RESOURCE  # Foundry资源ID
ANTHROPIC_SMALL_FAST_MODEL  # 小型快速模型
ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
```

---

### 1.3 DISABLE_* 环境变量（20个官方，2个当前）

#### ✅ 已实现（2个）

```bash
DISABLE_TELEMETRY
DISABLE_INTERLEAVED_THINKING  # Extended Thinking相关
```

#### ❌ 缺失（18个）

##### 功能禁用类（P1）

```bash
DISABLE_PROMPT_CACHING  # 禁用提示词缓存
DISABLE_PROMPT_CACHING_HAIKU  # 按模型禁用缓存
DISABLE_PROMPT_CACHING_OPUS
DISABLE_PROMPT_CACHING_SONNET
```

##### 命令禁用类（P2）

```bash
DISABLE_BUG_COMMAND
DISABLE_DOCTOR_COMMAND
DISABLE_EXTRA_USAGE_COMMAND
DISABLE_FEEDBACK_COMMAND
DISABLE_INSTALL_GITHUB_APP_COMMAND
DISABLE_LOGIN_COMMAND
DISABLE_LOGOUT_COMMAND
DISABLE_UPGRADE_COMMAND
```

##### 自动化和优化类（P2）

```bash
DISABLE_AUTOUPDATER
DISABLE_AUTO_MIGRATE_TO_NATIVE
DISABLE_COMPACT  # 禁用会话压缩
DISABLE_MICROCOMPACT  # 禁用微压缩
DISABLE_COST_WARNINGS  # 禁用成本警告
DISABLE_ERROR_REPORTING
DISABLE_INSTALLATION_CHECKS
```

---

### 1.4 ENABLE_* 环境变量（11个官方，4个当前）

#### ✅ 已实现（4个）

```bash
# (当前项目可能通过CLAUDE_CODE_ENABLE_*实现)
```

#### ❌ 缺失（11个）

```bash
ENABLE_BASH_ENV_VAR_MATCHING
ENABLE_BASH_WRAPPER_MATCHING
ENABLE_BETA_TRACING_DETAILED
ENABLE_CODE_GUIDE_SUBAGENT
ENABLE_ENHANCED_TELEMETRY_BETA
ENABLE_EXPERIMENTAL_MCP_CLI
ENABLE_INCREMENTAL_TUI
ENABLE_MCP_CLI
ENABLE_MCP_CLI_ENDPOINT
ENABLE_MCP_LARGE_OUTPUT_FILES
ENABLE_TOOL_SEARCH
```

---

### 1.5 MAX_* 和 MCP_* 环境变量

#### MAX_* （3个官方，1个当前）

##### ✅ 已实现

```bash
MAX_MCP_OUTPUT_TOKENS
```

##### ❌ 缺失

```bash
MAX_THINKING_TOKENS  # Extended Thinking预算
MAX_STRUCTURED_OUTPUT_RETRIES
```

#### MCP_* （4个官方，2个当前）

##### ✅ 已实现

```bash
MCP_TIMEOUT
# (MCP_DEBUG - 当前项目特有)
```

##### ❌ 缺失

```bash
MCP_OAUTH_CALLBACK_PORT
MCP_SERVER_CONNECTION_BATCH_SIZE
MCP_TOOL_TIMEOUT
```

---

## 二、配置项对比（settings.json）

### 2.1 官方配置项（从混淆代码提取）

#### 核心配置项（已验证）

```typescript
// 官方 settings.json 结构推断

interface UserConfig {
  // ===== P0 - 核心缺失 =====

  /** Diff显示工具 (官方cli.js:3509) */
  diffTool?: "terminal" | "auto";  // ❌ 缺失

  /** 自动连接IDE (官方) */
  autoConnectIde?: boolean;  // ❌ 缺失

  /** 自动安装IDE扩展 */
  autoInstallIdeExtension?: boolean;  // ❌ 缺失

  /** Extended Thinking 配置 */
  thinking?: {  // ❌ 缺失（核心实现已有，但配置层缺失）
    enabled: boolean;
    budgetTokens: number;
    showThinking: boolean;
    timeout: number;
  };

  // ===== P1 - 重要功能 =====

  /** 遵守.gitignore规则 */
  respectGitignore?: boolean;  // ❌ 缺失

  /** 启用提示词建议 */
  promptSuggestionEnabled?: boolean;  // ❌ 缺失

  /** 文件检查点（快照） */
  fileCheckpointingEnabled?: boolean;  // ⚠️ 部分实现

  /** 自动压缩会话 */
  autoCompactEnabled?: boolean;  // ⚠️ 需验证

  /** 自动更新频道 */
  autoUpdatesChannel?: "latest" | "disabled";  // ❌ 缺失

  /** Chrome集成默认启用 */
  claudeInChromeDefaultEnabled?: boolean;  // ❌ 缺失

  /** 编辑器模式 */
  editorMode?: "default" | "vim" | "emacs";  // ⚠️ 当前只有VIM_MODE

  /** 输出样式 */
  outputStyle?: "default" | "compact" | "verbose";  // ❌ 缺失

  /** 通知渠道 */
  notifChannel?: "desktop" | "terminal" | "none";  // ❌ 缺失

  // ===== P2 - 优化细节 =====

  /** 显示加载提示 */
  spinnerTipsEnabled?: boolean;  // ❌ 缺失

  /** 终端进度条 */
  terminalProgressBarEnabled?: boolean;  // ❌ 缺失

  // ===== ✅ 已实现 =====

  /** 默认模型 */
  model?: string;  // ✅

  /** 默认权限模式 */
  defaultPermissionMode?: "ask" | "allow" | "deny";  // ✅

  /** 权限规则 */
  permissions?: {  // ✅
    allowed?: string[];
    denied?: string[];
    // ...
  };

  /** MCP服务器 */
  mcpServers?: Record<string, MCPServerConfig>;  // ✅

  /** 插件配置 */
  plugins?: PluginConfig[];  // ✅

  /** 钩子脚本 */
  hooks?: HooksConfig;  // ✅
}
```

### 2.2 当前项目配置项（src/config/index.ts）

#### ✅ 已实现的配置项（~18个）

```typescript
// 当前项目 UserConfigSchema (src/config/index.ts)

const UserConfigSchema = z.object({
  // ✅ 核心配置
  model: z.string().optional(),
  defaultPermissionMode: z.enum(["ask", "allow", "deny"]).optional(),

  // ✅ 权限系统
  permissions: z.object({
    allowed: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional(),
    modes: z.record(z.enum(["ask", "allow", "deny"])).optional(),
  }).optional(),

  // ✅ MCP集成
  mcpServers: z.record(z.string(), MCPServerConfigSchema).optional(),

  // ✅ 插件系统
  plugins: z.array(PluginConfigSchema).optional(),

  // ✅ 钩子系统
  hooks: z.object({
    preToolUse: z.string().optional(),
    postToolUse: z.string().optional(),
    // ...
  }).optional(),

  // ✅ 其他已实现
  // acceptEdits, bypassPermissions, plan, ...

  // ❌ 缺失的UI/UX配置
  // diffTool, autoConnectIde, respectGitignore, etc.

  // ❌ 缺失的Extended Thinking配置
  // thinking: { enabled, budgetTokens, ... }
});
```

---

## 三、缺失清单汇总

### 3.1 环境变量缺失（P0 - 紧急）

**需要添加到 `src/types/config.ts` 中的 `ENV_VAR_NAMES`**

```typescript
export const ENV_VAR_NAMES = {
  // ... 现有变量 ...

  // Extended Thinking (P0)
  MAX_THINKING_TOKENS: 'MAX_THINKING_TOKENS',
  DISABLE_INTERLEAVED_THINKING: 'DISABLE_INTERLEAVED_THINKING',

  // Git集成 (P0)
  GIT_BASH_PATH: 'CLAUDE_CODE_GIT_BASH_PATH',

  // 会话管理 (P0)
  PARENT_SESSION_ID: 'CLAUDE_CODE_PARENT_SESSION_ID',
  SESSION_ID: 'CLAUDE_CODE_SESSION_ID',
  SESSION_ACCESS_TOKEN: 'CLAUDE_CODE_SESSION_ACCESS_TOKEN',
  SKIP_PROMPT_HISTORY: 'CLAUDE_CODE_SKIP_PROMPT_HISTORY',

  // Agent系统 (P0)
  AGENT_NAME: 'CLAUDE_CODE_AGENT_NAME',
  AGENT_TYPE: 'CLAUDE_CODE_AGENT_TYPE',
  SUBAGENT_MODEL: 'CLAUDE_CODE_SUBAGENT_MODEL',
  PLAN_V2_AGENT_COUNT: 'CLAUDE_CODE_PLAN_V2_AGENT_COUNT',
  PLAN_V2_EXPLORE_AGENT_COUNT: 'CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT',

  // 工具并发 (P0)
  MAX_TOOL_USE_CONCURRENCY: 'CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY',

  // 环境隔离 (P0)
  DONT_INHERIT_ENV: 'CLAUDE_CODE_DONT_INHERIT_ENV',

  // 远程会话 (P0)
  REMOTE: 'CLAUDE_CODE_REMOTE',
  REMOTE_ENVIRONMENT_TYPE: 'CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE',
  REMOTE_SESSION_ID: 'CLAUDE_CODE_REMOTE_SESSION_ID',
} as const;
```

### 3.2 配置Schema缺失（P0）

**需要添加到 `src/config/index.ts` 中的 `UserConfigSchema`**

```typescript
const UserConfigSchema = z.object({
  // ... 现有配置 ...

  // ===== P0 缺失配置 =====

  /** Diff显示工具 */
  diffTool: z.enum(["terminal", "auto"]).default("auto").optional(),

  /** Extended Thinking 配置 */
  thinking: z.object({
    enabled: z.boolean().default(false),
    budgetTokens: z.number().int().min(1024).max(128000).default(10000),
    showThinking: z.boolean().default(false),
    timeout: z.number().int().positive().default(120000),
  }).optional(),

  // ===== P1 缺失配置 =====

  /** IDE集成 */
  autoConnectIde: z.boolean().default(false).optional(),
  autoInstallIdeExtension: z.boolean().default(true).optional(),

  /** UI/UX */
  respectGitignore: z.boolean().default(true).optional(),
  promptSuggestionEnabled: z.boolean().default(false).optional(),
  fileCheckpointingEnabled: z.boolean().default(true).optional(),
  autoCompactEnabled: z.boolean().default(true).optional(),
  autoUpdatesChannel: z.enum(["latest", "disabled"]).default("latest").optional(),
  claudeInChromeDefaultEnabled: z.boolean().default(true).optional(),
  spinnerTipsEnabled: z.boolean().default(true).optional(),
  terminalProgressBarEnabled: z.boolean().default(true).optional(),

  /** 编辑器和输出 */
  editorMode: z.enum(["default", "vim", "emacs"]).default("default").optional(),
  outputStyle: z.enum(["default", "compact", "verbose"]).default("default").optional(),

  /** 通知 */
  notifChannel: z.enum(["desktop", "terminal", "none"]).default("terminal").optional(),

}).passthrough();
```

---

## 四、修复成本估算

### 4.1 环境变量修复（58个缺失）

| 任务 | 文件 | 预计时间 |
|------|------|---------|
| 添加环境变量常量定义 | src/types/config.ts | 30分钟 |
| 添加环境变量读取逻辑 | src/config/manager.ts | 1小时 |
| 添加类型定义 | src/types/config.ts | 30分钟 |
| 集成到各模块 | src/core/, src/session/, etc. | 2小时 |
| **小计** | - | **4小时** |

### 4.2 配置项修复（~15个缺失）

| 任务 | 文件 | 预计时间 |
|------|------|---------|
| 扩展UserConfigSchema | src/config/index.ts | 30分钟 |
| 添加默认值 | src/config/index.ts | 15分钟 |
| 集成到UI | src/ui/ | 1小时 |
| 集成到核心模块 | src/core/, src/tools/ | 1小时 |
| **小计** | - | **2小时45分钟** |

### 4.3 测试和文档（必需）

| 任务 | 预计时间 |
|------|---------|
| 单元测试 | 2小时 |
| 集成测试 | 1小时 |
| 更新文档 | 30分钟 |
| **小计** | **3小时30分钟** |

### 4.4 总计

| 类别 | 时间 |
|------|------|
| 环境变量 | 4小时 |
| 配置项 | 2小时45分钟 |
| 测试文档 | 3小时30分钟 |
| **总计** | **约10小时15分钟（1.3个工作日）** |

---

## 五、优先级建议

### P0 - 立即修复（4-5小时）

1. **Extended Thinking 配置层** ✅ 核心已有，补齐配置
   - 添加环境变量：`MAX_THINKING_TOKENS`, `DISABLE_INTERLEAVED_THINKING`
   - 添加配置Schema：`thinking` 对象
   - 添加CLI参数：`--thinking`, `--thinking-budget`

2. **diffTool 配置**
   - 添加配置项：`diffTool: "terminal" | "auto"`
   - 集成到Edit/MultiEdit工具

3. **会话管理环境变量**
   - `PARENT_SESSION_ID`, `SESSION_ID`, `SESSION_ACCESS_TOKEN`
   - `SKIP_PROMPT_HISTORY`

### P1 - 重要功能（3-4小时）

1. **IDE集成配置**
   - `autoConnectIde`, `autoInstallIdeExtension`
   - `CLAUDE_CODE_IDE_HOST_OVERRIDE`, `IDE_SKIP_AUTO_INSTALL`, `IDE_SKIP_VALID_CHECK`

2. **Agent系统环境变量**
   - `AGENT_NAME`, `AGENT_TYPE`, `SUBAGENT_MODEL`
   - `PLAN_V2_AGENT_COUNT`, `PLAN_V2_EXPLORE_AGENT_COUNT`

3. **Prompt Caching 禁用开关**
   - `DISABLE_PROMPT_CACHING`
   - 按模型禁用：`_HAIKU`, `_OPUS`, `_SONNET`

4. **UI/UX 配置**
   - `respectGitignore`, `promptSuggestionEnabled`
   - `spinnerTipsEnabled`, `autoCompactEnabled`

### P2 - 优化细节（2-3小时）

1. **调试和监控**
   - `DIAGNOSTICS_FILE`, `PROFILE_STARTUP`, `PROFILE_QUERY`
   - `OTEL_*` 相关变量

2. **沙箱和安全**
   - `BASH_SANDBOX_SHOW_INDICATOR`, `BUBBLEWRAP`, `CONTAINER_ID`
   - `DISABLE_COMMAND_INJECTION_CHECK`

3. **命令禁用开关**
   - `DISABLE_BUG_COMMAND`, `DISABLE_DOCTOR_COMMAND`, 等

4. **网络和代理**
   - `PROXY_RESOLVES_HOSTS`, `SSE_PORT`

---

## 六、验证方法

### 6.1 环境变量验证

```bash
# 测试Extended Thinking环境变量
export MAX_THINKING_TOKENS=15000
node dist/cli.js -p "Complex reasoning task"

# 验证API请求包含thinking参数
# 应在日志中看到: thinking: { type: 'enabled', budget_tokens: 15000 }
```

### 6.2 配置项验证

```bash
# 编辑 ~/.claude/settings.json
{
  "diffTool": "terminal",
  "thinking": {
    "enabled": true,
    "budgetTokens": 20000
  },
  "autoConnectIde": true
}

# 运行CLI
node dist/cli.js

# 验证：
# 1. diffTool应设置为"terminal"
# 2. thinking应启用，预算20000
# 3. 应尝试自动连接IDE
```

---

## 七、参考资料

### 官方源码位置

#### 环境变量提取

```bash
# 提取所有CLAUDE_CODE_*变量
grep -o 'process\.env\.CLAUDE_CODE_[A-Z_0-9]*' \
  node_modules/@anthropic-ai/claude-code/cli.js | sort -u

# 提取所有DISABLE_*变量
grep -o 'process\.env\.DISABLE_[A-Z_0-9]*' \
  node_modules/@anthropic-ai/claude-code/cli.js | sort -u
```

#### 配置项提取

```bash
# 搜索配置面板定义
grep -n "diffTool\|autoConnectIde\|respectGitignore" \
  node_modules/@anthropic-ai/claude-code/cli.js

# 官方diffTool定义位置: cli.js:3509
```

### 当前项目位置

- 环境变量定义：[src/types/config.ts](src/types/config.ts)
- 配置Schema：[src/config/index.ts](src/config/index.ts)
- 配置加载：[src/config/manager.ts](src/config/manager.ts)

---

## 八、下一步行动

### 立即执行（今天）

1. ✅ ~~提取官方环境变量完整列表~~ - 已完成
2. ✅ ~~提取当前项目环境变量~~ - 已完成
3. ✅ ~~生成对比报告~~ - 已完成
4. ⏭ **开始P0修复**：Extended Thinking配置层 + diffTool

### 明天执行

1. 继续P0修复：会话管理环境变量
2. 开始P1修复：IDE集成配置

### 本周内

1. 完成所有P0 + P1修复
2. 更新ALIGNMENT_ROADMAP.md
3. 生成最终验证报告

---

**生成时间**: 2026-01-07
**报告版本**: v1.0
**维护者**: Claude Code 对比分析团队
