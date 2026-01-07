# Session 配置深度重构方案

**日期**: 2026-01-07
**目标**: 深度集成配置系统到 Session 管理模块
**范围**: Session 类、SessionManager、CLI、ConversationLoop

---

## 📊 当前状态分析

### 1. Session 类 (`src/core/session.ts`)

**当前实现**:
```typescript
constructor(cwd: string = process.cwd()) {
  // 直接从环境变量读取，硬编码
  this.configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  this.originalCwd = cwd;

  this.state = {
    sessionId: randomUUID(),
    cwd,
    startTime: Date.now(),
    totalCostUSD: 0,
    // ...
  };
}
```

**问题**:
- ❌ 构造函数只接受 `cwd` 参数
- ❌ 直接读取环境变量，没有使用配置系统
- ❌ 无法支持配置文件、命令行标志等其他配置源
- ❌ SessionId、parentId、accessToken 等都应该来自配置

### 2. SessionManager 类 (`src/session/index.ts`)

**当前实现**:
```typescript
constructor(options: { autoSave?: boolean; autoSaveIntervalMs?: number } = {}) {
  this.autoSave = options.autoSave ?? true;
  // 硬编码默认值 30000
  const interval = options.autoSaveIntervalMs ?? 30000;
}
```

**问题**:
- ❌ 没有从配置系统读取 `autoSave`、`autoSaveIntervalMs`
- ❌ 没有读取 `SESSION_DIR`、`MAX_SESSIONS`、`SESSION_EXPIRY_DAYS` 等配置

### 3. 配置系统 (`src/config/index.ts`)

**已完成** ✅:
```typescript
// 已在 getEnvConfig() 中定义 (lines 392-398)
(config as any).session = {
  id: process.env.CLAUDE_CODE_SESSION_ID,
  parentId: process.env.CLAUDE_CODE_PARENT_SESSION_ID,
  accessToken: process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN,
  skipPromptHistory: parseEnvBoolean(process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY),
  exitAfterStopDelay: parseEnvNumber(process.env.CLAUDE_CODE_EXIT_AFTER_STOP_DELAY),
  ssePort: parseEnvNumber(process.env.CLAUDE_CODE_SSE_PORT),
};
```

### 4. CLI 使用 (`src/cli.ts`)

**当前问题**:
- Session 创建分散在多处 (line 342, 550, 584)
- 没有统一的配置传递机制
- 硬编码了 SessionId 的生成

---

## 🎯 重构目标

### 优先级

**P0 (必须完成)**:
1. ✅ Session 类构造函数重构 - 接受配置对象
2. ✅ SessionManager 集成配置系统
3. ✅ CLI 传递配置给 Session
4. ✅ ConversationLoop 传递配置给 Session

**P1 (重要)**:
5. Session 相关常量从配置读取
6. 支持命令行标志覆盖 session 配置

**P2 (可选)**:
7. Session 配置热重载
8. Session 配置验证增强

---

## 🔧 重构设计

### 方案 1: 构造函数参数重构 (推荐)

#### 1.1 定义 SessionConfig 接口

**位置**: `src/types/config.ts`

```typescript
/**
 * Session 配置接口
 */
export interface SessionConfig {
  /** 会话 ID (如果指定，使用此 ID 而不是生成新 ID) */
  id?: string;

  /** 父会话 ID (用于 fork) */
  parentId?: string;

  /** 会话访问令牌 */
  accessToken?: string;

  /** 跳过提示历史 */
  skipPromptHistory?: boolean;

  /** 停止后延迟退出 (ms) */
  exitAfterStopDelay?: number;

  /** SSE 端口 */
  ssePort?: number;

  /** 配置目录 (默认: ~/.claude) */
  configDir?: string;

  /** 工作目录 */
  cwd?: string;
}
```

#### 1.2 重构 Session 构造函数

**文件**: `src/core/session.ts`

