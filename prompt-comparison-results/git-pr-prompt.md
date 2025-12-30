# Git Pull Request 提示词对比报告

## 概述

本报告对比了项目实现与官方源码中关于创建 Pull Request 的提示词差异。

**对比文件：**
- 项目实现：`/home/user/claude-code-open/src/commands/development.ts` (prCommand)
- 官方源码：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行 2845-2876)

---

## 官方源码提示词

### 完整内容（从 cli.js 提取）

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

**注意：** 官方源码中的 `${O4}`, `${MX.name}`, `${n3}`, `${B}` 是模板变量，在运行时被替换为实际的工具名称。

---

## 项目实现提示词

### 完整内容（从 src/commands/development.ts 提取）

```javascript
const prPrompt = `I need to create a pull request for the current branch.

Follow these steps carefully to create the PR:

**Step 1: Gather Information (run these commands in parallel)**

1. Run \`git status\` to see all untracked files and working directory state
2. Run \`git diff\` to see both staged and unstaged changes
3. Check if the current branch tracks a remote branch: \`git branch -vv\`
4. Run \`git log --oneline ${baseBranch}..HEAD\` to see all commits since diverging from ${baseBranch}
5. Run \`git diff ${baseBranch}...HEAD\` to understand the full diff

**Step 2: Analyze and Draft PR**

Based on the gathered information:
- Analyze ALL commits that will be included in the PR (not just the latest one)
- Understand the complete scope of changes
- Draft a concise PR title (1 sentence, focused on the "why")
- Draft a PR summary with 1-3 bullet points

**Step 3: Push and Create PR (run in sequence)**

1. Create new branch if needed (use current branch name or suggest one)
2. Push to remote with -u flag if the branch isn't tracking a remote:
   \`git push -u origin <branch-name>\`
3. Create the PR using gh CLI with HEREDOC format:

\`\`\`bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points describing the changes>

## Test plan
- [ ] Verify the changes work as expected
- [ ] Run existing tests
- [ ] Manual testing steps if applicable

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
\`\`\`

**Important Notes:**
- Base branch for this PR: ${baseBranch}
- If there are uncommitted changes, ask whether to commit them first
- If the PR already exists, show its URL instead
- Return the PR URL when done so I can view it

Begin by running the git commands to understand the current state of the branch.`;
```

---

## 详细差异分析

### ✅ 相同之处

1. **核心流程结构**
   - 两者都分为三个主要步骤：收集信息 → 分析并起草 → 推送并创建
   - 都强调并行执行独立命令以提高性能
   - 都要求分析所有提交，而不仅仅是最新提交
   - 都使用 HEREDOC 格式创建 PR

2. **关键命令**
   - 都使用 `git status` 查看未跟踪文件
   - 都使用 `git diff` 查看变更
   - 都使用 `git log` 和 `git diff [base-branch]...HEAD` 理解完整提交历史
   - 都使用 `gh pr create` 创建 PR

3. **PR 模板结构**
   - 都包含 `## Summary` 部分（1-3 个要点）
   - 都包含 `## Test plan` 部分

4. **重要提示**
   - 都强调返回 PR URL

---

### ⚠️ 主要差异

#### 1. **开头说明**

**官方版本：**
```
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.
```

**项目版本：**
```
I need to create a pull request for the current branch.
```

**分析：** 官方版本提供了更广泛的上下文说明，强调使用 `gh` 命令处理所有 GitHub 相关任务。项目版本更直接，但缺少这个重要的上下文。

---

#### 2. **工具名称引用**

**官方版本：**
```
run the following bash commands in parallel using the Bash tool
```

**项目版本：**
```
run these commands in parallel
```

**分析：** 官方版本明确提到使用 "Bash tool"，而项目版本没有指定工具名称。

---

#### 3. **Step 1 的具体命令描述**

**官方版本：**
- 第3步：`Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote`
- 第4步：`Run a git log command and \`git diff [base-branch]...HEAD\``

**项目版本：**
- 第3步：`Check if the current branch tracks a remote branch: \`git branch -vv\``（提供了具体命令）
- 第4步：`Run \`git log --oneline ${baseBranch}..HEAD\`` 和 `Run \`git diff ${baseBranch}...HEAD\``（分为两个独立的步骤）

