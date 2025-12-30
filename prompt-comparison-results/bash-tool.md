# Bash 工具提示词对比报告

## 对比概览

- **项目文件**: `/home/user/claude-code-open/src/tools/bash.ts`
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- **对比日期**: 2025-12-30

## 主要差异总结

项目版本的 Bash 工具描述相比官方版本**缺失了大量关键内容**，特别是：
1. 缺少详细的命令引用示例
2. 缺少避免使用 Bash 处理文件操作的详细指导
3. 缺少多命令执行的详细说明
4. **完全缺失** Git commit 工作流指导（约 50 行）
5. **完全缺失** Pull Request 创建指导（约 30 行）
6. **完全缺失** "Other common operations" 部分

---

## 详细差异对比

### 1. Directory Verification 部分

#### 项目版本（简化）
```
1. Directory Verification:
   - If the command will create new directories or files, first use 'ls' to verify the parent directory exists
```

#### 官方版本（详细）
```
1. Directory Verification:
   - If the command will create new directories or files, first use `ls` to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use `ls foo` to check that "foo" exists and is the intended parent directory
```

**差异说明**：
- ❌ 缺失："and is the correct location"
- ❌ 缺失：具体示例（mkdir foo/bar 的例子）
- ⚠️ 引号风格不一致：项目用单引号 `'ls'`，官方用反引号 `` `ls` ``

---

### 2. Command Execution 部分

#### 项目版本（极简）
```
2. Command Execution:
   - Always quote file paths that contain spaces with double quotes
   - After ensuring proper quoting, execute the command
```

#### 官方版本（详细示例）
```
2. Command Execution:
   - Always quote file paths that contain spaces with double quotes (e.g., cd "path with spaces/file.txt")
   - Examples of proper quoting:
     - cd "/Users/name/My Documents" (correct)
     - cd /Users/name/My Documents (incorrect - will fail)
     - python "/path/with spaces/script.py" (correct)
     - python /path/with spaces/script.py (incorrect - will fail)
   - After ensuring proper quoting, execute the command.
   - Capture the output of the command.
```

**差异说明**：
- ❌ 缺失：内联示例 `(e.g., cd "path with spaces/file.txt")`
- ❌ **缺失整个 "Examples of proper quoting" 部分**（4 个具体示例）
- ❌ 缺失："Capture the output of the command"

---

### 3. Usage Notes 部分

#### 项目版本
```
Usage notes:
  - The command argument is required.
  - Optional timeout in milliseconds (up to 600000ms / 10 minutes). Default: 120000ms (2 minutes).
  - Use run_in_background to run commands in the background.
  - Output exceeding ${MAX_OUTPUT_LENGTH} characters will be truncated.
  - Set dangerouslyDisableSandbox to true to run without sandboxing (use with caution).

Sandbox: ${isBubblewrapAvailable() ? 'Available (bubblewrap)' : 'Not available'}
```

#### 官方版本
```
Usage notes:
  - The command argument is required.
  - You can specify an optional timeout in milliseconds (up to ${xV1()}ms / ${xV1()/60000} minutes). If not specified, commands will timeout after ${dDA()}ms (${dDA()/60000} minutes).
  - It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
  - If the output exceeds ${WbA()} characters, output will be truncated before being returned to you.
  - You can use the `run_in_background` parameter to run the command in the background, which allows you to continue working while the command runs. You can monitor the output using the Bash tool as it becomes available. You do not need to use '&' at the end of the command when using this parameter.
  ${_B7()}  [可能是动态内容]
  - Avoid using Bash with the `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
    - File search: Use Glob (NOT find or ls)
    - Content search: Use Grep (NOT grep or rg)
    - Read files: Use Read (NOT cat/head/tail)
    - Edit files: Use Edit (NOT sed/awk)
    - Write files: Use Write (NOT echo >/cat <<EOF)
    - Communication: Output text directly (NOT echo/printf)
  - When issuing multiple commands:
    - If the commands are independent and can run in parallel, make multiple Bash tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two Bash tool calls in parallel.
    - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together (e.g., `git add . && git commit -m "message" && git push`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before Bash for git operations, or git add before git commit), run these operations sequentially instead.
    - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
    - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of `cd`. You may use `cd` if the User explicitly requests it.
    <good-example>
    pytest /foo/bar/tests
    </good-example>
    <bad-example>
    cd /foo/bar && pytest tests
    </bad-example>
