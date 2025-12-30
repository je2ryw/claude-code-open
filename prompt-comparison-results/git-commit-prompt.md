# Git Commit 提示词对比报告

## 概述

本报告对比了项目实现与官方 Claude Code CLI (v2.0.76) 中关于 Git Commit 的提示词差异。

对比时间：2025-12-30

## 文件位置

### 项目实现
- **主要文件 1**: `/home/user/claude-code-open/src/git/operations.ts` (行 203-228)
- **主要文件 2**: `/home/user/claude-code-open/src/prompt/templates.ts` (行 82-89)
- **辅助文件**: `/home/user/claude-code-open/src/git/safety.ts` (包含 amend 验证逻辑)

### 官方源码
- **文件**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行 2795-2843)

---

## 详细对比

### 1. 提示词结构对比

#### 官方实现 (cli.js 2795-2843)

官方提示词分为以下几个部分：

1. **标题和前置说明**
   - "# Committing changes with git"
   - "Only create commits when requested by the user. If unclear, ask first."

2. **Git Safety Protocol** (7条规则)
   - NEVER update the git config
   - NEVER run destructive/irreversible git commands (like push --force, hard reset, etc)
   - NEVER skip hooks (--no-verify, --no-gpg-sign, etc)
   - NEVER run force push to main/master, warn the user if they request it
   - **详细的 amend 规则**（3个条件都必须满足）
   - CRITICAL: 如果 commit 失败或被 hook 拒绝，NEVER amend
   - CRITICAL: 如果已经推送到远程，NEVER amend
   - NEVER commit changes unless the user explicitly asks

3. **步骤 1**: 并行运行 bash 命令
   - git status
   - git diff
   - git log

4. **步骤 2**: 分析并起草 commit message
   - 总结变更性质
   - 不要提交可能包含密钥的文件
   - 专注于 "why" 而非 "what"
   - 简洁（1-2句话）

5. **步骤 3**: 执行命令
   - Add relevant untracked files
   - Create commit with message
   - Run git status after commit

6. **步骤 4**: 如果因为 pre-commit hook 失败，修复问题并创建新的 commit

7. **Important notes** (5条注意事项)
   - NEVER run additional commands to read or explore code
   - NEVER use TodoWrite or Task tools
   - DO NOT push unless user asks
   - Never use git commands with -i flag
   - If no changes, don't create empty commit
   - ALWAYS use HEREDOC for commit message

#### 项目实现

项目实现分散在两个文件中：

**文件 1: src/prompt/templates.ts (行 82-89)**
```typescript
export const GIT_GUIDELINES = `# Git Operations
- NEVER update the git config
- NEVER run destructive/irreversible git commands (like push --force, hard reset) unless explicitly requested
- NEVER skip hooks (--no-verify, --no-gpg-sign) unless explicitly requested
- NEVER force push to main/master
- Avoid git commit --amend unless explicitly requested or adding pre-commit hook edits
- Before amending: ALWAYS check authorship (git log -1 --format='%an %ae')
- NEVER commit changes unless the user explicitly asks`;
```

**文件 2: src/git/operations.ts (行 201-231)**
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

---

### 2. 关键差异分析

#### 差异 1: amend 规则的详细程度 ⚠️ **重要**

**官方实现**:
```
- Avoid git commit --amend. ONLY use --amend when ALL conditions are met:
  (1) User explicitly requested amend, OR commit SUCCEEDED but pre-commit hook auto-modified files that need including
  (2) HEAD commit was created by you in this conversation (verify: git log -1 --format='%an %ae')
  (3) Commit has NOT been pushed to remote (verify: git status shows "Your branch is ahead")
- CRITICAL: If commit FAILED or was REJECTED by hook, NEVER amend - fix the issue and create a NEW commit
- CRITICAL: If you already pushed to remote, NEVER amend unless user explicitly requests it (requires force push)
```

**项目实现**:
```
- Avoid git commit --amend unless explicitly requested or adding pre-commit hook edits
- Before amending: ALWAYS check authorship (git log -1 --format='%an %ae')
```

**差异说明**:
- ❌ 项目缺少官方的详细 3 条件检查
- ❌ 项目缺少 CRITICAL 警告（commit 失败时 NEVER amend）
- ❌ 项目缺少 CRITICAL 警告（已推送时 NEVER amend）
- ✅ 项目有 authorship 检查（官方在条件 2 中）
- ❌ 项目缺少验证命令的具体说明

#### 差异 2: 步骤 4 - 处理 pre-commit hook 失败 ⚠️ **重要**

**官方实现**:
```
4. If the commit fails due to pre-commit hook, fix the issue and create a NEW commit (see amend rules above)
```

**项目实现**:
- ❌ 完全缺失这个步骤

#### 差异 3: Important notes 的完整性 ⚠️ **中等**

**官方实现** (5条):
1. NEVER run additional commands to read or explore code, besides git bash commands
2. NEVER use the TodoWrite or Task tools
3. DO NOT push to the remote repository unless the user explicitly asks
4. Never use git commands with the -i flag
5. If there are no changes to commit, don't create an empty commit
6. ALWAYS pass commit message via HEREDOC (附带示例)

**项目实现**:
- ❌ 完全缺失所有 Important notes

#### 差异 4: HEREDOC 示例 ⚠️ **中等**

**官方实现**:
```
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.${Q?`

   ${Q}`:""}
   EOF
   )"
</example>
```

**项目实现**:
- ❌ 缺少 HEREDOC 格式示例

