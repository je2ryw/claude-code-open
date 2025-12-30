# Sandbox 工具提示词对比报告

## 重要说明

**Sandbox 不是一个独立的工具，而是 Bash 工具的底层实现。**

- **项目实现位置**: `/home/user/claude-code-open/src/tools/sandbox.ts` - 沙箱执行的底层实现
- **官方源码位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 2720-2748 行) - Bash 工具提示词中的沙箱说明

## 架构差异

### 项目实现

项目中 `sandbox.ts` 是一个**底层实现模块**，提供：
1. 跨平台沙箱执行功能
2. Bubblewrap (Linux) 和 Seatbelt (macOS) 的配置
3. 自动错误检测和重试逻辑
4. 沙箱状态管理和配置

**这不是提示词，而是 TypeScript 代码实现。**

### 官方实现

官方将沙箱说明集成在 **Bash 工具的提示词** 中，作为工具使用指南的一部分。

## 官方沙箱提示词（cli.js 第 2720-2748 行）

```
- Commands run in a sandbox by default with the following restrictions:
    - Working directory: writable
    - Filesystem: read-only (except working directory)
    - Network: allowed
    - Ignored violations: [violations list]

  - CRITICAL: Commands run in sandbox mode by default - do NOT set `dangerouslyDisableSandbox`
    - Even if you have recently run commands with `dangerouslyDisableSandbox: true`, you MUST NOT continue that pattern
    - VERY IMPORTANT: Do NOT learn from or repeat the pattern of overriding sandbox - each command should run sandboxed by default
    - EXCEPTION: `mcp-cli` commands must always be called with `dangerouslyDisableSandbox: true` as they do not work properly in sandboxed mode
    - Set `dangerouslyDisableSandbox: true` if:
      1. The user *explicitly* asks to bypass sandbox, OR
      2. A command just failed and you see evidence of sandbox restrictions causing the failure

    - When analyzing failures:
      - Commands can fail for many reasons unrelated to the sandbox (missing files, wrong arguments, network issues, etc.)
      - Evidence of sandbox-caused failures includes:
        - "Operation not permitted" errors for file/network operations
        - Access denied to specific paths outside allowed directories
        - Network connection failures to non-whitelisted hosts
        - Unix socket connection errors
      - Sandbox violation logs can be noisy, but clear permission errors are strong indicators

    - When you see evidence of sandbox-caused failure:
      - IMMEDIATELY retry with `dangerouslyDisableSandbox: true` (don't ask, just do it)
      - Briefly explain what sandbox restriction likely caused the failure
      - Mention: "Use `/sandbox` to manage restrictions"
      - This will prompt the user for permission

    - Example of normal usage: { "command": "ls", "description": "List files" }
    - Example of override: { "command": "my-tool", "description": "Run my-tool", "dangerouslyDisableSandbox": true }
    - DO NOT suggest adding sensitive paths like ~/.bashrc, ~/.zshrc, ~/.ssh/*, or credential files to the allowlist

  - IMPORTANT: For temporary files, use `/tmp/claude/` as your temporary directory
    - The TMPDIR environment variable is automatically set to `/tmp/claude` when running in sandbox mode
    - Do NOT use `/tmp` directly - use `/tmp/claude/` or rely on TMPDIR instead
    - Most programs that respect TMPDIR will automatically use `/tmp/claude/`
```

## 项目中的沙箱错误提示实现（sandbox.ts）

项目在 `sandbox.ts` 中实现了官方的错误检测逻辑：

### 1. 沙箱错误检测（第 897-914 行）

```typescript
export function isSandboxError(error: string): boolean {
  const sandboxErrorPatterns = [
    /permission denied/i,
    /operation not permitted/i,
    /sandbox violation/i,
    /bwrap:/i,
    /sandbox-exec/i,
    /EPERM/i,
    /EACCES/i,
    /can't access/i,
    /read-only file system/i,
    /access denied/i,
    /network connection.*failed/i,
    /unix socket.*error/i,
  ];

  return sandboxErrorPatterns.some(pattern => pattern.test(error));
}
```

✅ **与官方对齐**：错误模式完全匹配官方描述的沙箱错误证据。

