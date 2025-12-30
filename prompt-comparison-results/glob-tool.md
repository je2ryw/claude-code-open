# Glob 工具提示词对比报告

## 1. 官方源码描述

**文件位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

**完整描述**:
```
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.
```

## 2. 项目实现描述

**文件位置**: `/home/user/claude-code-open/src/tools/search.ts` (第 18-22 行)

**当前描述**:
```typescript
description = `Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns`;
```

## 3. 差异分析

### 3.1 缺失的内容

项目实现中**缺少**以下两条重要提示：

1. **关于 Agent 工具的提示** (官方第5条):
   ```
   - When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
   ```

2. **关于并行调用的提示** (官方第6条):
   ```
   - You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.
   ```

### 3.2 格式差异

- **官方格式**: 所有条目都以 `-` 开头，第一条也是列表项
- **项目格式**: 第一行是独立的段落，后续才是列表项

### 3.3 影响分析

缺失的提示会导致：

1. **工作流程优化不足**:
   - Agent 工具提示缺失，Claude 可能不知道在复杂搜索场景下应该使用 Agent 工具，而是继续使用 Glob/Grep 进行多轮搜索

2. **性能优化缺失**:
   - 并行调用提示缺失，Claude 可能倾向于串行执行多个搜索操作，而不是并行执行以提高效率

## 4. 建议修复

**修改文件**: `/home/user/claude-code-open/src/tools/search.ts`

**建议的完整描述**:
```typescript
description = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.`;
```

## 5. 总结

Glob 工具的提示词与官方实现存在 2 处关键差异，主要集中在：
- **工具协作提示**：缺少 Agent 工具的引导说明
- **性能优化提示**：缺少并行调用的建议

这些差异会影响 Claude 在复杂搜索场景下的决策和执行效率。