```

**差异说明**：

#### 缺失的关键内容：
1. ❌ **缺失**："It is very helpful if you write a clear, concise description of what this command does in 5-10 words"
2. ❌ **缺失**：关于 run_in_background 的详细说明（"which allows you to continue working..." 以及不需要使用 '&' 的提示）
3. ❌ **完全缺失**："Avoid using Bash with find, grep, cat..." 整个部分
   - 这是非常重要的指导，告诉 AI 应该使用专用工具而不是 Bash 命令
   - 包含 6 个工具映射（Glob, Grep, Read, Edit, Write, Communication）
4. ❌ **完全缺失**："When issuing multiple commands" 整个部分
   - 并行执行指导
   - 顺序执行指导（&& vs ;）
   - 不使用换行符分隔命令
5. ❌ **完全缺失**："Try to maintain your current working directory..." 部分
   - 包含 good-example 和 bad-example

#### 多余的内容：
- ✅ 项目版本有：`dangerouslyDisableSandbox` 说明（官方版本可能在别处）
- ✅ 项目版本有：`Sandbox: Available (bubblewrap)` 状态显示（官方版本可能在别处）

#### 表述差异：
- 项目：`Output exceeding ${MAX_OUTPUT_LENGTH} characters will be truncated`
- 官方：`If the output exceeds ${WbA()} characters, output will be truncated before being returned to you`
- 差异：官方版本更明确地说明是"返回给你之前"截断

---

### 4. Git Commit 工作流部分

#### 项目版本
```
（完全缺失此部分）
```

#### 官方版本
```
# Committing changes with git

Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive/irreversible git commands (like push --force, hard reset, etc) unless the user explicitly requests them
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- Avoid git commit --amend. ONLY use --amend when ALL conditions are met:
  (1) User explicitly requested amend, OR commit SUCCEEDED but pre-commit hook auto-modified files that need including
  (2) HEAD commit was created by you in this conversation (verify: git log -1 --format='%an %ae')
  (3) Commit has NOT been pushed to remote (verify: git status shows "Your branch is ahead")
- CRITICAL: If commit FAILED or was REJECTED by hook, NEVER amend - fix the issue and create a NEW commit
- CRITICAL: If you already pushed to remote, NEVER amend unless user explicitly requests it (requires force push)
- NEVER commit changes unless the user explicitly asks you to. It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive.

1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel, each using the Bash tool:
  - Run a git status command to see all untracked files.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands:
   - Add relevant untracked files to the staging area.
   - Create the commit with a message.
   - Run git status after the commit completes to verify success.
   Note: git status depends on the commit completing, so run it sequentially after the commit.
4. If the commit fails due to pre-commit hook, fix the issue and create a NEW commit (see amend rules above)

Important notes:
- NEVER run additional commands to read or explore code, besides git bash commands
- NEVER use the TodoWrite or Task tools
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.
   EOF
   )"
</example>
```

**差异说明**：
- ❌ **项目版本完全缺失此部分（约 50 行关键内容）**
- 这是 Bash 工具最重要的使用场景之一
- 包含详细的安全协议、工作流程和最佳实践

---

### 5. Pull Request 创建部分

#### 项目版本
```
（完全缺失此部分）
```

#### 官方版本
```
# Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel using the Bash tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and `git diff [base-branch]...HEAD` to understand the full commit history for the current branch (from the time it diverged from the base branch)
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request summary
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]
EOF
)"
</example>