**分析：**
- 项目版本提供了更具体的命令实现（`git branch -vv`）
- 项目版本将 git log 和 git diff 分为两个独立步骤（第4步和第5步）
- 项目版本使用了变量 `${baseBranch}` 动态指定基础分支

---

#### 4. **Step 2 的详细程度**

**官方版本：**
```
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request summary
```

**项目版本：**
```
**Step 2: Analyze and Draft PR**

Based on the gathered information:
- Analyze ALL commits that will be included in the PR (not just the latest one)
- Understand the complete scope of changes
- Draft a concise PR title (1 sentence, focused on the "why")
- Draft a PR summary with 1-3 bullet points
```

**分析：** 项目版本更加详细和结构化：
- 明确分为多个子任务
- 特别强调起草 PR 标题（官方版本没有提到）
- 提供了具体的指导（标题聚焦于 "why"）

---

#### 5. **Step 3 的执行方式**

**官方版本：**
```
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands in parallel:
```

**项目版本：**
```
**Step 3: Push and Create PR (run in sequence)**
```

**分析：**
- 官方版本要求**并行**执行命令
- 项目版本要求**顺序**执行命令
- **这是一个重要差异**，项目版本的顺序执行更合理（需要先推送才能创建 PR）

---

#### 6. **Test Plan 的具体内容**

**官方版本：**
```
## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]
```

**项目版本：**
```
## Test plan
- [ ] Verify the changes work as expected
- [ ] Run existing tests
- [ ] Manual testing steps if applicable
```

**分析：** 项目版本提供了具体的测试清单模板，更加实用。

---

#### 7. **PR Body 的额外内容**

**官方版本：**
```
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]
```

**项目版本：**
```
## Summary
<1-3 bullet points describing the changes>

## Test plan
- [ ] Verify the changes work as expected
- [ ] Run existing tests
- [ ] Manual testing steps if applicable

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**分析：** 项目版本在 PR body 末尾添加了署名标记 `🤖 Generated with [Claude Code]`。

---

#### 8. **Important Notes 的差异**

**官方版本：**
```
Important:
- DO NOT use the TodoWrite or Task tools
- Return the PR URL when you're done, so the user can see it
```

**项目版本：**
```
**Important Notes:**
- Base branch for this PR: ${baseBranch}
- If there are uncommitted changes, ask whether to commit them first
- If the PR already exists, show its URL instead
- Return the PR URL when done so I can view it
```

**分析：**
- 官方版本明确禁止使用 TodoWrite 和 Task 工具
- 项目版本提供了更多实用的注意事项（基础分支、未提交的变更、PR 已存在的情况）
- **项目版本缺少了官方的工具限制说明**

---

#### 9. **结束语**

**官方版本：** 无

**项目版本：**
```
Begin by running the git commands to understand the current state of the branch.
```

**分析：** 项目版本添加了明确的开始指令。

---

## 关键问题总结

### 🔴 严重问题

1. **缺少工具限制说明**
   - 官方版本明确禁止使用 `TodoWrite` 和 `Task` 工具
   - 项目版本没有这个限制
   - **建议：** 添加此限制以保持一致性

2. **并行 vs 顺序执行差异**
   - 官方版本在 Step 3 要求并行执行
   - 项目版本要求顺序执行
   - **分析：** 项目版本的顺序执行更合理，因为必须先推送分支才能创建 PR
   - **建议：** 保持项目版本的实现，但需要在文档中说明此差异

3. **缺少 GitHub 上下文说明**
   - 官方版本开头强调使用 `gh` 命令处理所有 GitHub 任务
   - 项目版本缺少这个重要说明
   - **建议：** 添加此说明以提供更好的上下文

### 🟡 中等问题

4. **命令具体性不一致**
   - 项目版本提供了更具体的命令（如 `git branch -vv`）
   - 官方版本更抽象
   - **分析：** 这是一个改进，提供具体命令对用户更有帮助

5. **基础分支变量化**
   - 项目版本使用 `${baseBranch}` 变量
   - 官方版本使用占位符 `[base-branch]`
   - **分析：** 项目版本的实现更好，支持动态指定基础分支

### 🟢 积极改进

6. **更详细的 Step 2**
   - 项目版本提供了更详细的分析指导
   - 特别强调起草标题
   - 这是对官方版本的改进

7. **具体的测试清单模板**
   - 项目版本提供了可操作的测试清单
   - 比官方版本的占位符更实用

8. **实用的注意事项**
   - 项目版本添加了处理未提交变更、PR 已存在等实际场景
   - 这些是有价值的补充

---

## 推荐修改

### 建议 1：添加 GitHub 上下文说明（高优先级）

在提示词开头添加：

```javascript
const prPrompt = `Use the gh command for all GitHub-related tasks including pull requests, issues, checks, and releases.

I need to create a pull request for the current branch.
...
```

