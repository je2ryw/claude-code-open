/**
 * Git Helper Utilities
 *
 * Provides utilities for git operations, including commit message
 * attribution handling.
 */

import { getCommitAttribution } from './attribution.js';

/**
 * Add attribution to a git commit message if not already present
 *
 * This function appends the attribution trailer to the commit message
 * in the standard Git trailer format, following Git conventions.
 *
 * @param commitMessage - Original commit message
 * @param modelId - Optional model ID for attribution
 * @returns Commit message with attribution appended (or original if disabled)
 */
export function addCommitAttribution(commitMessage: string, modelId?: string): string {
  // Get attribution text from config
  const attribution = getCommitAttribution(modelId);

  // If attribution is disabled (empty string), return original message
  if (!attribution || attribution.trim() === '') {
    return commitMessage;
  }

  // Check if attribution is already present in the message
  // This prevents duplicate attribution if the user manually added it
  if (commitMessage.includes('Co-Authored-By: Claude') ||
      commitMessage.includes('noreply@anthropic.com')) {
    return commitMessage;
  }

  // Ensure there's a blank line before trailers (Git convention)
  let message = commitMessage.trim();

  // Check if message already has trailers (lines starting with a trailer keyword)
  const trailerPattern = /\n\n[\w-]+:/;
  const hasTrailers = trailerPattern.test(message);

  if (hasTrailers) {
    // If trailers exist, append our trailer to them
    return `${message}\n${attribution}`;
  } else {
    // If no trailers, add a blank line before the trailer
    return `${message}\n\n${attribution}`;
  }
}

/**
 * Detect if a shell command is a git commit command
 *
 * @param command - Shell command string
 * @returns true if it's a git commit command
 */
export function isGitCommitCommand(command: string): boolean {
  // Match various git commit patterns:
  // - git commit
  // - git commit -m "..."
  // - git commit --message "..."
  // - git commit -am "..."
  // etc.

  // Remove leading/trailing whitespace
  const cmd = command.trim();

  // Check if it starts with git commit
  if (!cmd.match(/^git\s+commit\b/)) {
    return false;
  }

  // Exclude git commit --amend without message (opens editor)
  // Exclude git commit without -m (opens editor)
  // We only want to process commands with -m or --message

  // Check for -m or --message flag
  return /\s+(-m|--message)\s+/.test(cmd);
}

/**
 * Escape shell special characters for use in double-quoted strings
 * 修复 2.1.2: 只做转义，不做检测（检测由 validateCommitMessage 负责）
 *
 * @param str - String to escape
 * @returns Escaped string safe for shell usage in double quotes
 */
