# GitHub 集成提示词对比报告

## 概述

本报告对比了项目中的 GitHub 集成相关提示词与官方 Claude Code v2.0.76 源码的差异。

## 官方源码中的 GitHub 集成提示词

### 1. Creating Pull Requests (Bash 工具描述)

**位置：** `cli.js` 第 2845-2878 行

**官方完整提示词：**

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

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments
```

### 2. Code Review 提示词

**位置：** `cli.js` 第 3879-3889 行（在 review 相关代码中）

**官方提示词：**

```
You are an expert code reviewer. Follow these steps:

1. If no PR number is provided in the args, use Bash("gh pr list") to show open PRs
2. If a PR number is provided, use Bash("gh pr view <number>") to get PR details
3. Use Bash("gh pr diff <number>") to get the diff
4. Analyze the changes and provide a thorough code review that includes:
   - Overview of what the PR does
   - Analysis of code quality and style
   - Specific suggestions for improvements
   - Any potential issues or risks
```

### 3. PR Comments 查看提示词

**位置：** `cli.js` 第 3799-3807 行

**官方提示词：**

```
Follow these steps:

1. Use `gh pr view --json number,headRepository` to get the PR number and repository info
2. Use `gh api /repos/{owner}/{repo}/issues/{number}/comments` to get PR-level comments
3. Use `gh api /repos/{owner}/{repo}/pulls/{number}/comments` to get review comments. Pay particular attention to the following fields: `body`, `diff_hunk`, `path`, `line`, etc. If the comment references some code, consider fetching it using eg `gh api /repos/{owner}/{repo}/contents/{path}?ref={branch} | jq .content -r | base64 -d`
4. Parse and format all comments in a readable way
5. Return ONLY the formatted comments, with no additional text

Format the comments as:
```

### 4. GitHub Actions 工作流模板

**位置：** `cli.js` 第 3610-3625 行

官方提供了完整的 GitHub Actions 工作流配置示例，包括：
- 使用 `anthropics/claude-code-action@v1`
- API 密钥配置
- 权限设置
- 可选参数说明

## 项目实现的 GitHub 集成功能

### 1. GitHub 核心功能 (`src/github/index.ts`)

项目实现了以下功能函数：

```typescript
// 检查 GitHub CLI 是否可用
export async function checkGitHubCLI(): Promise<{
  installed: boolean;
  authenticated: boolean
}>

// 设置 GitHub Actions 工作流
export async function setupGitHubWorkflow(projectDir: string): Promise<{
  success: boolean;
  message: string;
  workflowPath?: string;
}>

// 获取 PR 信息
export async function getPRInfo(prNumber: number)

// 获取 PR 评论
export async function getPRComments(prNumber: number)

// 添加 PR 评论
export async function addPRComment(prNumber: number, body: string)

// 创建 PR
export async function createPR(options: {
  title: string;
  body: string;
  base?: string;
  head?: string;
  draft?: boolean;
})
```

**GitHub Actions 工作流模板（第 13-58 行）：**
- 提供了完整的 Claude Code Review 工作流配置
- 包含 PR 事件和评论事件触发器
- 支持 @claude 提及触发审查

### 2. Slash Commands (`src/commands/development.ts`)

#### /review 命令（第 9-43 行）

项目提示词：
```typescript
const reviewPrompt = `You are an expert code reviewer. Follow these steps:

${!prNumber ? `1. Use Bash("gh pr list") to show open pull requests` : `1. Use Bash("gh pr view ${prNumber}") to get PR details`}
${!prNumber ? `2. Ask which PR to review` : `2. Use Bash("gh pr diff ${prNumber}") to get the diff`}
${!prNumber ? `` : `3. Analyze the changes and provide a thorough code review that includes:
   - Overview of what the PR does
   - Analysis of code quality and style
   - Specific suggestions for improvements
   - Any potential issues or risks`}

Keep your review concise but thorough. Focus on:
  - Code correctness
  - Following project conventions
  - Performance implications
  - Test coverage
  - Security considerations

Format your review with clear sections and bullet points.
${prNumber ? `\nPR number: ${prNumber}` : ''}`;
```

**差异：**
- ✅ 基本结构与官方一致
- ✅ 使用了官方的 gh 命令模式
- ➕ 项目增加了额外的关注点（性能、测试覆盖率、安全性）
- ➕ 项目要求使用清晰的章节和要点格式

#### /pr 命令（第 181-246 行）

项目提示词：
```typescript
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

