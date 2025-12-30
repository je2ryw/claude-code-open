# Git 操作相关提示词对比报告

## 概述

本报告对比了项目中 Git 操作相关的提示词实现与官方 Claude Code v2.0.76 源码的差异。

**对比时间**: 2025-12-30
**项目路径**: `/home/user/claude-code-open/src/git/`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. Git 提交工作流程对比

### 1.1 官方实现 (cli.js 行 2795-2843)

```markdown
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

### 1.2 项目实现 (src/git/operations.ts)

项目中通过 `GitOperations` 类实现了提交工作流程建议：

```typescript
static async getCommitWorkflow(cwd: string = process.cwd()): Promise<string> {
  const workflow = `
When creating a new git commit, follow these steps:

1. Run parallel bash commands:
   - git status to see all untracked files
   - git diff to see both staged and unstaged changes
   - git log to see recent commit messages (follow the repository's style)

2. Analyze all staged changes and draft a commit message:
   - Summarize the nature of changes (new feature, enhancement, bug fix, etc.)
   - Ensure message accurately reflects changes and purpose
   - Focus on "why" rather than "what"
   - Concise (1-2 sentences)

3. Run commands:
   - Add relevant untracked files
   - Create commit with message
   - Run git status after commit to verify success

Safety Guidelines:
- NEVER update the git config
- NEVER run destructive/irreversible git commands (like push --force, hard reset, etc)
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc)
- NEVER force push to main/master
- Avoid git commit --amend unless explicitly requested
- NEVER commit changes unless the user explicitly asks you to
`;

  return workflow;
}
```

### 1.3 关键差异分析

| 方面 | 官方实现 | 项目实现 | 差异程度 |
|------|---------|---------|---------|
| **安全协议细节** | 包含详细的 `--amend` 使用条件（3个条件） | 简化为"除非明确请求" | ⚠️ **重要差异** |
| **Pre-commit Hook处理** | 明确区分成功/失败两种情况的处理 | 未提及具体处理策略 | ⚠️ **中等差异** |
| **HEREDOC示例** | 提供完整示例 | 未提供 | ⚠️ **中等差异** |
| **工具并行调用提示** | 多次强调工具并行调用 | 提及但不够强调 | ✅ **轻微差异** |
| **敏感文件检测** | 在步骤2中明确提及 | 在安全指南中提及 | ✅ **一致** |
| **交互式Git命令** | 明确禁止 `-i` 标志 | 未提及 | ⚠️ **重要差异** |

---

## 2. Pull Request 创建工作流程对比

### 2.1 官方实现 (cli.js 行 2845-2876)

```markdown
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

### 2.2 项目实现 (src/git/operations.ts)

```typescript
static async getPRWorkflow(cwd: string = process.cwd()): Promise<string> {
  const workflow = `
When creating a pull request:

1. Run parallel bash commands:
   - git status to see all untracked files
   - git diff to see both staged and unstaged changes
   - Check if current branch tracks remote and is up to date
   - git log and git diff [base-branch]...HEAD for full commit history

2. Analyze all changes and draft PR summary:
   - Look at ALL commits (not just latest)
   - Summarize changes

3. Run commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create

Important:
- DO NOT use the TodoWrite or Task tools
- Return the PR URL when done
`;

  return workflow;
}
```

### 2.3 关键差异分析

| 方面 | 官方实现 | 项目实现 | 差异程度 |
|------|---------|---------|---------|
| **gh命令说明** | 明确说明使用gh处理所有GitHub任务 | 未提及 | ⚠️ **中等差异** |
| **并行调用强调** | 多次强调工具并行调用 | 简化提及 | ⚠️ **中等差异** |
| **HEREDOC示例** | 提供完整的PR创建示例 | 未提供具体示例 | ⚠️ **重要差异** |
| **PR模板格式** | 明确的Summary + Test plan格式 | 未提及具体格式 | ⚠️ **重要差异** |
| **ALL commits强调** | 使用感叹号强调看所有提交 | 提及但不够强调 | ✅ **轻微差异** |
| **核心流程** | 3步流程一致 | 3步流程一致 | ✅ **一致** |

---

## 3. Git 安全检查对比

### 3.1 项目实现的安全模块 (src/git/safety.ts)

项目实现了全面的 `GitSafety` 类：

