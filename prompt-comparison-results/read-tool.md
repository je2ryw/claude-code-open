# Read 工具提示词对比报告

## 概述
对比项目实现与官方 Claude Code v2.0.76 中 Read 工具的提示词（description）差异。

---

## 官方提示词（完整版）

**来源**: `/node_modules/@anthropic-ai/claude-code/cli.js` (第495-510行，WzB变量)

```
Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To read a directory, use an ls command via the Bash tool.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
```

**注意**:
- `yLA` = 2000（默认读取行数）
- `d43` = 2000（字符截断长度）
- `O4` = "Bash"（Bash工具名称）
- PDF 相关说明通过 `VJA()` 函数动态添加（仅在 firstParty 模式下）

---

## 项目提示词（当前实现）

**来源**: `/home/user/claude-code-open/src/tools/file.ts` (第277-285行)

```
Reads a file from the local filesystem.

Usage:
- The file_path parameter must be an absolute path
- By default, reads up to 2000 lines from the beginning
- You can optionally specify a line offset and limit
- Lines longer than 2000 characters will be truncated
- Results are returned with line numbers starting at 1
- Can read images (PNG, JPG), PDFs, and Jupyter notebooks
```

---

## 差异分析

### 🔴 缺失的关键内容

#### 1. **权限和访问声明**（高优先级）
官方有，项目缺失：
```
You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.
```

**影响**: 这些声明明确告诉 Claude：
- 可以直接访问任何文件
- 应该信任用户提供的路径
- 读取不存在的文件会返回错误（而非拒绝尝试）

#### 2. **最佳实践建议**（中优先级）
官方有，项目缺失：
```
- but it's recommended to read the whole file by not providing these parameters
```

**影响**: 引导 Claude 优先读取完整文件而非分页

#### 3. **格式说明细节**（中优先级）
- 官方: `Results are returned using cat -n format, with line numbers starting at 1`
- 项目: `Results are returned with line numbers starting at 1`

**影响**: 缺少 `cat -n format` 说明，可能影响 Claude 对输出格式的理解

#### 4. **图片处理说明**（高优先级）
- 官方: `This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.`
- 项目: `Can read images (PNG, JPG), PDFs, and Jupyter notebooks`

**影响**:
- 缺少"内容以视觉方式呈现"的说明
- 缺少"Claude Code 是多模态 LLM"的上下文

#### 5. **PDF 处理详情**（中优先级）
- 官方: `This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.`
- 项目: 仅在最后一句简单提及

**影响**: 缺少 PDF 处理方式的详细说明（逐页处理、提取文本和视觉内容）

#### 6. **目录限制说明**（高优先级）
官方有，项目缺失：
```
- This tool can only read files, not directories. To read a directory, use an ls command via the Bash tool.
```

**影响**:
- 未明确告知不能读取目录
- 未提供替代方案（使用 Bash 的 ls 命令）

#### 7. **并行调用优化建议**（高优先级）
官方有，项目缺失：
```
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
```

**影响**: 这是性能优化的重要指导，鼓励 Claude 并行读取多个文件

#### 8. **截图处理说明**（中优先级）
官方有，项目缺失：
```
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
```

**影响**:
- 未明确说明处理截图的场景
- 未说明支持临时文件路径

#### 9. **空文件警告**（低优先级）
官方有，项目缺失：
```
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
```

**影响**: 未提前告知空文件的特殊处理方式

---

## 优先级修复建议

### 🔴 高优先级（影响核心行为）

1. **添加权限和访问声明**
   - 明确告知 Claude 可以访问任何文件
   - 说明不存在的文件会返回错误

2. **添加目录限制说明**
   - 说明不能读取目录
   - 提供 Bash ls 的替代方案

3. **添加并行调用建议**
   - 鼓励并行读取多个文件
   - 强调这是最佳实践

4. **完善图片处理说明**
   - 说明多模态能力
   - 强调视觉呈现方式

### 🟡 中优先级（影响使用体验）

5. **完善 PDF 处理说明**
   - 说明逐页处理机制
   - 提及文本和视觉内容提取

6. **添加格式说明细节**
   - 明确 `cat -n format`

7. **添加截图处理说明**
   - 说明临时文件路径支持
   - 强调截图的 ALWAYS 使用策略

8. **添加最佳实践建议**
   - 推荐读取完整文件

### 🟢 低优先级（边缘情况）

9. **添加空文件警告说明**

---

## 修复后的完整提示词（建议）

```typescript
description = `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To read a directory, use an ls command via the Bash tool.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.`;
```

---

## 补充说明

### 常量定义
在官方实现中，以下常量在代码中定义：
- `yLA = 2000` - 默认读取行数
- `d43 = 2000` - 字符截断长度
- `T3 = "Read"` - 工具名称
- `O4 = "Bash"` - Bash 工具名称

项目中可以将这些硬编码在提示词中，或者通过模板字符串引用常量。

### PDF 条件显示
官方使用 `VJA()` 函数检查是否为 firstParty 模式来决定是否显示 PDF 相关说明。项目中可以：
1. 始终显示 PDF 说明（简化实现）
2. 通过环境变量控制（如 `CLAUDE_PDF_SUPPORT`）

---

## 总结

项目当前实现的提示词过于简化，缺少了约 **70%** 的官方指导内容。主要缺失：

1. ❌ 权限和访问假设声明
2. ❌ 目录读取限制和替代方案
3. ❌ 并行调用优化建议
4. ❌ 详细的媒体文件处理说明
5. ❌ 截图处理指导
6. ❌ 最佳实践建议
7. ❌ 空文件处理说明

建议采用修复后的完整提示词，以确保 Claude 能够：
- 正确理解工具的能力和限制
- 采用最佳实践（并行读取、完整文件读取）
- 正确处理边缘情况（目录、空文件、截图）
- 充分利用多模态能力
