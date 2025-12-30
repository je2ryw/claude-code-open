# URL 生成限制提示词对比

## 对比概述

官方 Claude Code v2.0.76 在系统提示词中包含了明确的 URL 生成和猜测限制，但项目实现中**完全缺失**这一重要的安全和行为约束。

## 官方源码实现

### 位置
- **文件**: `node_modules/@anthropic-ai/claude-code/cli.js`
- **行号**: 第 4298 行
- **上下文**: 系统提示词的主要部分，位于身份描述和帮助信息之间

### 完整提示词

```javascript
IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.
```

### 上下文信息

这个限制出现在系统提示词的以下位置：

```javascript
You are an interactive CLI tool that helps users ${X!==null?'according to your "Output Style" below, which describes how you should respond to user queries.':"with software engineering tasks."} Use the instructions below and the tools available to you to assist the user.

${_W9}
IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.

If the user asks for help or wants to give feedback inform them of the following:
- /help: Get help with using Claude Code
- To give feedback, users should ${ISSUES_EXPLAINER}
```

## 项目实现分析

### 系统提示词构建

项目使用模块化的系统提示词构建器：

**文件**: `src/prompt/builder.ts`
**构建顺序**:
1. 核心身份 (CORE_IDENTITY)
2. 帮助信息
3. 输出风格 (OUTPUT_STYLE)
4. 任务管理 (TASK_MANAGEMENT)
5. 代码编写指南 (CODING_GUIDELINES)
6. 工具使用指南 (TOOL_GUIDELINES)
7. Git 操作指南 (GIT_GUIDELINES)
8. 子代理系统 (SUBAGENT_SYSTEM)
9. 权限模式
10. 环境信息
11. 附件内容

### 缺失情况

经过全面搜索，项目中**没有**以下任何形式的 URL 限制提示词：

❌ **未找到**:
- "NEVER generate or guess URLs"
- "generate URLs"
- "guess URLs"
- 任何关于 URL 生成的限制或警告

### 搜索证据

**搜索路径**: `/home/user/claude-code-open/src`

1. **大小写不敏感搜索** "NEVER generate|URL.*guess|guess.*URL":
   - 结果: 无匹配

2. **核心提示词模板** (`src/prompt/templates.ts`):
   - CORE_IDENTITY
   - TOOL_GUIDELINES
   - OUTPUT_STYLE
   - CODING_GUIDELINES
   - 均不包含 URL 限制

3. **系统提示词构建器** (`src/prompt/builder.ts`):
   - 第 126-128 行有帮助信息
   - 但紧随其后的是 OUTPUT_STYLE，没有 URL 限制

## 差异详细分析

### 官方实现特点

1. **位置策略**: 紧跟在身份描述之后，在帮助信息之前
2. **强调级别**: 使用 `IMPORTANT:` 前缀标记
3. **禁止范围**: 使用 `NEVER` 强调绝对禁止
4. **例外情况**: 明确允许编程相关的 URL 和用户提供的 URL
5. **安全考虑**: 防止 AI 生成可能不存在或不安全的 URL

### 项目实现缺失

**风险**:
1. ❌ 可能生成不存在的文档 URL
2. ❌ 可能猜测 API endpoint
3. ❌ 可能创建不安全的外部链接
4. ❌ 缺少安全边界约束

**影响范围**:
- WebFetch 工具使用
- WebSearch 工具使用
- 文档引用
- API 调用建议
- 外部资源访问

## 修复建议

### 1. 添加到核心模板

在 `src/prompt/templates.ts` 中添加新的常量：

```typescript
/**
 * URL 生成限制
 */
export const URL_GENERATION_POLICY = `IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.`;
```

### 2. 更新构建器

在 `src/prompt/builder.ts` 的 `build()` 方法中添加：

```typescript
// 2. 帮助信息
parts.push(`If the user asks for help or wants to give feedback inform them of the following:
- /help: Get help with using Claude Code
- To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues`);

// 2.5 URL 生成限制 (新增)
parts.push(URL_GENERATION_POLICY);

// 3. 输出风格
parts.push(OUTPUT_STYLE);
```

