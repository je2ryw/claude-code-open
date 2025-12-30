# Git 提交署名功能 (Co-Authored-By)

## 功能简介

Claude Code 现在支持在 git commit 和 Pull Request 中自动添加 Co-Authored-By 署名，与官方 Claude Code v2.0.76 实现一致。

## 默认行为

默认情况下，Claude Code 会在 git commit 消息中自动添加以下署名：

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

在 Pull Request 描述中会添加：

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 配置选项

### 1. 使用新的 `attribution` 配置（推荐）

在 `~/.claude/settings.json` 中添加：

```json
{
  "attribution": {
    "commit": "🤖 Generated with [Claude Code](https://claude.com/claude-code)\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>",
    "pr": "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
  }
}
```

### 2. 禁用署名

要完全禁用署名，设置为空字符串：

```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  }
}
```

或使用已废弃的配置（向后兼容）：

```json
{
  "includeCoAuthoredBy": false
}
```

### 3. 自定义署名

你可以自定义署名文本：

```json
{
  "attribution": {
    "commit": "Generated with AI assistance\nCo-Authored-By: My Team AI <ai@example.com>",
    "pr": "Generated with AI assistance"
  }
}
```

## 使用示例

### Git Commit

当 Claude Code 执行 `git commit` 时，会自动在提交消息中追加署名：

```bash
git commit -m "$(cat <<'EOF'
feat: 添加新功能

实现了用户请求的功能

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

### Pull Request

创建 PR 时，描述中会包含署名：

```bash
gh pr create --title "feat: 添加新功能" --body "$(cat <<'EOF'
## Summary
- 实现了新功能
- 添加了单元测试

## Test plan
- [x] 单元测试通过
- [ ] 集成测试待确认

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 模型名称支持

署名会根据当前使用的模型自动调整：

- `claude-opus-4-5-20251101` → Claude Opus 4.5
- `claude-sonnet-4-5-20250929` → Claude Sonnet 4.5
- `claude-haiku-4-5-20251001` → Claude Haiku 4.5

## 实现细节

### 配置优先级

1. `attribution.commit` / `attribution.pr`（新配置）
2. `includeCoAuthoredBy`（已废弃，向后兼容）
3. 默认署名

### 文件位置

- **配置类型定义**：`src/types/config.ts`
- **Attribution 工具函数**：`src/utils/attribution.ts`
- **Bash 工具提示词**：`src/tools/bash.ts`

### API

```typescript
import { getCommitAttribution, getPRAttribution, isAttributionEnabled } from './utils/attribution.js';

// 获取 commit 署名
const commitAttr = getCommitAttribution();
const commitAttrOpus = getCommitAttribution('claude-opus-4-5-20251101');

// 获取 PR 署名
const prAttr = getPRAttribution();

// 检查是否启用
const enabled = isAttributionEnabled('commit');
```

## 测试

运行测试脚本验证功能：

```bash
npm run build
node test-attribution.js
```

## 兼容性

- ✅ 与官方 Claude Code v2.0.76 实现完全一致
- ✅ 支持自定义署名文本
- ✅ 支持完全禁用
- ✅ 向后兼容 `includeCoAuthoredBy` 配置
- ✅ 自动根据模型调整署名

## 常见问题

### Q: 如何禁用署名？

A: 在配置中设置：
```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  }
}
```

### Q: 署名是强制的吗？

A: 不是。你可以通过配置完全禁用或自定义署名内容。

### Q: 为什么使用 `noreply@anthropic.com`？

A: 这是官方实现使用的邮箱地址，表明这是自动生成的署名，不对应实际的提交者。

### Q: 可以改成中文署名吗？

A: 可以，通过 `attribution.commit` 自定义任意文本：
```json
{
  "attribution": {
    "commit": "🤖 由 Claude Code 生成\n共同作者：Claude Sonnet 4.5 <noreply@anthropic.com>"
  }
}
```

## 更新日志

### v2.0.76
- ✨ 新增 Co-Authored-By 署名功能
- ✨ 支持 `attribution.commit` 和 `attribution.pr` 配置
- ✨ 自动根据模型名称调整署名
- ♻️ 向后兼容 `includeCoAuthoredBy` 配置

## 参考

- [官方 Claude Code 实现](https://github.com/anthropics/claude-code)
- [Git Trailers 文档](https://git-scm.com/docs/git-interpret-trailers)
- [Co-Authored-By GitHub 文档](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors)