```typescript
export class Session {
  private state: SessionState;
  private messages: Message[] = [];
  private configDir: string;
  private originalCwd: string;
  private gitInfo?: GitInfo;
  private customTitle?: string;
  private isLocked: boolean = false;
  private lockFile?: string;

  // 新增：Session 配置
  private config: SessionConfig;

  constructor(config: SessionConfig = {}) {
    this.config = config;

    // 1. 配置目录：优先使用传入配置，其次环境变量，最后默认值
    this.configDir =
      config.configDir ||
      process.env.CLAUDE_CONFIG_DIR ||
      path.join(os.homedir(), '.claude');

    // 2. 工作目录
    const cwd = config.cwd || process.cwd();
    this.originalCwd = cwd;

    // 3. Session ID：如果配置指定则使用，否则生成新 ID
    const sessionId = config.id || randomUUID();

    this.state = {
      sessionId,
      cwd,
      originalCwd: cwd,
      startTime: Date.now(),
      totalCostUSD: 0,
      totalAPIDuration: 0,
      totalAPIDurationWithoutRetries: 0,
      totalToolDuration: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      modelUsage: {},
      alwaysAllowedTools: [],
      todos: [],
    };

    // 4. 父会话 ID（用于 fork）
    if (config.parentId) {
      (this.state as any).parentId = config.parentId;
    }

    // 确保配置目录存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  /**
   * 获取 Session 配置
   */
  getConfig(): SessionConfig {
    return { ...this.config };
  }

  /**
   * 获取访问令牌
   */
  getAccessToken(): string | undefined {
    return this.config.accessToken;
  }

  /**
   * 获取 SSE 端口
   */
  getSsePort(): number | undefined {
    return this.config.ssePort;
  }

  /**
   * 是否跳过提示历史
   */
  shouldSkipPromptHistory(): boolean {
    return this.config.skipPromptHistory ?? false;
  }

  /**
   * 获取停止后延迟退出时间
   */
  getExitAfterStopDelay(): number | undefined {
    return this.config.exitAfterStopDelay;
  }
}
```

#### 1.3 重构 SessionManager

**文件**: `src/session/index.ts`

```typescript
/**
 * SessionManager 配置接口
 */
export interface SessionManagerConfig {
  /** 自动保存开关 */
  autoSave?: boolean;

  /** 自动保存间隔 (ms) */
  autoSaveIntervalMs?: number;

  /** 会话目录 */
  sessionDir?: string;

  /** 最大会话数 */
  maxSessions?: number;

  /** 会话过期天数 */
  sessionExpiryDays?: number;
}

export class SessionManager {
  private currentSession: SessionData | null = null;
  private autoSave: boolean;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private config: SessionManagerConfig;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      autoSave: config.autoSave ?? true,
      autoSaveIntervalMs: config.autoSaveIntervalMs ?? 30000,
      sessionDir: config.sessionDir || path.join(os.homedir(), '.claude', 'sessions'),
      maxSessions: config.maxSessions ?? 100,
      sessionExpiryDays: config.sessionExpiryDays ?? 30,
    };

    this.autoSave = this.config.autoSave;

    if (this.autoSave) {
      this.autoSaveInterval = setInterval(() => {
        this.save();
      }, this.config.autoSaveIntervalMs);
    }
  }

  /**
   * 获取会话目录
   */
  getSessionDir(): string {
    return this.config.sessionDir!;
  }

  /**
   * 获取最大会话数
   */
  getMaxSessions(): number {
    return this.config.maxSessions!;
  }

  /**
   * 获取会话过期天数
   */
  getSessionExpiryDays(): number {
    return this.config.sessionExpiryDays!;
  }

  // ... 其他方法保持不变
}
```

#### 1.4 在配置 Schema 中添加 SessionManager 配置

**文件**: `src/config/index.ts`

在 `UserConfigSchema` 中添加：

```typescript
/** Session Manager 配置 (P1) */
sessionManager: z.object({
  autoSave: z.boolean().default(true),
  autoSaveIntervalMs: z.number().int().positive().default(30000),
  sessionDir: z.string().optional(),
  maxSessions: z.number().int().positive().default(100),
  sessionExpiryDays: z.number().int().positive().default(30),
}).optional(),
```

在 `defaultConfig` 中添加：

```typescript
sessionManager: {
  autoSave: true,
  autoSaveIntervalMs: 30000,
  maxSessions: 100,
  sessionExpiryDays: 30,
},
```

在 `getEnvConfig()` 中添加（如果有相应环境变量）：

