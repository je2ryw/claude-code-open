# 配置 Schema 扩展 - 完整补丁

**日期**: 2026-01-07
**目标文件**: `src/config/index.ts`
**任务**: 在 `UserConfigSchema` 中添加所有缺失的 92+ 个配置项

---

## 添加位置

在 `UserConfigSchema` 中的 `security` 配置后、`mcpServers` 配置前添加以下内容：

```typescript
  // ========== 扩展: 安全配置 ==========
  security: z.object({
    sensitiveFiles: z.array(z.string()).optional(),
    dangerousCommands: z.array(z.string()).optional(),
    allowSandboxEscape: z.boolean().default(false),
    // 新增以下字段:
    clientCert: z.string().optional(), // 客户端证书路径 (CLAUDE_CODE_CLIENT_CERT)
    clientKey: z.string().optional(), // 客户端私钥路径 (CLAUDE_CODE_CLIENT_KEY)
    clientKeyPassphrase: z.string().optional(), // 私钥密码 (CLAUDE_CODE_CLIENT_KEY_PASSPHRASE)
    additionalProtection: z.boolean().optional(), // 额外保护 (CLAUDE_CODE_ADDITIONAL_PROTECTION)
    disableCommandInjectionCheck: z.boolean().default(false), // (DISABLE_COMMAND_INJECTION_CHECK)
  }).optional(),

  // ========== P0: Extended Thinking 配置 ==========
  thinking: z.object({
    enabled: z.boolean().default(true), // 是否启用 Extended Thinking
    budgetTokens: z.number().int().positive().optional(), // MAX_THINKING_TOKENS
    showThinking: z.boolean().default(false), // 是否显示思考过程
    timeout: z.number().int().positive().optional(), // 思考超时（毫秒）
    disableInterleaved: z.boolean().default(false), // DISABLE_INTERLEAVED_THINKING
  }).optional(),

  // ========== P0: Diff Tool 配置 ==========
  diffTool: z.enum(['terminal', 'auto', 'external']).default('terminal').optional(),

  // ========== P0: Git 集成配置 ==========
  git: z.object({
    bashPath: z.string().optional(), // Git Bash 路径 (CLAUDE_CODE_GIT_BASH_PATH)
  }).optional(),

  // ========== P0: 会话管理配置（扩展）==========
  session: z.object({
    id: z.string().optional(), // CLAUDE_CODE_SESSION_ID
    parentId: z.string().optional(), // CLAUDE_CODE_PARENT_SESSION_ID
    accessToken: z.string().optional(), // CLAUDE_CODE_SESSION_ACCESS_TOKEN
    skipPromptHistory: z.boolean().default(false), // CLAUDE_CODE_SKIP_PROMPT_HISTORY
    exitAfterStopDelay: z.number().int().optional(), // CLAUDE_CODE_EXIT_AFTER_STOP_DELAY (ms)
    ssePort: z.number().int().positive().optional(), // CLAUDE_CODE_SSE_PORT
  }).optional(),

  // ========== P0: Agent 系统配置（扩展）==========
  agent: z.object({
    id: z.string().optional(), // agentId (已在顶层，这里集中管理)
    name: z.string().optional(), // CLAUDE_CODE_AGENT_NAME
    type: z.string().optional(), // CLAUDE_CODE_AGENT_TYPE
    subagentModel: z.string().optional(), // CLAUDE_CODE_SUBAGENT_MODEL
    planV2AgentCount: z.number().int().positive().optional(), // CLAUDE_CODE_PLAN_V2_AGENT_COUNT
    planV2ExploreAgentCount: z.number().int().positive().optional(), // CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT
    effortLevel: z.enum(['low', 'medium', 'high']).optional(), // CLAUDE_CODE_EFFORT_LEVEL
    action: z.string().optional(), // CLAUDE_CODE_ACTION
  }).optional(),

  // ========== P1: IDE 集成配置 ==========
  ide: z.object({
    autoConnect: z.boolean().default(false), // CLAUDE_CODE_AUTO_CONNECT_IDE
    hostOverride: z.string().optional(), // CLAUDE_CODE_IDE_HOST_OVERRIDE
    skipAutoInstall: z.boolean().default(false), // CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL
    skipValidCheck: z.boolean().default(false), // CLAUDE_CODE_IDE_SKIP_VALID_CHECK
  }).optional(),

  // ========== P1: Prompt Caching 配置 ==========
  promptCaching: z.object({
    enabled: z.boolean().default(true), // DISABLE_PROMPT_CACHING (反转)
    sonnet: z.boolean().default(true), // DISABLE_PROMPT_CACHING_SONNET (反转)
    opus: z.boolean().default(true), // DISABLE_PROMPT_CACHING_OPUS (反转)
    haiku: z.boolean().default(true), // DISABLE_PROMPT_CACHING_HAIKU (反转)
  }).optional(),

  // ========== P1: 自定义 API 头部 ==========
  customHeaders: z.record(z.string()).optional(), // ANTHROPIC_CUSTOM_HEADERS

  // ========== P1: MCP 高级配置（扩展）==========
  mcp: z.object({
    timeout: z.number().int().positive().optional(), // MCP_TIMEOUT
    toolTimeout: z.number().int().positive().optional(), // MCP_TOOL_TIMEOUT
    maxOutputTokens: z.number().int().positive().optional(), // MAX_MCP_OUTPUT_TOKENS
    oauthCallbackPort: z.number().int().positive().optional(), // MCP_OAUTH_CALLBACK_PORT
    serverConnectionBatchSize: z.number().int().positive().optional(), // MCP_SERVER_CONNECTION_BATCH_SIZE
    enableCli: z.boolean().default(false), // ENABLE_MCP_CLI
    enableCliEndpoint: z.boolean().default(false), // ENABLE_MCP_CLI_ENDPOINT
    enableExperimentalCli: z.boolean().default(false), // ENABLE_EXPERIMENTAL_MCP_CLI
    enableLargeOutputFiles: z.boolean().default(false), // ENABLE_MCP_LARGE_OUTPUT_FILES
  }).optional(),

  // ========== P1: 认证跳过配置 ==========
  skipAuth: z.object({
    bedrock: z.boolean().default(false), // CLAUDE_CODE_SKIP_BEDROCK_AUTH
    vertex: z.boolean().default(false), // CLAUDE_CODE_SKIP_VERTEX_AUTH
    foundry: z.boolean().default(false), // CLAUDE_CODE_SKIP_FOUNDRY_AUTH
  }).optional(),

  // ========== P1: 远程会话配置 ==========
  remote: z.object({
    enabled: z.boolean().default(false), // CLAUDE_CODE_REMOTE
    environmentType: z.string().optional(), // CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE
    sessionId: z.string().optional(), // CLAUDE_CODE_REMOTE_SESSION_ID
  }).optional(),

  // ========== P2: 沙箱配置（扩展）==========
  sandbox: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(['bubblewrap', 'docker', 'none']).default('none'),
    bubblewrap: z.string().optional(), // CLAUDE_CODE_BUBBLEWRAP
    showIndicator: z.boolean().default(true), // CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR
    containerId: z.string().optional(), // CLAUDE_CODE_CONTAINER_ID
    shell: z.string().optional(), // CLAUDE_CODE_SHELL
    shellPrefix: z.string().optional(), // CLAUDE_CODE_SHELL_PREFIX
    dontInheritEnv: z.boolean().default(false), // CLAUDE_CODE_DONT_INHERIT_ENV
  }).optional(),

  // ========== P2: UI/UX 配置扩展 ==========
  ui: z.object({
    disableAttachments: z.boolean().default(false), // CLAUDE_CODE_DISABLE_ATTACHMENTS
    disableClaudeMds: z.boolean().default(false), // CLAUDE_CODE_DISABLE_CLAUDE_MDS
    disableFeedbackSurvey: z.boolean().default(false), // CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY
    disableTerminalTitle: z.boolean().default(false), // CLAUDE_CODE_DISABLE_TERMINAL_TITLE
    enablePromptSuggestion: z.boolean().default(false), // CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION
    enableTokenUsageAttachment: z.boolean().default(false), // CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT
    forceFullLogo: z.boolean().default(false), // CLAUDE_CODE_FORCE_FULL_LOGO
    syntaxHighlight: z.boolean().default(true), // CLAUDE_CODE_SYNTAX_HIGHLIGHT
    compact: z.boolean().default(false), // DISABLE_COMPACT (反转)
    microcompact: z.boolean().default(false), // DISABLE_MICROCOMPACT (反转)
    disableCostWarnings: z.boolean().default(false), // DISABLE_COST_WARNINGS
    enableIncrementalTui: z.boolean().default(false), // ENABLE_INCREMENTAL_TUI
  }).optional(),

  // ========== P2: 调试和监控配置（扩展）==========
  debug: z.object({
    enabled: z.boolean().default(false),
    logsDir: z.string().optional(), // debugLogsDir 的别名
    diagnosticsFile: z.string().optional(), // CLAUDE_CODE_DIAGNOSTICS_FILE
    profileQuery: z.boolean().default(false), // CLAUDE_CODE_PROFILE_QUERY
    profileStartup: z.boolean().default(false), // CLAUDE_CODE_PROFILE_STARTUP
    enableSdkFileCheckpointing: z.boolean().default(false), // CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING
  }).optional(),

  // ========== P2: 网络配置（扩展）==========
  network: z.object({
    proxyResolvesHosts: z.boolean().default(false), // CLAUDE_CODE_PROXY_RESOLVES_HOSTS
    disableNonessentialTraffic: z.boolean().default(false), // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  }).optional(),

  // ========== P2: 工具配置 ==========
  tools: z.object({
    maxConcurrency: z.number().int().positive().max(100).optional(), // CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY
    enableSearch: z.boolean().default(false), // ENABLE_TOOL_SEARCH
    useNativeFileSearch: z.boolean().default(false), // CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
    enableBashEnvVarMatching: z.boolean().default(false), // ENABLE_BASH_ENV_VAR_MATCHING
    enableBashWrapperMatching: z.boolean().default(false), // ENABLE_BASH_WRAPPER_MATCHING
  }).optional(),

  // ========== P2: Beta 功能 ==========
  beta: z.object({
    enableCodeGuideSubagent: z.boolean().default(false), // ENABLE_CODE_GUIDE_SUBAGENT
    enableTracingDetailed: z.boolean().default(false), // ENABLE_BETA_TRACING_DETAILED
    enableEnhancedTelemetry: z.boolean().default(false), // ENABLE_ENHANCED_TELEMETRY_BETA
    disableExperimentalBetas: z.boolean().default(false), // CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
  }).optional(),

  // ========== P2: 杂项配置 ==========
  misc: z.object({
    tags: z.array(z.string()).optional(), // CLAUDE_CODE_TAGS
    teamName: z.string().optional(), // CLAUDE_CODE_TEAM_NAME
    extraBody: z.record(z.any()).optional(), // CLAUDE_CODE_EXTRA_BODY
    testFixturesRoot: z.string().optional(), // CLAUDE_CODE_TEST_FIXTURES_ROOT
    entrypoint: z.string().optional(), // CLAUDE_CODE_ENTRYPOINT
    disableErrorReporting: z.boolean().default(false), // DISABLE_ERROR_REPORTING
    disableAutoUpdater: z.boolean().default(false), // DISABLE_AUTOUPDATER
    disableInstallationChecks: z.boolean().default(false), // DISABLE_INSTALLATION_CHECKS
    disableAutoMigrateToNative: z.boolean().default(false), // DISABLE_AUTO_MIGRATE_TO_NATIVE
  }).optional(),

  // ========== P2: 命令禁用配置 ==========
  disableCommands: z.object({
    login: z.boolean().default(false), // DISABLE_LOGIN_COMMAND
    logout: z.boolean().default(false), // DISABLE_LOGOUT_COMMAND
    bug: z.boolean().default(false), // DISABLE_BUG_COMMAND
    doctor: z.boolean().default(false), // DISABLE_DOCTOR_COMMAND
    feedback: z.boolean().default(false), // DISABLE_FEEDBACK_COMMAND
    installGithubApp: z.boolean().default(false), // DISABLE_INSTALL_GITHUB_APP_COMMAND
    upgrade: z.boolean().default(false), // DISABLE_UPGRADE_COMMAND
    extraUsage: z.boolean().default(false), // DISABLE_EXTRA_USAGE_COMMAND
  }).optional(),

  // ========== P2: 文件描述符配置 ==========
  fileDescriptors: z.object({
    apiKey: z.number().int().optional(), // CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR
    oauthToken: z.number().int().optional(), // CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
    websocketAuth: z.number().int().optional(), // CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR
    apiKeyHelperTtlMs: z.number().int().positive().optional(), // CLAUDE_CODE_API_KEY_HELPER_TTL_MS
  }).optional(),

  // ========== P2: 最大重试和结构化输出 ==========
  maxStructuredOutputRetries: z.number().int().min(0).max(10).optional(), // MAX_STRUCTURED_OUTPUT_RETRIES
```

