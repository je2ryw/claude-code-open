# 错误消息提示词对比分析

**对比时间**: 2025-12-30
**项目路径**: `/home/user/claude-code-open/src/types/errors.ts`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 一、项目实现概览

### 1.1 错误架构设计

项目采用了**完整的分层错误体系**，包含以下核心组件：

#### 错误代码枚举 (ErrorCode)
采用分段管理策略：
- **1000-1999**: 工具相关错误
- **2000-2999**: 权限相关错误
- **3000-3999**: 配置相关错误
- **4000-4999**: 网络相关错误
- **5000-5999**: 认证相关错误
- **6000-6999**: 验证相关错误
- **7000-7999**: 会话相关错误
- **8000-8999**: 沙箱相关错误
- **9000-9999**: 系统相关错误
- **10000-10999**: 插件相关错误
- **99999**: 未知错误

#### 错误严重级别 (ErrorSeverity)
```typescript
enum ErrorSeverity {
  LOW = 'low',           // 不影响主要功能
  MEDIUM = 'medium',     // 部分功能受影响
  HIGH = 'high',         // 主要功能受影响
  CRITICAL = 'critical', // 系统无法正常运行
}
```

#### 工具错误类型 (ToolErrorType)
```typescript
enum ToolErrorType {
  PERMISSION_DENIED = 'permission_denied',
  EXECUTION_FAILED = 'execution_failed',
  TIMEOUT = 'timeout',
  INVALID_INPUT = 'invalid_input',
  NETWORK_ERROR = 'network_error',
  SANDBOX_ERROR = 'sandbox_error',
  FILE_SYSTEM_ERROR = 'file_system_error',
  MCP_ERROR = 'mcp_error',
  UNKNOWN = 'unknown',
}
```

### 1.2 错误类层次结构

```
BaseClaudeError (基础错误类)
├── ToolExecutionError (工具执行错误)
├── ToolTimeoutError (工具超时错误)
├── PermissionDeniedError (权限拒绝错误)
├── ConfigurationError (配置错误)
├── NetworkError (网络错误)
├── AuthenticationError (认证错误)
├── ValidationError (验证错误)
├── SessionError (会话错误)
├── SandboxError (沙箱错误)
├── PluginError (插件错误)
└── SystemError (系统错误)
```

### 1.3 错误元数据

每个错误包含：
- `code`: 错误代码（ErrorCode枚举）
- `severity`: 严重级别（自动或手动设置）
- `recoverable`: 是否可恢复（布尔值）
- `retryable`: 是否可重试（布尔值）
- `timestamp`: 时间戳
- `details`: 详细信息（键值对）
- `context`: 上下文信息（键值对）
- `cause`: 原因链（Error对象）
- `toolErrorType`: 工具错误类型（可选）

---

## 二、官方实现分析

### 2.1 错误消息样本

从官方 cli.js（已压缩）中提取的错误消息样本：

#### 权限相关错误
```javascript
"Permission denied: ${Q.path??..."
"Permission denied (publickey)"
"Permission denied for: ${W}"
"Permission denied by hook"
"Permission denied → Run: gh auth refresh -h github.com -s repo,workflow"
```

#### 工具/执行相关错误
```javascript
"Tool execution failed..."
"Timeout has occurred"
"TimeoutError"
"timeout provided."
"Cannot quote argument..."
"Cannot modify protected Lambda context field: ${String(A)}"
```

#### 验证/类型错误
```javascript
"Invalid environment variable format: ${B}"
"Invalid notification, missing \"kind\""
"Invalid header from proxy CONNECT response"
"is not allowed"
"is not allowed in input"
"Expected a string, got ${typeof A}"
```

#### 网络相关错误
```javascript
"HTTP error: ${W.status}"
"NetworkError: ${D} ${M}"
"Token refresh failed: ${B.statusText}"
"Failed to fetch user roles: ${Q.statusText}"
```

#### 文件系统错误
```javascript
"Cannot read contents of ${Q}. Directory does not exist."
"Error opening file ${A}: ${Q}"
"Error parsing line in ${A}: ${G}"
```

#### 插件/配置错误
```javascript
"Plugin autoupdate: ${B.length} marketplace refresh(es) failed"
"Failed to remove global npm installation of ${A}"
"Validation failed"
"Checksum mismatch: expected \"${this.expectedChecksum}\" but received \"${B}\""
```