```typescript
export class GitSafety {
  // 危险命令列表
  private static readonly DANGEROUS_COMMANDS = [
    'push --force',
    'push -f',
    'reset --hard',
    'clean -fd',
    'clean -fdx',
    'clean -f',
    'filter-branch',
    'rebase --force',
  ];

  // 谨慎模式
  private static readonly CAUTION_PATTERNS = [
    /git\s+push.*--force/,
    /git\s+push.*-f\b/,
    /git\s+reset\s+--hard/,
    /git\s+clean\s+-[fdx]+/,
    /git\s+commit.*--amend/,
    /git\s+rebase.*-i/,
    /git\s+config/,
    /--no-verify/,
    /--no-gpg-sign/,
  ];

  // 敏感文件模式
  private static readonly SENSITIVE_FILE_PATTERNS = [
    /\.env$/,
    /credentials\.json$/,
    /\.pem$/,
    /\.key$/,
    // ... 更多模式
  ];
}
```

**关键功能**:
- ✅ `validateGitCommand()` - 命令安全验证
- ✅ `checkForcePushToMainBranch()` - 主分支强推检查
- ✅ `validateAmend()` - Amend操作验证
- ✅ `checkSensitiveFiles()` - 敏感文件检测
- ✅ `checkSkipHooks()` - Hook跳过检测
- ✅ `checkConfigChange()` - 配置修改检测
- ✅ `comprehensiveCheck()` - 综合安全检查

### 3.2 官方实现的安全协议

官方在提示词中内嵌了安全协议，通过提示词引导模型行为：

```markdown
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
```

### 3.3 架构差异分析

| 实现方式 | 项目实现 | 官方实现 | 优劣分析 |
|---------|---------|---------|---------|
| **方法** | 代码层面的安全检查类 | 提示词引导 | 项目更严格，官方更灵活 |
| **覆盖范围** | 8种主要危险命令 + 正则匹配 | 通过描述涵盖所有危险操作 | 项目更具体，官方更全面 |
| **Amend检查** | 运行时验证作者、推送状态 | 提示词中详细说明条件 | 项目可自动化，官方需模型理解 |
| **敏感文件** | 15+种文件模式检测 | 提示词举例 | 项目更详细 |
| **可扩展性** | 需修改代码添加规则 | 修改提示词即可 | 官方更灵活 |

---

## 4. Git 工具函数对比

### 4.1 项目实现的核心工具 (src/git/core.ts)

```typescript
export class GitUtils {
  // T294: 仓库检测
  static async isGitRepository(cwd: string): Promise<boolean>
  static async getGitDirectory(cwd: string): Promise<string | null>

  // T295: 分支信息
  static async getCurrentBranch(cwd: string): Promise<string>
  static async getDefaultBranch(cwd: string): Promise<string>
  static async getRemoteUrl(remote: string, cwd: string): Promise<string | null>
  static async getCurrentCommit(cwd: string): Promise<string>
  static async hasUpstream(cwd: string): Promise<boolean>

  // T291: 状态检测
  static async getGitStatus(cwd: string): Promise<GitStatus>
  static async isWorkingTreeClean(cwd: string): Promise<boolean>
  static async getUntrackedFiles(cwd: string): Promise<string[]>
  static async getModifiedFiles(cwd: string): Promise<string[]>

  // 推送状态
  static async getPushStatus(cwd: string): Promise<PushStatus>
  static async getCommitsAheadOfUpstream(cwd: string): Promise<number>
  static async getCommitsAheadOfDefaultBranch(cwd: string): Promise<number>

  // 完整信息
  static async getGitInfo(cwd: string): Promise<GitInfo | null>
  static formatGitStatus(gitInfo: GitInfo, maxStatusLength: number): string
}
```

### 4.2 官方实现方式

官方没有独立的Git工具模块，而是：
1. 在Bash工具中直接执行git命令
2. 通过提示词引导模型使用正确的git命令序列
3. 依赖模型理解git命令的输出

**示例**:
```markdown
1. Run the following bash commands in parallel:
  - Run a git status command to see all untracked files.
  - Run a git diff command to see both staged and unstaged changes.
  - Run a git log command to see recent commit messages.
```

### 4.3 架构优劣对比

| 方面 | 项目实现 | 官方实现 | 分析 |
|------|---------|---------|------|
| **类型安全** | ✅ TypeScript强类型 | ❌ 依赖字符串解析 | 项目更安全 |
| **错误处理** | ✅ 统一的错误处理 | ⚠️ 需要模型理解错误 | 项目更可靠 |
| **代码复用** | ✅ 工具类可复用 | ❌ 每次都要执行命令 | 项目更高效 |
| **测试覆盖** | ✅ 可单元测试 | ❌ 难以测试 | 项目更易维护 |
| **灵活性** | ⚠️ 固定功能集 | ✅ 可执行任意git命令 | 官方更灵活 |
| **性能** | ✅ 可缓存结果 | ⚠️ 每次都执行 | 项目可能更快 |