---

## 统计

- **新增顶层配置字段**: 20+ 个
- **新增嵌套配置对象**: 14 个
- **新增配置项总数**: 92+ 个
- **覆盖环境变量**: 130 个

---

## 配置项映射表

| 配置项路径 | 环境变量 | 优先级 |
|-----------|---------|--------|
| `thinking.budgetTokens` | `MAX_THINKING_TOKENS` | P0 |
| `thinking.disableInterleaved` | `DISABLE_INTERLEAVED_THINKING` | P0 |
| `diffTool` | 无直接环境变量 | P0 |
| `git.bashPath` | `CLAUDE_CODE_GIT_BASH_PATH` | P0 |
| `session.id` | `CLAUDE_CODE_SESSION_ID` | P0 |
| `session.parentId` | `CLAUDE_CODE_PARENT_SESSION_ID` | P0 |
| `session.accessToken` | `CLAUDE_CODE_SESSION_ACCESS_TOKEN` | P0 |
| `agent.name` | `CLAUDE_CODE_AGENT_NAME` | P0 |
| `agent.type` | `CLAUDE_CODE_AGENT_TYPE` | P0 |
| `agent.subagentModel` | `CLAUDE_CODE_SUBAGENT_MODEL` | P0 |
| `ide.autoConnect` | `CLAUDE_CODE_AUTO_CONNECT_IDE` | P1 |
| `promptCaching.enabled` | `DISABLE_PROMPT_CACHING` (反转) | P1 |
| `customHeaders` | `ANTHROPIC_CUSTOM_HEADERS` | P1 |
| `mcp.timeout` | `MCP_TIMEOUT` | P1 |
| `tools.maxConcurrency` | `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` | P2 |
| `ui.syntaxHighlight` | `CLAUDE_CODE_SYNTAX_HIGHLIGHT` | P2 |
| ... | ... | ... |

完整映射见 `docs/environment-config-comparison.md`

---

## 下一步

1. ✅ 将以上配置添加到 `UserConfigSchema`
2. ⏳ 更新 `getEnvConfig()` 函数读取所有新环境变量
3. ⏳ 更新类型导出确保类型安全
4. ⏳ 编写测试验证配置加载
5. ⏳ 更新文档