### 建议 2：添加工具限制说明（高优先级）

在 Important Notes 中添加：

```javascript
**Important Notes:**
- DO NOT use the TodoWrite or Task tools
- Base branch for this PR: ${baseBranch}
...
```

### 建议 3：明确工具名称（中优先级）

在 Step 1 中添加：

```javascript
**Step 1: Gather Information (run these commands in parallel using the Bash tool)**
```

### 建议 4：保持顺序执行但添加说明（低优先级）

在 Step 3 中添加注释说明为何使用顺序执行：

```javascript
**Step 3: Push and Create PR (run in sequence - must push before creating PR)**
```

---

## 完整修改后的提示词建议

```javascript
const prPrompt = `Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases.

I need to create a pull request for the current branch.

Follow these steps carefully to create the PR:

**Step 1: Gather Information (run these commands in parallel using the Bash tool)**

1. Run \`git status\` to see all untracked files and working directory state
2. Run \`git diff\` to see both staged and unstaged changes
3. Check if the current branch tracks a remote branch: \`git branch -vv\`
4. Run \`git log --oneline ${baseBranch}..HEAD\` to see all commits since diverging from ${baseBranch}
5. Run \`git diff ${baseBranch}...HEAD\` to understand the full diff

**Step 2: Analyze and Draft PR**

Based on the gathered information:
- Analyze ALL commits that will be included in the PR (NOT just the latest one, but ALL commits!!!)
- Understand the complete scope of changes
- Draft a concise PR title (1 sentence, focused on the "why")
- Draft a PR summary with 1-3 bullet points

**Step 3: Push and Create PR (run in sequence)**

1. Create new branch if needed (use current branch name or suggest one)
2. Push to remote with -u flag if the branch isn't tracking a remote:
   \`git push -u origin <branch-name>\`
3. Create the PR using gh pr create with HEREDOC format:

\`\`\`bash
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]
EOF
)"
\`\`\`

**Important Notes:**
- DO NOT use the TodoWrite or Task tools
- Base branch for this PR: ${baseBranch}
- If there are uncommitted changes, ask whether to commit them first
- If the PR already exists, show its URL instead
- Return the PR URL when done so I can view it

Begin by running the git commands to understand the current state of the branch.`;
```

**注意：** 上述建议移除了项目添加的自定义内容（具体测试清单、Claude Code 署名），以更接近官方版本。如果要保留这些改进，可以选择性添加。

---

## 总体评估

**项目实现质量：** ⭐⭐⭐⭐☆ (4/5)

**优点：**
1. ✅ 核心流程与官方版本一致
2. ✅ 提供了更具体的命令实现
3. ✅ 添加了实用的测试清单模板
4. ✅ 处理了更多实际场景（未提交变更、PR 已存在）
5. ✅ 使用变量化的基础分支，更灵活

**缺点：**
1. ❌ 缺少 GitHub 上下文说明
2. ❌ 缺少工具限制（TodoWrite、Task）
3. ❌ Step 3 的并行/顺序执行与官方不一致（虽然项目版本更合理）
4. ❌ 缺少明确的工具名称引用

**结论：**

项目实现在核心功能上与官方版本高度一致，并在某些方面（具体命令、测试模板）做出了改进。主要需要补充的是 GitHub 上下文说明和工具使用限制。Step 3 的顺序执行虽然与官方不同，但实际上更符合 Git 工作流的逻辑（必须先推送才能创建 PR），建议保留此实现。

---

## 附录：官方模板变量说明

在官方 cli.js 中，以下模板变量会在运行时被替换：

- `${O4}` → "Bash" (工具名称)
- `${MX.name}` → "TodoWrite" (工具名称)
- `${n3}` → "Task" (工具名称)
- `${B}` → 可选的额外内容（如果存在）

项目实现中直接使用了硬编码的工具名称，这在大多数情况下是可以接受的。