### 3. 添加到导出

在 `src/prompt/index.ts` 中：

```typescript
export {
  // ... 其他导出
  URL_GENERATION_POLICY
} from './templates.js';
```

## 重要性评估

### 安全影响: 🔴 高

- 防止生成恶意或不存在的 URL
- 保护用户免受潜在的钓鱼或恶意链接
- 减少对不存在资源的引用

### 行为一致性: 🔴 高

- 与官方 Claude Code 行为不一致
- 可能导致用户体验差异
- 违背用户对官方实现的期望

### 实现优先级: ⚠️ 中-高

**建议优先级**: P1（高优先级）

**理由**:
1. 涉及用户安全
2. 影响 WebFetch/WebSearch 工具行为
3. 属于核心系统提示词的一部分
4. 实现成本低（单行添加）

## 相关工具影响

### WebFetch 工具

**当前**: `src/tools/webfetch.ts`
- 可能被 AI 调用访问猜测的 URL
- 缺少提示词层面的约束

### WebSearch 工具

**当前**: `src/tools/websearch.ts`
- 搜索结果中的 URL 是安全的（来自搜索引擎）
- 但 AI 可能在响应中生成猜测的 URL

### 工具使用指南

**当前**: `src/prompt/templates.ts` - TOOL_GUIDELINES
```typescript
export const TOOL_GUIDELINES = `# Tool usage policy
...
- When WebFetch returns a message about a redirect to a different host, you should immediately make a new WebFetch request with the redirect URL provided in the response.
...`;
```

**分析**: 仅提及重定向处理，没有 URL 生成限制

## 测试建议

添加此限制后，应测试以下场景：

1. ✅ **允许**: 使用用户提供的 URL
   ```
   User: "Fetch https://example.com"
   AI: 使用 WebFetch 访问该 URL
   ```

2. ✅ **允许**: 编程相关的官方文档
   ```
   User: "查看 React 文档"
   AI: 使用 WebSearch 查找官方文档
   ```

3. ❌ **禁止**: 猜测不存在的 URL
   ```
   User: "这个项目的文档在哪里"
   AI: 应先使用 Glob/Grep 查找本地文档，而不是猜测 URL
   ```

4. ❌ **禁止**: 生成 API endpoint
   ```
   User: "调用这个服务"
   AI: 应要求用户提供 URL，或从配置文件中读取
   ```

## 兼容性注意事项

### 向后兼容性

✅ **完全兼容**: 添加此限制不会破坏现有功能

### 用户体验影响

- ✅ **正向**: 减少错误的 URL 引用
- ✅ **正向**: 提高安全性
- ⚠️ **注意**: 可能需要用户更明确地提供 URL

## 总结

| 方面 | 官方实现 | 项目实现 | 状态 |
|------|---------|---------|------|
| **URL 生成限制** | ✅ 存在 | ❌ 缺失 | 🔴 不一致 |
| **位置** | 帮助信息前 | N/A | - |
| **强调级别** | IMPORTANT 前缀 | N/A | - |
| **例外处理** | 明确定义 | N/A | - |
| **安全考虑** | 充分 | 不足 | 🔴 风险 |

### 关键发现

1. **完全缺失**: 项目中没有任何关于 URL 生成的限制
2. **安全风险**: 可能导致生成不安全或不存在的 URL
3. **行为差异**: 与官方实现行为不一致
4. **易于修复**: 只需添加一行提示词

### 建议行动

1. ⚡ **立即添加** URL_GENERATION_POLICY 到 templates.ts
2. ⚡ **立即集成** 到 builder.ts 的构建流程
3. 📝 **测试验证** AI 是否遵守此限制
4. 📝 **文档更新** 在 CLAUDE.md 中说明此安全特性

---

**生成时间**: 2025-12-30
**对比版本**: Claude Code v2.0.76
**项目路径**: /home/user/claude-code-open