### 2.2 官方错误处理特点

1. **简洁直接**: 错误消息直接嵌入代码中，使用模板字符串
2. **上下文丰富**: 包含具体的变量值（路径、状态码、类型等）
3. **用户友好**: 提供具体的修复建议（如 "Run: gh auth refresh..."）
4. **类型多样**: 涵盖权限、网络、文件系统、验证等各个方面

---

## 三、关键差异对比

### 3.1 架构差异

| 维度 | 项目实现 | 官方实现（推测） |
|------|---------|----------------|
| **错误组织** | 分层类结构 + 枚举代码 | 直接字符串消息 |
| **严重级别** | 4级分类（LOW/MEDIUM/HIGH/CRITICAL） | 无明确分级 |
| **可重试性** | 布尔标记 + 自动判断逻辑 | 无明确标记 |
| **错误代码** | 数字代码（1000-99999） | 无统一编码 |
| **上下文追踪** | details + context 对象 | 内联变量 |
| **工具错误分类** | 9种专用类型 | 无专用分类 |

### 3.2 消息风格差异

#### 项目实现（推测消息）
```typescript
// 工厂函数创建的错误
createPermissionDeniedError(
  resource: "/path/to/file",
  permissionType: "write",
  message: "Permission denied: write access to /path/to/file"
)
// 包含元数据: code=2000, severity=HIGH, recoverable=false
```

#### 官方实现
```javascript
`Permission denied: ${path}`
// 简洁直接，无额外元数据
```

### 3.3 错误恢复策略差异

#### 项目实现
```typescript
// 自动判断可恢复性
determineRecoverable(code: ErrorCode): boolean {
  const unrecoverableCodes = [
    ErrorCode.CONFIG_SCHEMA_ERROR,
    ErrorCode.VALIDATION_SCHEMA_ERROR,
    ErrorCode.PLUGIN_CIRCULAR_DEPENDENCY,
    ErrorCode.SANDBOX_ESCAPE_ATTEMPT,
    ErrorCode.SYSTEM_OUT_OF_MEMORY,
    ErrorCode.SYSTEM_DISK_FULL,
  ];
  return !unrecoverableCodes.includes(code);
}

// 自动判断可重试性
determineRetryable(code: ErrorCode): boolean {
  const retryableCodes = [
    ErrorCode.NETWORK_CONNECTION_FAILED,
    ErrorCode.NETWORK_TIMEOUT,
    ErrorCode.NETWORK_RATE_LIMITED,
    ErrorCode.AUTH_REFRESH_FAILED,
    ErrorCode.SESSION_LOAD_FAILED,
    ErrorCode.SYSTEM_FILE_READ_ERROR,
    ErrorCode.TOOL_TIMEOUT,
  ];
  return retryableCodes.includes(code);
}
```

#### 官方实现
```javascript
// 通过具体的错误处理逻辑判断
// 例如：catch块中根据错误类型决定是否重试
```

---

## 四、覆盖度分析

### 4.1 项目定义的错误代码

项目定义了 **70+ 个具体错误代码**，覆盖：

✅ **工具层面** (8个)
- TOOL_EXECUTION_FAILED, TOOL_NOT_FOUND, TOOL_TIMEOUT
- TOOL_INVALID_INPUT, TOOL_INVALID_OUTPUT
- TOOL_NOT_AVAILABLE, TOOL_DISABLED, TOOL_DEPENDENCY_MISSING

✅ **权限层面** (7个)
- PERMISSION_DENIED, PERMISSION_PATH_DENIED
- PERMISSION_COMMAND_DENIED, PERMISSION_NETWORK_DENIED
- PERMISSION_TOOL_DENIED, PERMISSION_CONFIG_INVALID
- PERMISSION_AUDIT_FAILED

✅ **配置层面** (8个)
- CONFIG_NOT_FOUND, CONFIG_INVALID, CONFIG_PARSE_ERROR
- CONFIG_VALIDATION_FAILED, CONFIG_WRITE_FAILED
- CONFIG_MIGRATION_FAILED, CONFIG_SCHEMA_ERROR
- CONFIG_MISSING_REQUIRED

