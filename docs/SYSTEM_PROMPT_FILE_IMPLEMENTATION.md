# 系统提示文件选项实现文档

## 概述

本文档描述了 `--system-prompt-file` 和 `--append-system-prompt-file` CLI 选项的实现，该功能允许用户从文件中读取系统提示词，而不是通过命令行参数传递。

## 功能特性

### 新增 CLI 选项

1. **`--system-prompt-file <file>`**
   - 从指定文件读取系统提示词
   - 替代 `--system-prompt <prompt>` 选项
   - 与 `--system-prompt` 互斥，不能同时使用

2. **`--append-system-prompt-file <file>`**
   - 从指定文件读取提示词并追加到默认系统提示
   - 替代 `--append-system-prompt <prompt>` 选项
   - 与 `--append-system-prompt` 互斥，不能同时使用

## 实现细节

### 1. CLI 选项定义

在 `/home/user/claude-code-open/src/cli.ts` 中添加了两个新选项：

```typescript
.option('--system-prompt <prompt>', 'System prompt to use for the session')
.option('--system-prompt-file <file>', 'Read system prompt from a file')
.option('--append-system-prompt <prompt>', 'Append to default system prompt')
.option('--append-system-prompt-file <file>', 'Read system prompt from a file and append to the default system prompt')
```

### 2. 互斥性验证

在 action 处理器的开始处添加了互斥检查：

```typescript
// 🔍 提前验证系统提示选项的互斥性
if (options.systemPrompt && options.systemPromptFile) {
  process.stderr.write(chalk.red('Error: Cannot use both --system-prompt and --system-prompt-file. Please use only one.\n'));
  process.exit(1);
}
if (options.appendSystemPrompt && options.appendSystemPromptFile) {
  process.stderr.write(chalk.red('Error: Cannot use both --append-system-prompt and --append-system-prompt-file. Please use only one.\n'));
  process.exit(1);
}
```

### 3. 文件读取逻辑

#### 系统提示文件处理

```typescript
if (options.systemPromptFile) {
  try {
    const filePath = path.resolve(options.systemPromptFile);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(chalk.red(`Error: System prompt file not found: ${filePath}\n`));
      process.exit(1);
    }
    systemPrompt = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`Error reading system prompt file: ${errorMsg}\n`));
    process.exit(1);
  }
}
```

#### 追加提示文件处理

```typescript
if (options.appendSystemPromptFile) {
  try {
    const filePath = path.resolve(options.appendSystemPromptFile);
    if (!fs.existsSync(filePath)) {
      process.stderr.write(chalk.red(`Error: Append system prompt file not found: ${filePath}\n`));
      process.exit(1);
    }
    appendSystemPrompt = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    process.stderr.write(chalk.red(`Error reading append system prompt file: ${errorMsg}\n`));
    process.exit(1);
  }
}
```

#### 合并逻辑

```typescript
// 合并 append system prompt
if (appendSystemPrompt) {
  systemPrompt = (systemPrompt || '') + '\n' + appendSystemPrompt;
}
```

## 使用示例

### 基本使用

```bash
# 从文件读取系统提示
claude --system-prompt-file ./prompts/coding-assistant.txt "帮我写一个函数"

# 追加系统提示
claude --append-system-prompt-file ./prompts/extra-instructions.txt "分析这段代码"
```

### 创建系统提示文件

```bash
# 创建一个系统提示文件
cat > coding-prompt.txt << EOF
You are a helpful coding assistant specialized in TypeScript and Node.js development.
Always write clean, well-documented code following best practices.
Include unit tests for new functions.
EOF

# 使用该文件
claude --system-prompt-file coding-prompt.txt "创建一个 HTTP 服务器"
```

### 错误场景

```bash
# 错误：同时使用两个选项
claude --system-prompt "test" --system-prompt-file prompt.txt
# 输出：Error: Cannot use both --system-prompt and --system-prompt-file. Please use only one.

# 错误：文件不存在
claude --system-prompt-file /path/to/nonexistent.txt
# 输出：Error: System prompt file not found: /path/to/nonexistent.txt
```

## 测试验证

已通过以下测试：

1. ✅ 互斥检查（`--system-prompt` 和 `--system-prompt-file`）
2. ✅ 互斥检查（`--append-system-prompt` 和 `--append-system-prompt-file`）
3. ✅ 文件不存在时显示错误
4. ✅ Help 文本包含新选项
5. ✅ 文件读取和内容合并

## 技术参考

- **官方实现参考**：`node_modules/@anthropic-ai/claude-code/cli.js`
- **文件路径解析**：使用 `path.resolve()` 支持相对和绝对路径
- **文件存在检查**：使用 `fs.existsSync()`
- **文件读取**：使用 `fs.readFileSync(filePath, 'utf-8')`
- **错误处理**：完整的 try-catch 块，提供清晰的错误信息

## 兼容性

- ✅ Node.js 18+
- ✅ Windows, macOS, Linux
- ✅ 支持相对路径和绝对路径
- ✅ UTF-8 编码文件

## 注意事项

1. 文件必须使用 UTF-8 编码
2. 文件路径支持相对路径（相对于当前工作目录）和绝对路径
3. 不能同时使用字符串选项和文件选项
4. 文件读取失败会终止程序执行
5. 追加提示会在系统提示后面添加换行符

## 相关文件

- `/home/user/claude-code-open/src/cli.ts` - 主要实现
- `/home/user/claude-code-open/docs/SYSTEM_PROMPT_FILE_IMPLEMENTATION.md` - 本文档

## 版本历史

- **v2.0.76-restored** - 初始实现
- 提交：`11b4cc2` - feat: 实现 --system-prompt-file 和 --append-system-prompt-file CLI 选项