#### 差异 5: 文件密钥检查 ⚠️ **中等**

**官方实现**:
```
- Do not commit files that likely contain secrets (.env, credentials.json, etc).
  Warn the user if they specifically request to commit those files
```

**项目实现**:
- ❌ 缺少密钥文件检查提醒

#### 差异 6: 提示词组织方式 ℹ️ **信息**

**官方实现**:
- 单一、完整、流程化的提示词
- 使用明确的编号步骤（1, 2, 3, 4）
- 使用 CRITICAL 强调关键规则

**项目实现**:
- 分散在两个文件中
- 需要动态拼接（`getCommitWorkflow` 方法）
- 缺少强调关键词（CRITICAL）

---

### 3. 相似之处

以下内容在两个实现中基本一致：

✅ **基本安全规则**:
- NEVER update git config
- NEVER run destructive commands
- NEVER skip hooks
- NEVER force push to main/master
- NEVER commit unless user asks

✅ **步骤 1 - 并行运行命令**:
- git status
- git diff
- git log

✅ **步骤 2 - 起草 commit message**:
- 总结变更性质
- 专注 "why" 而非 "what"
- 简洁（1-2句话）

✅ **步骤 3 - 执行提交**:
- Add untracked files
- Create commit
- Verify with git status

---

### 4. 项目独有实现

项目在 `/home/user/claude-code-open/src/git/safety.ts` 中实现了额外的安全检查：

```typescript
/**
 * T297: 检查 commit --amend 的安全性
 */
static async validateAmend(cwd: string = process.cwd()): Promise<SafetyCheckResult> {
  try {
    const author = await GitAnalysis.checkCommitAuthor(cwd);

    // 检查是否已推送
    const pushStatus = await GitUtils.getPushStatus(cwd);

    // ... 详细的安全检查逻辑
  }
}
```

这是一个**编程实现**，而官方是通过**提示词**来引导 AI 执行这些检查。

---

## 5. 改进建议

### 高优先级 🔴

1. **补充详细的 amend 规则**
   - 添加 3 条件检查说明
   - 添加两个 CRITICAL 警告
   - 明确验证命令

2. **添加步骤 4**
   - 处理 pre-commit hook 失败的指导

3. **添加 Important notes 部分**
   - 包含所有 5 条注意事项
   - 特别是 HEREDOC 示例

### 中优先级 🟡

4. **添加密钥文件检查提醒**
   - 在步骤 2 中添加

5. **优化提示词组织**
   - 考虑合并为单一提示词
   - 或确保调用时正确拼接

### 低优先级 🟢

6. **添加强调关键词**
   - 使用 CRITICAL 标记关键规则

---

## 6. 建议的修改方案

### 方案 A: 更新 `src/prompt/templates.ts` (推荐)

将 `GIT_GUIDELINES` 扩展为完整的 Git commit 提示词：

```typescript
export const GIT_COMMIT_WORKFLOW = `# Committing changes with git

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

1. Run the following bash commands in parallel:
  - Run a git status command to see all untracked files.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.

2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose

3. Run the following commands:
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
</example>`;
```

### 方案 B: 保留当前结构，增强 `src/git/operations.ts`

如果希望保持当前的模块化结构，则需要：
1. 保留 `src/prompt/templates.ts` 的基础规则
2. 大幅增强 `src/git/operations.ts` 中的 `getCommitWorkflow` 方法
3. 确保在系统提示词中正确组合这两部分

---

## 7. 测试建议

在实现改进后，应测试以下场景：

1. ✅ 基本 commit 流程
2. ✅ 用户明确请求 amend
3. ✅ Pre-commit hook 修改文件后的处理
4. ✅ Pre-commit hook 失败的处理
5. ✅ 尝试 amend 已推送的 commit
6. ✅ 尝试提交包含密钥的文件
7. ✅ 没有变更时的处理

---

## 8. 总结

### 主要问题

1. **缺失关键的 amend 安全规则**（官方有详细的 3 条件 + 2 个 CRITICAL 警告）
2. **缺失 pre-commit hook 失败处理指导**（步骤 4）
3. **缺失所有 Important notes**（包括 HEREDOC 示例）
4. **缺失密钥文件检查提醒**

### 影响评估

- **安全性**: ⚠️ 中等风险 - 缺少 amend 的详细规则可能导致误操作
- **功能性**: ⚠️ 中等影响 - 缺少 pre-commit hook 处理可能导致困惑
- **用户体验**: ℹ️ 低影响 - 缺少 HEREDOC 示例可能导致格式问题

### 建议行动

**立即执行**:
1. 补充完整的 amend 规则和 CRITICAL 警告
2. 添加步骤 4（pre-commit hook 失败处理）
3. 添加 Important notes 部分

**后续优化**:
4. 考虑合并提示词到单一位置
5. 添加自动化测试验证 Git 操作的正确性

---

## 附录

### A. 完整官方提示词

参见：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` 行 2795-2843

### B. 完整项目提示词

参见：
- `/home/user/claude-code-open/src/prompt/templates.ts` 行 82-89
- `/home/user/claude-code-open/src/git/operations.ts` 行 201-231

### C. 相关代码文件

- `/home/user/claude-code-open/src/git/safety.ts` - amend 安全检查实现
- `/home/user/claude-code-open/src/git/analysis.ts` - Git 分析工具
- `/home/user/claude-code-open/src/git/core.ts` - Git 核心工具

---

*报告生成时间: 2025-12-30*
*对比版本: Claude Code CLI v2.0.76*