✅ **网络层面** (8个)
- NETWORK_CONNECTION_FAILED, NETWORK_TIMEOUT
- NETWORK_DNS_FAILED, NETWORK_SSL_ERROR
- NETWORK_PROXY_ERROR, NETWORK_RATE_LIMITED
- NETWORK_OFFLINE, NETWORK_HOST_UNREACHABLE

✅ **认证层面** (10个)
- AUTH_FAILED, AUTH_TOKEN_INVALID, AUTH_TOKEN_EXPIRED
- AUTH_TOKEN_MISSING, AUTH_OAUTH_FAILED
- AUTH_DEVICE_CODE_FAILED, AUTH_REFRESH_FAILED
- AUTH_INSUFFICIENT_PERMISSIONS
- AUTH_API_KEY_INVALID, AUTH_API_KEY_MISSING

✅ **验证层面** (7个)
- VALIDATION_FAILED, VALIDATION_SCHEMA_ERROR
- VALIDATION_TYPE_ERROR, VALIDATION_REQUIRED_FIELD
- VALIDATION_FORMAT_ERROR, VALIDATION_RANGE_ERROR
- VALIDATION_CONSTRAINT_VIOLATION

✅ **会话层面** (8个)
- SESSION_NOT_FOUND, SESSION_INVALID, SESSION_EXPIRED
- SESSION_SAVE_FAILED, SESSION_LOAD_FAILED
- SESSION_CHECKPOINT_FAILED, SESSION_RESTORE_FAILED
- SESSION_NO_ACTIVE

✅ **沙箱层面** (8个)
- SANDBOX_INIT_FAILED, SANDBOX_EXEC_FAILED
- SANDBOX_RESOURCE_LIMIT, SANDBOX_PATH_VIOLATION
- SANDBOX_NETWORK_BLOCKED, SANDBOX_NOT_AVAILABLE
- SANDBOX_CONFIG_INVALID, SANDBOX_ESCAPE_ATTEMPT

✅ **系统层面** (10个)
- SYSTEM_ERROR, SYSTEM_FILE_NOT_FOUND
- SYSTEM_FILE_READ_ERROR, SYSTEM_FILE_WRITE_ERROR
- SYSTEM_DIRECTORY_NOT_FOUND, SYSTEM_PATH_INVALID
- SYSTEM_PERMISSION_DENIED, SYSTEM_OUT_OF_MEMORY
- SYSTEM_DISK_FULL, SYSTEM_PROCESS_FAILED

✅ **插件层面** (8个)
- PLUGIN_NOT_FOUND, PLUGIN_LOAD_FAILED
- PLUGIN_INIT_FAILED, PLUGIN_DEPENDENCY_MISSING
- PLUGIN_CIRCULAR_DEPENDENCY, PLUGIN_VERSION_MISMATCH
- PLUGIN_INVALID_MANIFEST, PLUGIN_SECURITY_VIOLATION

### 4.2 官方实现覆盖的错误场景

从提取的消息来看，官方实现覆盖：

✅ 权限错误（Permission denied）
✅ 超时错误（Timeout）
✅ 网络错误（HTTP error, NetworkError）
✅ 验证错误（Invalid format, Expected type）
✅ 文件系统错误（Cannot read, Error opening file）
✅ 插件/配置错误（Plugin failed, Validation failed）
✅ 认证错误（Token refresh failed）

**对比结论**: 项目的错误代码分类更加细致和系统化，官方实现更注重实用性和直接性。

---

## 五、辅助工具对比

### 5.1 项目实现的辅助函数

#### 错误检查函数
```typescript
isClaudeError(error: unknown): error is ClaudeError
isRecoverableError(error: unknown): boolean
isRetryableError(error: unknown): boolean
```

#### 错误转换函数
```typescript
fromNativeError(error: Error, code?: ErrorCode): BaseClaudeError
formatError(error: unknown, verbose?: boolean): string
```

#### 错误属性获取函数
```typescript
getErrorSeverity(error: unknown): ErrorSeverity
getErrorCode(error: unknown): ErrorCode
```

#### 错误包装函数
```typescript
wrapWithErrorHandling<T, Args>(fn, errorCode, context?)
wrapAsyncWithErrorHandling<T, Args>(fn, errorCode, context?)
```

### 5.2 官方实现（推测）

