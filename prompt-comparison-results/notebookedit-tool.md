# NotebookEdit 工具提示词对比报告

## 概述

本报告对比了项目实现与官方源码中 NotebookEdit 工具的提示词差异。

**对比文件：**
- 项目实现：`/home/user/claude-code-open/src/tools/notebook.ts`
- 官方源码：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`（v2.0.76，已混淆）

---

## 1. 工具描述（description）

### 官方版本
```
Replace the contents of a specific cell in a Jupyter notebook.
```

### 项目版本
```
Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source.

Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing.

The notebook_path parameter must be an absolute path, not a relative path. The cell_number is 0-indexed. Use edit_mode=insert to add a new cell at the index specified by cell_number. Use edit_mode=delete to delete the cell at the index specified by cell_number.

Usage:
- notebook_path: Absolute path to the .ipynb file (required)
- cell_id: ID of the cell to edit, or numeric index (0-based)
- new_source: New source code/text for the cell (required)
- cell_type: "code" or "markdown" (required for insert mode)
- edit_mode: "replace" (default), "insert", or "delete"

Features:
- Automatically clears outputs for code cells
- Validates Jupyter notebook format
- Preserves cell metadata
- Generates unique cell IDs for new cells
```

### 差异分析

**严重程度：🔴 高**

1. **长度差异巨大**：
   - 官方：1 行简洁描述
   - 项目：包含多段详细说明、使用方法、功能特性

2. **内容完全不同**：
   - 官方采用极简风格，仅说明核心功能
   - 项目包含了官方 `prompt()` 方法中的内容

3. **信息位置错误**：
   - 项目将详细提示词放在了 `description` 字段
   - 官方将详细信息放在单独的 `prompt()` 方法中

---

## 2. 详细提示词（prompt）

### 官方版本

官方源码中有独立的 prompt 字段：

```javascript
async prompt() {
  return "Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source. Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing. The notebook_path parameter must be an absolute path, not a relative path. The cell_number is 0-indexed. Use edit_mode=insert to add a new cell at the index specified by cell_number. Use edit_mode=delete to delete the cell at the index specified by cell_number.";
}
```

### 项目版本

项目没有单独的 `prompt` 方法或字段，而是将所有信息合并到 `description` 中。

### 差异分析

**严重程度：🔴 高**

1. **架构不同**：
   - 官方：`description` (简短) + `prompt()` (详细)
   - 项目：仅有 `description` (包含所有信息)

2. **提示词结构**：
   - 官方 prompt 是单段连续文本
   - 项目在 description 中添加了结构化的 Usage 和 Features 部分

---

## 3. 输入参数描述（Input Schema）

### notebook_path

#### 官方
```
The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)
```

#### 项目
```
The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)
```

**差异：✅ 完全一致**

---

### cell_id

#### 官方
```
The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.
```

#### 项目
```
The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.
```

**差异：✅ 完全一致**

---

### new_source

#### 官方
```
The new source for the cell
```

#### 项目
```
The new source for the cell
```

**差异：✅ 完全一致**

---

### cell_type

#### 官方
```
The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.
```

#### 项目
```
The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.
```

**差异：✅ 完全一致**

---

### edit_mode

#### 官方
```
The type of edit to make (replace, insert, delete). Defaults to replace.
```

#### 项目
```
The type of edit to make (replace, insert, delete). Defaults to replace.
```

**差异：✅ 完全一致**

---

## 4. 整体对比总结

### 主要差异

| 项目 | 官方实现 | 项目实现 | 一致性 |
|------|---------|---------|--------|
| description | 简短一句话 | 详细多段说明 | ❌ 不一致 |
| prompt 方法 | 存在，返回详细说明 | 不存在 | ❌ 缺失 |
| 参数描述 | 5个参数 | 5个参数 | ✅ 一致 |
| 参数说明文本 | 标准描述 | 标准描述 | ✅ 一致 |

### 核心问题

1. **description 过于冗长**：
   - 官方：简洁的一句话描述
   - 项目：包含了完整的使用说明和功能列表
   - 建议：精简为官方风格

2. **缺少 prompt 方法**：
   - 官方有独立的 `prompt()` 方法返回详细说明
   - 项目缺少这个方法
   - 建议：添加 `prompt()` 方法

3. **额外的 Usage 和 Features**：
   - 项目在 description 中添加了结构化说明
   - 官方版本没有这些额外信息
   - 建议：移除或移到 prompt 中

---

## 5. 修复建议

### 建议修改方案

```typescript
export class NotebookEditTool extends BaseTool<NotebookEditInput, ToolResult> {
  name = 'NotebookEdit';

  // 简化为官方的简短描述
  description = 'Replace the contents of a specific cell in a Jupyter notebook.';

  // 添加 prompt 方法（如果 BaseTool 支持）
  getPrompt(): string {
    return 'Completely replaces the contents of a specific cell in a Jupyter notebook (.ipynb file) with new source. Jupyter notebooks are interactive documents that combine code, text, and visualizations, commonly used for data analysis and scientific computing. The notebook_path parameter must be an absolute path, not a relative path. The cell_number is 0-indexed. Use edit_mode=insert to add a new cell at the index specified by cell_number. Use edit_mode=delete to delete the cell at the index specified by cell_number.';
  }

  getInputSchema(): ToolDefinition['inputSchema'] {
    // 保持现有实现，参数描述已经一致
    return {
      type: 'object',
      properties: {
        notebook_path: {
          type: 'string',
          description: 'The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)',
        },
        cell_id: {
          type: 'string',
          description: 'The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.',
        },
        new_source: {
          type: 'string',
          description: 'The new source for the cell',
        },
        cell_type: {
          type: 'string',
          enum: ['code', 'markdown'],
          description: 'The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.',
        },
        edit_mode: {
          type: 'string',
          enum: ['replace', 'insert', 'delete'],
          description: 'The type of edit to make (replace, insert, delete). Defaults to replace.',
        },
      },
      required: ['notebook_path', 'new_source'],
    };
  }
}
```

### 优先级

- 🔴 **高优先级**：简化 `description` 字段为官方的简短版本
- 🟡 **中优先级**：考虑添加 `prompt` 方法（取决于架构支持）
- 🟢 **低优先级**：移除额外的 Usage 和 Features 说明

---

## 6. 注意事项

1. **官方源码已混淆**：官方 cli.js 是压缩/混淆后的代码，变量名被替换为 `wP2`、`qP2` 等，但功能逻辑清晰可见

2. **架构差异**：需要检查项目的 `BaseTool` 基类是否支持 `prompt` 方法或类似机制

3. **向后兼容性**：修改 description 可能影响现有用户，建议测试后再部署

---

**生成时间**：2025-12-30
**官方版本**：v2.0.76
**对比方法**：代码静态分析