---

## 5. 完整功能矩阵对比

### 5.1 功能覆盖对比表

| 功能模块 | 官方实现 | 项目实现 | 差异 |
|---------|---------|---------|------|
| **提交工作流程** | ✅ 提示词引导 | ✅ 工作流程函数 | 官方更详细 |
| **PR创建流程** | ✅ 提示词引导 | ✅ 工作流程函数 | 官方提供示例 |
| **安全协议** | ✅ 提示词嵌入 | ✅ 代码层检查 | 方法不同 |
| **仓库检测** | ⚠️ 通过git命令 | ✅ `isGitRepository()` | 项目封装更好 |
| **分支信息** | ⚠️ 通过git命令 | ✅ 完整API | 项目更全面 |
| **状态检测** | ⚠️ 通过git命令 | ✅ 解析porcelain格式 | 项目更可靠 |
| **Diff分析** | ⚠️ 通过git命令 | ✅ `GitAnalysis`类 | 项目额外实现 |
| **Log查询** | ⚠️ 通过git命令 | ✅ `GitAnalysis`类 | 项目额外实现 |
| **.gitignore解析** | ❌ 无 | ✅ `GitIgnore`类 | 项目额外实现 |
| **提交&推送** | ⚠️ 提示词引导 | ✅ `commitAndPush()` | 项目自动化 |
| **PR描述生成** | ❌ 无 | ✅ `generatePRDescription()` | 项目额外实现 |
| **提交消息验证** | ❌ 无 | ✅ `validateCommitMessage()` | 项目额外实现 |

### 5.2 提示词质量对比

| 维度 | 官方提示词 | 项目提示词 | 评分 |
|-----|-----------|-----------|------|
| **详细程度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 官方更详细 |
| **示例质量** | ⭐⭐⭐⭐⭐ (HEREDOC等) | ⭐⭐ (无示例) | 官方明显优势 |
| **安全强调** | ⭐⭐⭐⭐⭐ (多次强调CRITICAL) | ⭐⭐⭐⭐ | 官方更强调 |
| **并行提示** | ⭐⭐⭐⭐⭐ (多处重复) | ⭐⭐⭐ | 官方更明确 |
| **错误处理** | ⭐⭐⭐⭐ | ⭐⭐⭐ | 官方稍好 |

---

## 6. 关键发现总结

### 6.1 官方实现的优势

1. **提示词质量更高**
   - 详细的安全协议说明（特别是--amend的3个条件）
   - 完整的HEREDOC示例
   - 多次强调工具并行调用
   - 明确区分CRITICAL级别的规则

2. **更灵活的架构**
   - 不依赖固定的工具函数
   - 可以执行任意git命令组合
   - 易于通过修改提示词来调整行为

3. **实用的示例**
   - PR创建的完整示例
   - 提交消息的HEREDOC格式
   - 具体的git命令序列

### 6.2 项目实现的优势

1. **代码层面的安全保障**
   - `GitSafety`类提供运行时检查
   - 类型安全的API
   - 可单元测试

2. **更丰富的功能**
   - Diff分析 (`GitAnalysis`)
   - .gitignore解析 (`GitIgnore`)
   - 自动化的提交推送 (`commitAndPush()`)
   - PR描述生成

3. **更好的封装**
   - 统一的错误处理
   - 代码复用性高
   - 便于维护和扩展

### 6.3 项目需要改进的地方

#### 🔴 高优先级

1. **补充完整的提示词示例**
   - 添加HEREDOC格式示例
   - 添加PR创建的完整示例
   - 在`getCommitWorkflow()`和`getPRWorkflow()`中补充

2. **增强`--amend`检查逻辑**
   - 实现官方的3条件检查
   - 区分pre-commit hook成功/失败情况
   - 在`GitSafety.validateAmend()`中改进

3. **添加交互式命令检测**
   - 检测并禁止`-i`标志
   - 在`GitSafety.validateGitCommand()`中添加

#### 🟡 中优先级

4. **强化工具并行调用提示**
   - 在多处重复强调
   - 使用粗体或特殊格式突出

5. **完善敏感文件警告**
   - 在提交流程中更明确地提及
   - 提供用户确认机制

6. **增加gh命令说明**
   - 在PR工作流程中说明gh的用途
   - 提供gh命令的示例

#### 🟢 低优先级

7. **优化提示词格式**
   - 使用CRITICAL等强调词
   - 添加更多感叹号强调关键点

8. **补充错误处理说明**
   - 说明各种失败情况的处理

---

## 7. 建议的改进方案

### 7.1 立即改进