基于JavaScript原生Error对象，配合：
- try-catch 块
- 自定义错误类（可能有，但未直接观察到）
- 错误日志系统

---

## 六、评估与建议

### 6.1 项目实现的优势

✅ **结构化设计**
- 完整的错误层次结构
- 统一的错误代码编号
- 清晰的严重级别分类

✅ **可维护性**
- 错误类型集中管理
- 易于扩展新的错误类型
- 工厂函数简化错误创建

✅ **可调试性**
- 丰富的元数据（details, context, cause）
- 时间戳追踪
- 格式化输出函数

✅ **自动化特性**
- 自动判断可恢复性
- 自动判断可重试性
- 自动确定严重级别

### 6.2 项目实现的潜在问题

⚠️ **可能过度设计**
- 70+ 个错误代码可能过于细致
- 某些代码可能在实际中很少使用
- 增加了理解和维护成本

⚠️ **与官方简洁风格不匹配**
- 官方实现倾向于简单直接的错误消息
- 项目的复杂结构可能不符合Claude Code的设计理念

⚠️ **性能开销**
- 错误对象创建时需要更多计算（严重级别判断、可恢复性判断等）
- 在高频错误场景下可能有轻微性能影响

### 6.3 具体改进建议

#### 建议1: 简化错误代码数量
保留核心错误代码（30-40个），合并相似场景：
```typescript
// 合并前
SYSTEM_FILE_NOT_FOUND = 9001
SYSTEM_DIRECTORY_NOT_FOUND = 9004

// 合并后
SYSTEM_PATH_NOT_FOUND = 9001
```

#### 建议2: 对齐官方消息风格
```typescript
// 当前风格
throw new PermissionDeniedError(
  "Permission denied: write access to /path/to/file",
  "/path/to/file",
  "write"
);

// 建议风格（更接近官方）
throw new PermissionDeniedError(
  `Permission denied: ${path}`,
  { path, operation: 'write' }
);
```

#### 建议3: 保留核心元数据，移除冗余字段
```typescript
// 精简后的错误接口
export interface ClaudeError extends Error {
  code: ErrorCode;           // 保留：用于程序化处理
  severity: ErrorSeverity;   // 保留：用于日志分级
  retryable: boolean;        // 保留：用于自动重试
  context?: Record<string, unknown>; // 保留：用于调试
  // 移除: recoverable, timestamp, details
}
```

#### 建议4: 添加官方消息映射
在项目中添加从错误代码到官方风格消息的映射：
```typescript
const OFFICIAL_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.PERMISSION_DENIED]: "Permission denied",
  [ErrorCode.TOOL_TIMEOUT]: "Timeout has occurred",
  [ErrorCode.NETWORK_CONNECTION_FAILED]: "NetworkError",
  // ...
};
```

---

## 七、总结

### 7.1 核心发现

1. **架构对比**
   - 项目实现：**工程化、结构化、元数据丰富**
   - 官方实现：**简洁、直接、注重实用性**

2. **覆盖度**
   - 项目定义了70+错误代码，覆盖面广
   - 官方实现覆盖核心错误场景，足够实用

3. **设计理念**
   - 项目偏向**企业级错误处理系统**（类似Java/C#）
   - 官方偏向**现代JavaScript错误处理**（简洁实用）

### 7.2 兼容性评估

**整体兼容性**: ⭐⭐⭐⭐☆ (4/5)

- ✅ 功能覆盖完整，包含官方所需的所有错误类型
- ✅ 错误消息可以对齐官方风格（通过调整工厂函数）
- ⚠️ 架构复杂度高于官方需求
- ⚠️ 部分错误代码可能冗余

### 7.3 最终建议

**采用"渐进式对齐"策略**：

1. **第一阶段**（保持兼容）
   - 保留现有错误体系结构
   - 添加官方消息风格的工厂函数
   - 在实际使用中收集错误代码使用频率

2. **第二阶段**（优化精简）
   - 基于使用数据合并低频错误代码
   - 移除冗余元数据字段
   - 统一错误消息格式

3. **第三阶段**（对齐官方）
   - 根据官方更新调整错误体系
   - 保持核心差异化优势（如严重级别、可重试性）
   - 在文档中说明与官方的差异

---

**对比完成时间**: 2025-12-30
**分析者**: Claude Code 逆向工程项目