**差异：**
- ✅ 核心工作流程与官方一致
- ✅ 包含了官方的所有关键步骤
- ➕ 项目将步骤分为三个明确阶段（Gather、Analyze、Push）
- ➕ 项目提供了更详细的 git 命令示例
- ➕ 项目在 PR body 中添加了 "Generated with Claude Code" 标记
- ➕ 项目提供了更具体的测试计划模板
- ➕ 项目增加了对未提交更改的检查提示

#### /pr-comments 命令（第 249-303 行）

项目提示词：
```typescript
const prCommentsPrompt = `I need to view the comments on PR #${prNumber}.

Follow these steps:

1. Use \`gh pr view ${prNumber} --json number,headRepository\` to get the PR number and repository info
2. Use \`gh api /repos/{owner}/{repo}/issues/${prNumber}/comments\` to get PR-level comments
3. Use \`gh api /repos/{owner}/{repo}/pulls/${prNumber}/comments\` to get review comments. Pay particular attention to the following fields: \`body\`, \`diff_hunk\`, \`path\`, \`line\`, etc. If the comment references some code, consider fetching it using eg \`gh api /repos/{owner}/{repo}/contents/{path}?ref={branch} | jq .content -r | base64 -d\`
4. Parse and format all comments in a readable way
5. Return ONLY the formatted comments, with no additional text

Format the comments as:

---
**[Author]** commented on [date]:
> [comment body]
[If code review comment, show file path and line number]
---

Additional guidelines:
1. Get the repository owner/name from \`gh repo view --json owner,name\`
2. Include both PR-level and code review comments
3. Preserve the threading/nesting of comment replies
4. Show the file and line number context for code review comments
5. Use jq to parse the JSON responses from the GitHub API

Begin by getting the PR information.`;
```

**差异：**
- ✅ 核心逻辑与官方完全一致
- ✅ 使用相同的 gh API 调用模式
- ➕ 项目提供了更详细的格式化模板
- ➕ 项目增加了额外的指导方针
- ➕ 项目要求获取仓库所有者/名称信息

### 3. Git 操作工具 (`src/git/operations.ts`)

#### getCommitWorkflow()（第 201-231 行）

提供了与官方 git commit 提示词基本一致的工作流程建议，包括：
- 并行运行 git status、git diff、git log
- 分析变更并起草提交消息
- 执行 add、commit、验证

#### getPRWorkflow()（第 238-263 行）

提供了简化版的 PR 工作流程，与官方 PR 提示词的核心要点一致。

## 主要差异总结

### 1. 实现层面

| 方面 | 官方实现 | 项目实现 | 评价 |
|------|---------|---------|------|
| 提示词位置 | 嵌入在 Bash 工具描述中 | 独立的 slash commands | ✅ 更好的组织 |
| GitHub CLI 集成 | 直接使用 gh 命令 | 封装了专门的函数 | ✅ 更易维护 |
| 工作流文件 | 提供模板示例 | 完整的自动生成功能 | ✅ 更实用 |
| 命令接口 | 通过提示引导 | 专门的 /pr、/review 命令 | ✅ 更易用 |

### 2. 提示词内容差异

#### PR 创建提示词

**官方特点：**
- 简洁明了，3 个核心步骤
- 强调并行执行命令
- 提供 HEREDOC 格式示例
- 明确禁止使用 TodoWrite/Task 工具

**项目特点：**
- 分为 3 个明确阶段，更结构化
- 提供更详细的 git 命令示例
- 增加了对未提交更改的处理提示
- 提供更完整的测试计划模板
- 添加了 "Generated with Claude Code" 品牌标识

#### Code Review 提示词

**官方特点：**
- 4 步流程
- 专注于核心审查要点

**项目特点：**
- 在官方基础上增加了更多审查维度
- 要求使用清晰的格式化输出
- 提供了无 PR 编号时的交互流程

#### PR Comments 提示词

**官方特点：**
- 5 步流程
- 使用 gh API 获取评论
- 要求返回格式化的评论

**项目特点：**
- 完全继承官方逻辑
- 提供了详细的格式化模板
- 增加了额外的指导方针

### 3. 额外功能

项目实现了官方源码中未直接包含的功能：

1. **GitHub CLI 检测** (`checkGitHubCLI`)
   - 检查 gh 是否安装
   - 检查是否已认证

2. **工作流自动设置** (`setupGitHubWorkflow`)
   - 自动创建 `.github/workflows/` 目录
   - 生成 Claude Code Review 工作流文件
   - 检查 git 仓库状态

3. **PR 信息获取** (`getPRInfo`)
   - 结构化的 PR 信息返回
   - 包含作者、状态、变更统计

4. **PR 评论管理** (`getPRComments`, `addPRComment`)
   - 获取所有评论（带时间戳）
   - 添加新评论

5. **PR 创建函数** (`createPR`)
   - 支持 draft PR
   - 支持自定义 base/head 分支
   - 返回结构化结果

### 4. 安全性考虑

#### Security Review 命令

项目实现了一个完整的 `/security-review` 命令（第 306-505 行），这是官方源码中有的功能，项目进行了详细实现：

**特点：**
- 完整的漏洞分类（SQL 注入、XSS、认证绕过等）
- 详细的分析方法论（3 个阶段）
- 严格的置信度评分标准
- 全面的假阳性过滤规则
- 要求使用子任务进行并行分析

## 兼容性评估

### ✅ 高度兼容

1. **核心工作流程** - 项目完全遵循官方的 PR 创建流程
2. **命令格式** - 使用相同的 gh CLI 命令模式
3. **HEREDOC 格式** - PR body 使用相同的 HEREDOC 格式
4. **关键要点** - 强调分析所有提交、并行执行命令等

### ➕ 增强功能

1. **更好的组织** - 使用独立的 slash commands
2. **更详细的指导** - 提供了更多的步骤说明和示例
3. **自动化工具** - 提供了 GitHub Actions 工作流自动设置
4. **结构化数据** - PR 信息、评论等以结构化方式返回

### ⚠️ 潜在差异

1. **品牌标识** - 项目在 PR body 中添加了 "Generated with Claude Code" 标记
2. **额外功能** - 项目提供了更多辅助函数，可能超出官方的简洁设计理念

## 建议

### 1. 保持一致性

- ✅ 项目的核心提示词与官方高度一致
- ✅ 建议继续保持这种一致性

### 2. 改进空间

1. **提示词同步**
   - 定期检查官方源码更新
   - 确保提示词与最新版本保持一致

2. **可选功能**
   - 考虑将 "Generated with Claude Code" 设为可选
   - 允许用户自定义 PR 模板

3. **文档完善**
   - 在项目文档中明确标注与官方的差异
   - 说明增强功能的使用场景

### 3. 功能增强建议

1. **GitHub App 集成**
   - 官方支持 GitHub App，项目可考虑添加
   - 提供 GitHub App 安装引导

2. **PR 模板支持**
   - 支持读取仓库的 PR 模板
   - 允许自定义模板路径

3. **交互式工作流**
   - 在 PR 创建前提供预览
   - 允许用户编辑生成的内容

## 结论

项目的 GitHub 集成实现与官方源码高度一致，核心提示词和工作流程基本相同。项目在以下方面有所增强：

1. **更好的组织结构** - 使用 slash commands 和独立函数
2. **更详细的指导** - 提供更多步骤说明和示例
3. **额外的自动化** - GitHub Actions 工作流自动设置
4. **完整的安全审查** - 详细的安全审查提示词和流程

这些增强功能提高了可用性和易用性，同时保持了与官方实现的兼容性。建议继续保持这种平衡，定期同步官方更新，并在文档中明确标注差异。

## 附录：关键提示词对照表

| 功能 | 官方位置 | 项目位置 | 一致性 |
|------|---------|---------|-------|
| PR 创建工作流 | cli.js:2845-2878 | src/commands/development.ts:192-240 | ✅ 高度一致 |
| Code Review | cli.js:3879-3889 | src/commands/development.ts:20-38 | ✅ 一致+增强 |
| PR Comments | cli.js:3799-3807 | src/commands/development.ts:272-297 | ✅ 一致+增强 |
| Commit 工作流 | cli.js:2700-2844 | src/git/operations.ts:202-228 | ✅ 基本一致 |
| Security Review | cli.js 中存在 | src/commands/development.ts:314-499 | ✅ 完整实现 |

---

**生成时间：** 2025-12-30
**对比版本：** Claude Code v2.0.76
**项目版本：** 基于 v2.0.76 的逆向工程实现