```typescript
// ===== SessionManager 配置扩展 =====
if (process.env.CLAUDE_CODE_SESSION_AUTO_SAVE ||
    process.env.CLAUDE_CODE_SESSION_AUTOSAVE_INTERVAL ||
    process.env.CLAUDE_CODE_MAX_SESSIONS ||
    process.env.CLAUDE_CODE_SESSION_EXPIRY_DAYS) {
  (config as any).sessionManager = {
    autoSave: parseEnvBoolean(process.env.CLAUDE_CODE_SESSION_AUTO_SAVE),
    autoSaveIntervalMs: parseEnvNumber(process.env.CLAUDE_CODE_SESSION_AUTOSAVE_INTERVAL),
    maxSessions: parseEnvNumber(process.env.CLAUDE_CODE_MAX_SESSIONS),
    sessionExpiryDays: parseEnvNumber(process.env.CLAUDE_CODE_SESSION_EXPIRY_DAYS),
  };
}
```

#### 1.5 CLI 集成

**文件**: `src/cli.ts`

```typescript
// 在 CLI 启动时，从配置系统获取 session 配置
async function run() {
  // ... 解析命令行参数

  // 从配置管理器获取完整配置
  const config = configManager.getAll();

  // 创建 SessionConfig
  const sessionConfig: SessionConfig = {
    id: options.sessionId || config.session?.id,
    parentId: config.session?.parentId,
    accessToken: config.session?.accessToken,
    skipPromptHistory: config.session?.skipPromptHistory,
    exitAfterStopDelay: config.session?.exitAfterStopDelay,
    ssePort: config.session?.ssePort,
    configDir: config.configDir,
    cwd: process.cwd(),
  };

  // 创建 Session 时传入配置
  const session = new Session(sessionConfig);
  await session.initializeGitInfo();

  // 传递给 ConversationLoop
  const loop = new ConversationLoop({
    model: options.model,
    maxTokens: options.maxTokens,
    verbose: options.verbose,
    // ...
    session, // 传递配置好的 Session 实例
    thinking: config.thinking,
    fallbackModel: config.fallbackModel,
    debug: config.debug,
  });

  // ...
}
```

**恢复会话时**:

```typescript
if (options.resume) {
  const sessionData = loadSession(options.resume);
  if (sessionData) {
    // 创建 SessionConfig（从 sessionData 恢复）
    const sessionConfig: SessionConfig = {
      id: sessionData.metadata.id,
      parentId: sessionData.metadata.parentId,
      cwd: sessionData.metadata.workingDirectory,
      configDir: config.configDir,
      // 合并环境变量配置
      accessToken: config.session?.accessToken,
      skipPromptHistory: config.session?.skipPromptHistory,
      // ...
    };

    const session = new Session(sessionConfig);
    // 恢复消息历史
    sessionData.messages.forEach(msg => session.addMessage(msg));
    // 恢复状态
    session['state'].totalCostUSD = sessionData.metadata.cost || 0;
    // ...
  }
}
```

#### 1.6 ConversationLoop 集成

**文件**: `src/core/loop.ts`

如果 ConversationLoop 当前自己创建 Session，需要修改为接受 Session 实例：

```typescript
export interface LoopOptions {
  model: string;
  maxTokens?: number;
  verbose?: boolean;
  // ... 其他选项

  /** Session 实例（由调用者创建并配置好） */
  session?: Session;

  // 或者传入 SessionConfig，由 Loop 自己创建
  sessionConfig?: SessionConfig;

  thinking?: ThinkingConfig;
  fallbackModel?: string;
  debug?: DebugConfig;
}

export class ConversationLoop {
  private session: Session;

  constructor(options: LoopOptions) {
    // 如果传入了 Session 实例，直接使用
    if (options.session) {
      this.session = options.session;
    }
    // 否则使用 SessionConfig 创建
    else if (options.sessionConfig) {
      this.session = new Session(options.sessionConfig);
    }
    // 最后使用默认配置
    else {
      this.session = new Session({ cwd: process.cwd() });
    }

    // ... 其他初始化
  }
}
```

---

## 📋 实施步骤

### 阶段 1: 类型定义和接口 (30分钟)

1. ✅ 在 `src/types/config.ts` 添加 `SessionConfig` 接口
2. ✅ 在 `src/session/index.ts` 添加 `SessionManagerConfig` 接口
3. ✅ 更新 `LoopOptions` 接口

### 阶段 2: Session 类重构 (1小时)