Important:
- DO NOT use the TodoWrite or Task tools
- Return the PR URL when you're done, so the user can see it
```

**差异说明**：
- ❌ **项目版本完全缺失此部分（约 30 行关键内容）**
- 这是另一个重要的 Bash 工具使用场景
- 包含完整的 PR 创建工作流和模板

---

### 6. Other Common Operations 部分

#### 项目版本
```
（完全缺失此部分）
```

#### 官方版本
```
# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments
```

**差异说明**：
- ❌ **项目版本完全缺失此部分**
- 官方版本提供了其他常用操作的示例

---

## 总体评估

### 完整性评分：**35/100**

#### 项目版本的问题：
1. ✅ **基本结构正确**：包含了 IMPORTANT 声明和基本的使用说明
2. ❌ **严重缺失内容**：
   - 缺少 50% 的 Usage Notes 内容
   - 完全缺失 Git Commit 工作流（~50 行）
   - 完全缺失 PR 创建指导（~30 行）
   - 缺少关键的最佳实践和示例
3. ⚠️ **细节不足**：
   - Directory Verification 缺少示例
   - Command Execution 缺少具体示例
   - 缺少 good-example/bad-example 对比

### 影响分析：

#### 高优先级缺失（Critical）：
1. **"Avoid using Bash with find, grep, cat..." 部分**
   - 影响：AI 可能过度使用 Bash 处理文件操作，而不是使用专用工具
   - 建议：必须添加此部分

2. **Git Commit 工作流**
   - 影响：AI 在处理 git commit 时缺少安全协议和最佳实践指导
   - 建议：必须添加完整的 Git Safety Protocol

3. **多命令执行指导**
   - 影响：AI 可能不知道如何正确并行/顺序执行多个命令
   - 建议：必须添加此部分

#### 中优先级缺失（Important）：
1. **Command Execution 示例**
   - 影响：AI 对路径引用的理解可能不够准确
   - 建议：添加正确/错误的对比示例

2. **PR 创建工作流**
   - 影响：AI 在创建 PR 时缺少标准流程
   - 建议：添加完整的 PR 创建指导

3. **cd 使用指导**
   - 影响：AI 可能过度使用 cd 命令
   - 建议：添加 good-example/bad-example

#### 低优先级缺失（Nice to have）：
1. **description 参数说明**
   - "It is very helpful if you write a clear, concise description..."
2. **Other common operations**
   - gh api 使用示例

---

## 建议修改清单

### 必须添加（Critical）：
- [ ] 添加 "Avoid using Bash with find, grep, cat..." 完整部分
- [ ] 添加完整的 Git Commit 工作流（包括 Git Safety Protocol）
- [ ] 添加 "When issuing multiple commands" 部分
- [ ] 添加 "Try to maintain your current working directory" 部分（包括示例）

### 应该添加（Important）：
- [ ] 补充 Directory Verification 的示例（mkdir foo/bar）
- [ ] 补充 Command Execution 的 4 个正确/错误示例
- [ ] 添加 "Capture the output of the command"
- [ ] 添加完整的 PR 创建工作流
- [ ] 补充 description 参数的说明

### 可选添加（Nice to have）：
- [ ] 添加 "Other common operations" 部分
- [ ] 统一引号风格（使用反引号 `` `command` ``）

---

## 代码位置参考

- **项目文件**: `/home/user/claude-code-open/src/tools/bash.ts` (第 348-368 行)
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 2748-2878 行)

---

## 附录：官方完整提示词

由于官方提示词使用了模板变量（如 `${xV1()}`、`${O4}` 等），实际运行时这些会被替换为具体值。
建议在实现时：
1. 将动态变量替换为常量或配置值
2. 将工具名称变量（如 `${O4}`）替换为 "Bash"
3. 将其他工具名称变量替换为对应的工具名（Glob, Grep, Read, Edit, Write 等）

---

**报告生成时间**: 2025-12-30
**对比版本**: Claude Code v2.0.76