function escapeShellString(str: string): string {
  // 只做转义，不做安全检测
  // 安全检测由 validateCommitMessage() 负责
  return str
    .replace(/\\/g, '\\\\')   // 反斜杠（必须最先转义）
    .replace(/"/g, '\\"')      // 双引号
    .replace(/\$/g, '\\$')     // 美元符号（防止变量替换）
    .replace(/`/g, '\\`')      // 反引号（防止命令替换）
    .replace(/!/g, '\\!')      // 感叹号（防止历史扩展）
    .replace(/\n/g, '\\n');    // 换行符
}

/**
 * Validate commit message for command injection safety
 * 修复 2.1.2: 完整的命令注入检测
 *
 * 参考官网实现，检测所有可能导致命令注入的危险字符和模式
 *
 * @param message - Commit message to validate
 * @throws Error if message contains dangerous patterns
 */
export function validateCommitMessage(message: string): void {
  // v2.1.10: 首先检测 HEREDOC 上下文
  // 在 heredoc（特别是单引号 heredoc）中，模板字面量是安全的
  const heredocPattern = /<<-?\s*(['"])?[A-Za-z_]\w*\1?/;
  const isInHeredoc = heredocPattern.test(message);

  // 1. 检测命令替换：$()
  if (/\$\(/.test(message)) {
    throw new Error('Command injection detected: $() command substitution not allowed in commit message');
  }

  // 2. 检测变量替换：${}（修复 v2.1.3, v2.1.10 further fix）
  // v2.1.10: 在 heredoc 中允许 ${...} 语法（如 ${index + 1}）
  if (!isInHeredoc && /\$\{/.test(message)) {
    throw new Error('Command injection detected: variable substitution ${} not allowed in commit message');
  }

  // 3. 检测反引号命令替换
  if (/`/.test(message)) {
    throw new Error('Command injection detected: backtick command substitution not allowed in commit message');
  }

  // 4. 检测命令分隔符
  if (/;/.test(message)) {
    throw new Error('Command injection detected: semicolon (;) not allowed in commit message');
  }

  // 5. 检测逻辑操作符（必须在管道前检查，因为 || 包含 |）
  if (/&&/.test(message)) {
    throw new Error('Command injection detected: logical AND (&&) not allowed in commit message');
  }

  if (/\|\|/.test(message)) {
    throw new Error('Command injection detected: logical OR (||) not allowed in commit message');
  }

  // 6. 检测管道操作符
  if (/\|/.test(message)) {
    throw new Error('Command injection detected: pipe (|) not allowed in commit message');
  }

  // 7. 检测重定向操作符
  // 注意：需要区分 HEREDOC (<<)、邮箱地址 (<email>) 和输入重定向 (< file)
  // HEREDOC 和邮箱地址是安全的，但输入重定向是危险的

  // 使用已在函数顶部定义的 isInHeredoc 变量
  // 只有在不是 HEREDOC 上下文时才检测 < 和 > 重定向
  if (!isInHeredoc) {
    // 先移除所有安全的邮箱地址格式，然后检测剩余内容中的 < 和 >
    // 这样可以防止攻击者通过添加邮箱地址来绕过检测
    const emailPattern = /<[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}>/g;
    const messageWithoutEmails = message.replace(emailPattern, '');

    // 在移除邮箱地址后，检测是否还有 < 或 > 字符
    if (/</.test(messageWithoutEmails)) {
      throw new Error('Command injection detected: input redirection (<) not allowed in commit message');
    }

    if (/>/.test(messageWithoutEmails)) {
      throw new Error('Command injection detected: output redirection (>) not allowed in commit message');
    }
  }

  // 8. 检测嵌入的换行符后跟危险模式
  // 注意：正常的多行提交消息是允许的，但换行后跟 shell 命令是危险的
  // 由于我们使用 HEREDOC 单引号，换行符本身是安全的
  // 这里注释掉严格的换行符检测，因为它会误杀正常的多行消息
  // if (/\r|\n/.test(message)) {
  //   throw new Error('Command injection detected: newline characters not allowed in commit message');
  // }

  // 9. 检测 shell 注释符号后的反引号（如：git status# test(`id`)）
  if (/#.*`/.test(message)) {
    throw new Error('Command injection detected: comment with backtick not allowed in commit message');
  }

  // 10. 检测空字节（可能用于截断命令）
  if (/\x00/.test(message)) {
    throw new Error('Command injection detected: null byte not allowed in commit message');
  }
}

/**
 * Process a git commit command to add attribution
 *
 * This function modifies git commit commands to include attribution
 * in the commit message.
 *
 * 修复 2.1.2: 增强安全性，防止命令注入
 *
 * @param command - Original git commit command
 * @param modelId - Optional model ID for attribution
 * @returns Modified command with attribution, or original if not applicable
 */
export function processGitCommitCommand(command: string, modelId?: string): string {
  if (!isGitCommitCommand(command)) {
    return command;
  }

  try {
    // Extract the commit message from the command
    // Handle both -m "message" and -m "$(cat <<'EOF' ...)"

    // 修复 2.1.2: 必须先检查 HEREDOC 模式，再检查简单模式
    // 因为简单模式的正则会错误地匹配 HEREDOC 命令的开头部分

    // Pattern 1: -m "$(cat <<'EOF' ... EOF)" (heredoc)
    // 注意：heredoc 使用单引号 EOF 可以防止命令替换
    const heredocPattern = /(-m|--message)\s+"?\$\(cat\s+<<'EOF'\s+([\s\S]*?)\s+EOF\s*\)"?/;
    const heredocMatch = command.match(heredocPattern);

    if (heredocMatch) {
      const originalMessage = heredocMatch[2].trim();

      // 验证消息安全性（修复 2.1.2）
      validateCommitMessage(originalMessage);

      const newMessage = addCommitAttribution(originalMessage, modelId);

      // Build the replacement heredoc with the new message
      // 使用单引号 EOF 防止命令替换（修复 2.1.2）
      const flagMatch = heredocMatch[1]; // -m or --message
      const replacement = flagMatch + ' "$(cat <<\'EOF\'\n' + newMessage + '\nEOF\n)"';

      return command.replace(heredocPattern, replacement);
    }

    // Pattern 2: -m "message" (simple quoted string)
    const simplePattern = /(-m|--message)\s+["']([^"']+)["']/;
    const simpleMatch = command.match(simplePattern);

    if (simpleMatch) {
      const originalMessage = simpleMatch[2];

      // 验证消息安全性（修复 2.1.2）
      validateCommitMessage(originalMessage);

      const newMessage = addCommitAttribution(originalMessage, modelId);

      // 安全转义消息（修复 2.1.2）
      const escapedMessage = escapeShellString(newMessage);

      // Replace the message in the command
      return command.replace(simplePattern, `$1 "${escapedMessage}"`);
    }
  } catch (error) {
    // 修复 2.1.2: 检测到注入尝试时必须抛出错误，不能返回原始命令
    // 这样可以防止危险命令被执行
    if (error instanceof Error && error.message.includes('Command injection detected')) {
      // 命令注入错误必须向上传播，不能静默处理
      throw error;
    }

    // 其他错误（解析错误等）记录日志并返回原始命令
    console.error('[Git Helper] Command processing error:', error);
    return command;
  }

  // If we can't parse the message format, return original command
  return command;
}

/**
 * Check if a git commit command already has attribution
 *
 * @param command - Git commit command
 * @returns true if attribution is already present
 */
export function hasCommitAttribution(command: string): boolean {
  return command.includes('Co-Authored-By: Claude') ||
         command.includes('noreply@anthropic.com');
}