1. ✅ 修改 Session 构造函数接受 `SessionConfig`
2. ✅ 添加配置相关的 getter 方法
3. ✅ 移除硬编码的环境变量读取
4. ✅ 保持向后兼容（如果不传配置，使用默认值）

### 阶段 3: SessionManager 重构 (30分钟)

1. ✅ 修改 SessionManager 构造函数接受 `SessionManagerConfig`
2. ✅ 移除硬编码常量
3. ✅ 添加配置相关的 getter 方法

### 阶段 4: 配置 Schema 更新 (30分钟)

1. ✅ 在 `UserConfigSchema` 添加 `sessionManager` 配置
2. ✅ 在 `defaultConfig` 添加默认值
3. ✅ 在 `getEnvConfig()` 添加环境变量读取（如果需要）

### 阶段 5: CLI 集成 (1小时)

1. ✅ 修改 CLI 创建 Session 的所有位置
2. ✅ 从 configManager 获取配置
3. ✅ 创建 SessionConfig 并传递给 Session
4. ✅ 处理 resume、fork 等特殊场景

### 阶段 6: ConversationLoop 集成 (30分钟)

1. ✅ 修改 ConversationLoop 接受 Session 实例或 SessionConfig
2. ✅ 确保 Session 配置正确传递

### 阶段 7: 测试验证 (1小时)

1. ✅ 测试默认配置
2. ✅ 测试环境变量配置
3. ✅ 测试配置文件配置
4. ✅ 测试命令行标志配置
5. ✅ 测试配置优先级链
6. ✅ 测试 session resume
7. ✅ 测试 session fork

---

## 🎯 验收标准

### 功能验收

- [ ] Session 类可以从配置系统读取所有 session 相关配置
- [ ] SessionManager 可以从配置系统读取所有 sessionManager 相关配置
- [ ] CLI 正确传递配置给 Session
- [ ] ConversationLoop 正确使用配置好的 Session
- [ ] 配置优先级链正确：默认值 < 配置文件 < 环境变量 < 命令行标志

### 兼容性验收

- [ ] 向后兼容：不传配置时使用默认值
- [ ] 现有会话文件可以正常加载
- [ ] Resume 功能正常工作
- [ ] Fork 功能正常工作

### 测试覆盖

- [ ] Session 构造函数测试
- [ ] SessionManager 配置测试
- [ ] CLI 配置传递测试
- [ ] 配置优先级测试

---

## 🚨 风险和注意事项

### 风险

1. **向后兼容性**
   - 风险：修改构造函数可能破坏现有代码
   - 缓解：保持构造函数参数可选，提供默认值

2. **配置传递复杂性**
   - 风险：配置对象在多层之间传递可能出错
   - 缓解：使用类型系统确保类型安全

3. **测试覆盖不足**
   - 风险：重构可能引入 bug
   - 缓解：编写充分的测试用例

### 注意事项

1. **保持简单**
   - 不要过度设计配置接口
   - 只添加必需的配置项

2. **遵循现有模式**
   - 参考 Extended Thinking 集成的模式
   - 保持代码风格一致

3. **文档更新**
   - 更新 SessionConfig 接口文档
   - 更新使用示例

---

## 📚 参考实现

### Extended Thinking 集成示例

```typescript
// src/cli.ts
const config = configManager.getAll();

const loop = new ConversationLoop({
  model: options.model,
  thinking: config.thinking,  // ✅ 从配置系统传递
  fallbackModel: config.fallbackModel,
  debug: config.debug,
});
```

### Agent 系统集成示例

```typescript
// src/tools/agent.ts
const { configManager } = await import('../config/index.js');
const config = configManager.getAll();

const loopOptions: LoopOptions = {
  model: resolvedModel,
  thinking: config.thinking,  // ✅ 动态导入配置
  fallbackModel: config.fallbackModel,
  debug: config.debug,
};
```

---

## ✅ 总结

本重构方案将：

1. ✅ Session 类从硬编码转为配置驱动
2. ✅ SessionManager 集成配置系统
3. ✅ CLI 正确传递配置
4. ✅ 保持向后兼容性
5. ✅ 提供完整的测试覆盖

**预计时间**: 4-5 小时
**优先级**: P0（核心重构）
**风险等级**: 中等（有向后兼容性保护）

---

**下一步**: 开始实施阶段 1 - 类型定义和接口