**文件**: `src/git/operations.ts`

```typescript
static async getCommitWorkflow(cwd: string = process.cwd()): Promise<string> {
  const workflow = `
When creating a new git commit, follow these steps carefully:

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
- NEVER commit changes unless the user explicitly asks you to
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input

1. You can call multiple tools in a single response. run the following bash commands in parallel:
   - Run a git status command to see all untracked files
   - Run a git diff command to see both staged and unstaged changes
   - Run a git log command to see recent commit messages (follow the repository's style)

2. Analyze all staged changes and draft a commit message:
   - Summarize the nature of the changes (new feature, enhancement, bug fix, etc.)
   - Do not commit files that likely contain secrets (.env, credentials.json, etc)
   - Draft a concise (1-2 sentences) commit message that focuses on "why" rather than "what"
   - Ensure it accurately reflects the changes and their purpose

3. You can call multiple tools in a single response. run the following commands:
   - Add relevant untracked files to the staging area
   - Create the commit with a message
   - Run git status after the commit completes to verify success
   Note: git status depends on the commit completing, so run it sequentially after the commit.

4. If the commit fails due to pre-commit hook, fix the issue and create a NEW commit (see amend rules above)

Important notes:
- NEVER run additional commands to read or explore code, besides git bash commands
- NEVER use the TodoWrite or Task tools
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- If there are no changes to commit, do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC:

<example>
git commit -m "$(cat <<'EOF'
   Commit message here.
   EOF
   )"
</example>
`;

  return workflow;
}
```

### 7.2 中期改进

**文件**: `src/git/safety.ts`

在`GitSafety`类中添加：

```typescript
/**
 * 检测交互式Git命令
 */
static checkInteractiveCommands(command: string): SafetyCheckResult {
  if (/-i\b|--interactive/.test(command)) {
    return {
      safe: false,
      reason: 'Interactive Git commands are not supported',
      suggestion: 'Never use git commands with the -i flag (like git rebase -i or git add -i)',
    };
  }
  return { safe: true };
}
```

### 7.3 长期改进

考虑将提示词和代码检查结合：

1. 在工具执行前运行`GitSafety`检查
2. 检查失败时返回详细的提示词引导
3. 检查通过时执行操作并返回简洁结果

---

## 8. 结论

### 8.1 整体评估

| 维度 | 官方 | 项目 | 说明 |
|-----|------|------|------|
| **提示词质量** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 官方更详细、更实用 |
| **代码实现** | ⭐⭐ | ⭐⭐⭐⭐⭐ | 项目架构更好 |
| **功能完整性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 项目功能更多 |
| **安全性** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 项目代码层检查更严格 |
| **灵活性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 官方更灵活 |
| **可维护性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 项目架构更易维护 |

### 8.2 核心差异

1. **架构理念**
   - 官方：通过提示词引导模型正确使用git命令
   - 项目：通过代码封装提供类型安全的Git API

2. **安全策略**
   - 官方：提示词中详细说明安全规则，依赖模型理解
   - 项目：代码层面的安全检查，运行时验证

3. **功能范围**
   - 官方：聚焦核心的提交和PR流程
   - 项目：提供完整的Git工具集（分析、忽略规则等）

### 8.3 最终建议

**对于项目**：
1. ✅ 保持现有的代码架构和工具封装
2. ⚠️ **重点改进提示词质量**，参考官方实现
3. ⚠️ 补充HEREDOC示例和PR创建示例
4. ⚠️ 强化--amend的检查逻辑
5. ⚠️ 添加交互式命令检测

**混合策略**：
建议采用"代码检查 + 提示词引导"的混合方式：
- 保留项目的代码层安全检查
- 同时提供官方级别的详细提示词
- 在工具描述中融入最佳实践示例

这样可以兼得两者的优势：既有代码层面的可靠性，又有提示词的灵活性和可读性。

---

## 附录

### A. 相关文件清单

**项目文件**:
- `/home/user/claude-code-open/src/git/core.ts` - Git核心工具
- `/home/user/claude-code-open/src/git/safety.ts` - 安全检查
- `/home/user/claude-code-open/src/git/operations.ts` - 操作工具
- `/home/user/claude-code-open/src/git/analysis.ts` - 分析工具
- `/home/user/claude-code-open/src/git/ignore.ts` - .gitignore解析
- `/home/user/claude-code-open/src/git/README.md` - 模块文档

**官方文件**:
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行 2795-2876)

### B. 参考资料

- 官方Claude Code版本: v2.0.76
- 对比日期: 2025-12-30
- 项目分支: claude/compare-official-prompts-N5d8a