### 2. 官方错误指导文本（第 877-892 行）

```typescript
const SANDBOX_ERROR_HINTS = `
Evidence of sandbox-caused failures includes:
  - "Operation not permitted" errors for file/network operations
  - Access denied to specific paths outside allowed directories
  - Network connection failures to non-whitelisted hosts
  - Unix socket connection errors
  - Sandbox violation logs (though these can be noisy, clear permission errors are strong indicators)

When you see evidence of sandbox-caused failure:
  - IMMEDIATELY retry with dangerouslyDisableSandbox: true (don't ask, just do it)
  - Briefly explain what sandbox restriction likely caused the failure
  - Mention: "Use /sandbox to manage restrictions"
  - This will prompt the user for permission

Note: Commands can fail for many reasons unrelated to the sandbox (missing files, wrong arguments, network issues, etc.)
`.trim();
```

✅ **与官方一致**：错误提示文本来自官方源码第 2728-2738 行。

### 3. 自动重试逻辑（第 819-843 行）

```typescript
// ===== 关键的自动重试逻辑（与官方对齐）=====

// 检查是否是沙箱错误，如果是则自动重试
if (result.error && isSandboxError(result.error)) {
  if (sandboxConfig.fallbackOnError) {
    console.warn(`[Sandbox] Detected sandbox error, retrying without sandbox`);
    console.warn(`[Sandbox] Error: ${result.error}`);

    // 自动重试，禁用沙箱
    return executeDirectly(actualCommand, { cwd, env, timeout });
  }
}

// 检查 stderr 中的沙箱错误
// 注意：只有在命令失败时才重试（exitCode !== 0）
if (result.stderr && isSandboxError(result.stderr)) {
  if (sandboxConfig.fallbackOnError && result.exitCode !== 0) {
    console.warn(`[Sandbox] Detected sandbox error in stderr, retrying without sandbox`);
    console.warn(`[Sandbox] Stderr: ${result.stderr.substring(0, 200)}...`);

    // 自动重试，禁用沙箱
    return executeDirectly(actualCommand, { cwd, env, timeout });
  }
}
```

✅ **与官方对齐**：实现了"IMMEDIATELY retry with dangerouslyDisableSandbox: true"的逻辑。

### 4. MCP 命令特殊处理（第 735-740 行）

```typescript
// 2. MCP 工具的特殊处理：mcp-cli 命令必须禁用沙箱
// 这是官方实现的关键逻辑，mcp-cli 在沙箱中无法正常工作
if (command.includes('mcp-cli')) {
  console.warn('[Sandbox] MCP commands must run without sandbox');
  return false;
}
```

✅ **与官方一致**：官方提示词明确说明 "EXCEPTION: `mcp-cli` commands must always be called with `dangerouslyDisableSandbox: true`"。

### 5. 临时目录配置（第 303-312 行）

```typescript
// 创建沙箱专用临时目录
try {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  config.push('--bind', tmpDir, '/tmp');
  // 设置 TMPDIR 环境变量
  config.push('--setenv', 'TMPDIR', '/tmp/claude');
} catch {
  config.push('--tmpfs', '/tmp');
}
```

✅ **与官方对齐**：设置 `TMPDIR=/tmp/claude`，与官方提示词一致。

## 关键差异

### ❌ 差异 1：Bash 工具提示词严重简化

**项目实现** (`src/tools/bash.ts` 第 366 行)：
```
- Set dangerouslyDisableSandbox to true to run without sandboxing (use with caution).
```

**官方实现** (cli.js 第 2720-2748 行)：
包含完整的沙箱使用指南（约 30 行详细说明），包括：
- 何时使用 `dangerouslyDisableSandbox` 的明确标准
- MCP 命令的特殊处理规则
- 沙箱错误的判断证据列表
- 自动重试的指导方针
- 临时目录使用规范
- 安全路径管理建议

**影响**：
- ❌ **Claude 不知道何时应该使用 `dangerouslyDisableSandbox`**
- ❌ **Claude 不了解 MCP 命令必须禁用沙箱**
- ❌ **Claude 不知道如何判断是否是沙箱错误**
- ❌ **Claude 可能频繁请求权限或错误使用沙箱**

### ✅ 实现完整性

项目的 `sandbox.ts` 实现了官方的所有核心逻辑：
- ✅ 自动错误检测
- ✅ 自动重试机制
- ✅ MCP 命令特殊处理
- ✅ 临时目录配置
- ✅ 错误提示文本
- ✅ 跨平台支持

**但是**，这些功能虽然在代码中实现了，但由于提示词缺失，**Claude 不知道如何正确使用它们**。

## 建议修复

### 1. 在 Bash 工具提示词中添加沙箱说明

应该在 `src/tools/bash.ts` 的工具描述中添加官方的沙箱使用指南，包括：

```typescript
// 在 Bash 工具的 description 中添加
const sandboxGuidance = `
- Commands run in a sandbox by default with the following restrictions:
    - Working directory: writable
    - Filesystem: read-only (except working directory)
    - Network: allowed

  - CRITICAL: Commands run in sandbox mode by default - do NOT set \`dangerouslyDisableSandbox\`
    - Even if you have recently run commands with \`dangerouslyDisableSandbox: true\`, you MUST NOT continue that pattern
    - VERY IMPORTANT: Do NOT learn from or repeat the pattern of overriding sandbox - each command should run sandboxed by default
    - EXCEPTION: \`mcp-cli\` commands must always be called with \`dangerouslyDisableSandbox: true\` as they do not work properly in sandboxed mode
    - Set \`dangerouslyDisableSandbox: true\` if:
      1. The user *explicitly* asks to bypass sandbox, OR
      2. A command just failed and you see evidence of sandbox restrictions causing the failure

    - When analyzing failures:
      - Commands can fail for many reasons unrelated to the sandbox (missing files, wrong arguments, network issues, etc.)
      - Evidence of sandbox-caused failures includes:
        - "Operation not permitted" errors for file/network operations
        - Access denied to specific paths outside allowed directories
        - Network connection failures to non-whitelisted hosts
        - Unix socket connection errors
      - Sandbox violation logs can be noisy, but clear permission errors are strong indicators

    - When you see evidence of sandbox-caused failure:
      - IMMEDIATELY retry with \`dangerouslyDisableSandbox: true\` (don't ask, just do it)
      - Briefly explain what sandbox restriction likely caused the failure
      - Mention: "Use \`/sandbox\` to manage restrictions"
      - This will prompt the user for permission

    - Example of normal usage: { "command": "ls", "description": "List files" }
    - Example of override: { "command": "my-tool", "description": "Run my-tool", "dangerouslyDisableSandbox": true }
    - DO NOT suggest adding sensitive paths like ~/.bashrc, ~/.zshrc, ~/.ssh/*, or credential files to the allowlist

  - IMPORTANT: For temporary files, use \`/tmp/claude/\` as your temporary directory
    - The TMPDIR environment variable is automatically set to \`/tmp/claude\` when running in sandbox mode
    - Do NOT use \`/tmp\` directly - use \`/tmp/claude/\` or rely on TMPDIR instead
    - Most programs that respect TMPDIR will automatically use \`/tmp/claude/\`
`;
```

### 2. 保持底层实现

`sandbox.ts` 的实现已经与官方对齐，应保持不变。

## 总结

### 项目优势
1. ✅ **底层实现完整**：`sandbox.ts` 完整实现了跨平台沙箱执行（Bubblewrap + Seatbelt）
2. ✅ **自动重试机制**：与官方逻辑完全对齐，自动检测沙箱错误并重试
3. ✅ **错误检测准确**：沙箱错误模式完全匹配官方标准（12 种错误模式）
4. ✅ **MCP 特殊处理**：正确实现 mcp-cli 命令的沙箱绕过逻辑
5. ✅ **详细错误提示**：提供了官方的错误指导文本和修复建议
6. ✅ **临时目录配置**：正确设置 TMPDIR=/tmp/claude

### 关键问题（高优先级）

#### ❌ **Bash 工具提示词严重不足**

**问题严重性**：⚠️ **高危 - 直接影响 Claude 的行为**

**当前状态**：
- 项目只有 1 行简单说明
- 官方有 30+ 行详细指南

**具体缺失内容**：
1. ❌ **何时使用 dangerouslyDisableSandbox 的判断标准**
   - 缺失"用户明确要求"和"沙箱错误证据"两个关键条件
   - 缺失"不要学习和重复绕过模式"的重要警告

2. ❌ **MCP 命令的强制规则**
   - 缺失"mcp-cli 必须使用 dangerouslyDisableSandbox: true"的明确说明
   - 虽然代码实现了自动检测，但 Claude 不知道这个规则

3. ❌ **沙箱错误的判断证据列表**
   - 缺失详细的错误模式说明（"Operation not permitted"、访问拒绝等）
   - 缺失"不要把所有错误都当成沙箱错误"的警告

4. ❌ **自动重试的行为指导**
   - 缺失"IMMEDIATELY retry"的指令
   - 缺失"简要解释原因 + 提及 /sandbox 命令"的要求

5. ❌ **临时目录使用规范**
   - 缺失 /tmp/claude/ 的使用说明
   - 缺失 TMPDIR 环境变量的说明

6. ❌ **安全最佳实践**
   - 缺失"不要建议添加敏感路径到白名单"的警告

**实际影响**：
- ❌ Claude 不知道何时应该绕过沙箱，可能频繁请求权限
- ❌ Claude 在运行 MCP 命令时可能不使用 dangerouslyDisableSandbox，导致失败
- ❌ Claude 可能将非沙箱错误误判为沙箱错误
- ❌ Claude 可能不使用 /tmp/claude/ 目录，导致权限问题
- ❌ Claude 可能学习错误的模式，过度使用 dangerouslyDisableSandbox

### 优先级评估

**🔴 P0 - 紧急修复**：
- 在 Bash 工具提示词中添加完整的沙箱使用指南（约 30 行）
- 这直接影响 Claude 的行为和用户体验

**🟡 P1 - 高优先级**：
- 确保提示词中的沙箱配置说明与代码实现一致
- 添加具体的使用示例

**🟢 P2 - 中优先级**：
- 优化错误提示的显示方式
- 添加更多的调试信息

### 影响评估

**功能影响**：⚠️ **中等**
- 底层沙箱执行功能完整，核心功能不受影响
- 但 Claude 的行为可能不符合预期

**用户体验影响**：⚠️ **高**
- Claude 可能频繁请求权限
- MCP 命令可能无法正常运行
- 错误处理可能不够智能

**安全性影响**：⚠️ **中等**
- 底层实现安全可靠
- 但提示词缺失可能导致 Claude 过度使用 `dangerouslyDisableSandbox`
- 可能导致不必要的安全风险

**开发体验影响**：⚠️ **高**
- 开发者需要手动处理很多本应自动化的场景
- 调试沙箱问题会更加困难

## 下一步行动

### 立即执行（P0）

1. **✅ 已验证问题**：确认 Bash 工具提示词缺失完整的沙箱使用指南
   - 当前：仅有 1 行简单说明
   - 应有：30+ 行详细指南（见上文"官方沙箱提示词"部分）

2. **🔴 紧急修复**：更新 `src/tools/bash.ts` 的 `getDescription()` 方法
   - 在第 366 行之后添加完整的沙箱使用指南
   - 参考上文"建议修复 → 1. 在 Bash 工具提示词中添加沙箱说明"部分的完整代码

3. **测试验证**：
   - 运行 `npm run build` 编译代码
   - 测试 Bash 工具是否能正确显示沙箱说明
   - 验证 Claude 能否正确理解沙箱使用规则

### 后续优化（P1）

4. **确保一致性**：
   - 检查沙箱配置（网络、路径等）的提示词与代码实现是否一致
   - 确保错误提示文本与官方版本对齐

5. **文档更新**：
   - 在 `CLAUDE.md` 中添加沙箱使用说明
   - 在 README 中说明沙箱的配置方法
   - 添加沙箱故障排查指南

### 长期改进（P2）

6. **增强用户体验**：
   - 优化沙箱错误提示的显示方式
   - 添加更详细的调试日志
   - 提供沙箱配置的可视化界面

7. **代码质量**：
   - 添加沙箱相关的单元测试
   - 添加集成测试验证沙箱行为
   - 性能优化（减少沙箱启动时间）

## 附录：完整的修复代码

### 修改文件：`src/tools/bash.ts`

在第 366 行之后（`- Set dangerouslyDisableSandbox...` 这一行），替换为官方的完整沙箱说明：

```typescript
getDescription(): string {
  // ... 前面的代码保持不变 ...

  return `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use 'ls' to verify the parent directory exists

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes
   - After ensuring proper quoting, execute the command

Usage notes:
  - The command argument is required.
  - Optional timeout in milliseconds (up to 600000ms / 10 minutes). Default: 120000ms (2 minutes).
  - Use run_in_background to run commands in the background.
  - Output exceeding ${MAX_OUTPUT_LENGTH} characters will be truncated.

Sandbox restrictions:
  - Commands run in a sandbox by default with the following restrictions:
    - Working directory: writable
    - Filesystem: read-only (except working directory)
    - Network: allowed

  - CRITICAL: Commands run in sandbox mode by default - do NOT set \`dangerouslyDisableSandbox\`
    - Even if you have recently run commands with \`dangerouslyDisableSandbox: true\`, you MUST NOT continue that pattern
    - VERY IMPORTANT: Do NOT learn from or repeat the pattern of overriding sandbox - each command should run sandboxed by default
    - EXCEPTION: \`mcp-cli\` commands must always be called with \`dangerouslyDisableSandbox: true\` as they do not work properly in sandboxed mode
    - Set \`dangerouslyDisableSandbox: true\` if:
      1. The user *explicitly* asks to bypass sandbox, OR
      2. A command just failed and you see evidence of sandbox restrictions causing the failure

    - When analyzing failures:
      - Commands can fail for many reasons unrelated to the sandbox (missing files, wrong arguments, network issues, etc.)
      - Evidence of sandbox-caused failures includes:
        - "Operation not permitted" errors for file/network operations
        - Access denied to specific paths outside allowed directories
        - Network connection failures to non-whitelisted hosts
        - Unix socket connection errors
      - Sandbox violation logs can be noisy, but clear permission errors are strong indicators

    - When you see evidence of sandbox-caused failure:
      - IMMEDIATELY retry with \`dangerouslyDisableSandbox: true\` (don't ask, just do it)
      - Briefly explain what sandbox restriction likely caused the failure
      - Mention: "Use \`/sandbox\` to manage restrictions"
      - This will prompt the user for permission

    - Example of normal usage: { "command": "ls", "description": "List files" }
    - Example of override: { "command": "my-tool", "description": "Run my-tool", "dangerouslyDisableSandbox": true }
    - DO NOT suggest adding sensitive paths like ~/.bashrc, ~/.zshrc, ~/.ssh/*, or credential files to the allowlist

  - IMPORTANT: For temporary files, use \`/tmp/claude/\` as your temporary directory
    - The TMPDIR environment variable is automatically set to \`/tmp/claude\` when running in sandbox mode
    - Do NOT use \`/tmp\` directly - use \`/tmp/claude/\` or rely on TMPDIR instead
    - Most programs that respect TMPDIR will automatically use \`/tmp/claude/\`

Sandbox: ${isBubblewrapAvailable() ? 'Available (bubblewrap)' : 'Not available'}`;
}
```

### 验证步骤

1. 保存文件后运行编译：
   ```bash
   npm run build
   ```

2. 测试工具描述：
   ```bash
   node dist/cli.js
   # 然后检查 Bash 工具的描述是否包含完整的沙箱说明
   ```

3. 测试实际行为：
   - 运行普通命令，确认在沙箱中执行
   - 运行 mcp-cli 命令，确认自动禁用沙箱
   - 触发沙箱错误，确认自动重试
   - 验证临时文件使用 /tmp/claude/

## 结论

项目的沙箱底层实现非常完善，与官方完全对齐。**唯一的关键问题是 Bash 工具的提示词严重不足，导致 Claude 无法正确使用这些功能**。

这是一个**高优先级问题**，应该立即修复。修复后，项目的沙箱功能将与官方完全一致。
