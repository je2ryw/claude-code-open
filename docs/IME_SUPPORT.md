# CJK 输入法（IME）支持文档

## 概述

本项目已实现对 CJK（中日韩）输入法的支持，确保用户在使用中文、日文、韩文输入法时能够正常输入和提交内容。

## 功能特性

### 1. 自动检测 CJK 字符

系统会自动检测输入的字符是否为 CJK 字符，包括：

- **中文**：CJK 统一表意文字 (U+4E00-U+9FFF)
- **中文扩展 A**：U+3400-U+4DBF
- **日文平假名**：U+3040-U+309F
- **日文片假名**：U+30A0-U+30FF
- **韩文音节**：U+AC00-U+D7AF

### 2. 组合状态管理

当检测到 CJK 字符输入时，系统会：

1. 进入"组合中"状态
2. 在输入框前显示 `[组合中]` 指示器（紫红色）
3. 延迟 500ms 自动退出组合状态

### 3. Enter 键智能处理

在组合状态期间按下 Enter 键时：

- **不会**立即提交输入
- 会结束组合状态
- 允许用户继续输入或再次按 Enter 提交

这避免了在使用输入法选择候选词时误提交的问题。

## 技术实现

### 核心组件

实现位于 `/src/ui/components/Input.tsx` 文件中。

### 关键函数

#### 1. `isCJKChar(char: string): boolean`

检测单个字符是否为 CJK 字符。

```typescript
const isCJKChar = (char: string): boolean => {
  if (!char || char.length === 0) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||  // CJK 统一表意文字
    (code >= 0x3400 && code <= 0x4dbf) ||  // CJK 扩展 A
    (code >= 0x3040 && code <= 0x309f) ||  // 日文平假名
    (code >= 0x30a0 && code <= 0x30ff) ||  // 日文片假名
    (code >= 0xac00 && code <= 0xd7af)     // 韩文音节
  );
};
```

#### 2. `startComposition()`

开始组合输入，清除之前的定时器。

#### 3. `scheduleEndComposition()`

延迟 500ms 结束组合状态，等待可能的后续输入。

#### 4. `endComposition()`

立即结束组合状态并清除定时器。

### 状态管理

```typescript
// IME 组合状态
const [isComposing, setIsComposing] = useState(false);
const compositionTimerRef = React.useRef<NodeJS.Timeout | null>(null);
```

### 视觉反馈

组合状态下会显示 `[组合中]` 指示器：

```typescript
const imeIndicator = isComposing ? '[组合中] ' : '';
```

在输入框渲染时显示：

```tsx
{imeIndicator && (
  <Text color="magenta" bold>
    {imeIndicator}
  </Text>
)}
```

## 使用指南

### 用户操作流程

1. **开始输入 CJK 字符**
   - 使用输入法输入中文、日文或韩文
   - 系统自动检测并进入组合状态
   - 显示 `[组合中]` 指示器

2. **选择候选词**
   - 在输入法候选窗口中选择词汇
   - 可以按空格或数字键选择
   - 组合状态会延迟 500ms 后自动结束

3. **提交输入**
   - 第一次按 Enter：结束组合状态（如果在组合中）
   - 第二次按 Enter：提交整个输入

### 示例场景

#### 场景 1：中文输入

```
1. 用户输入拼音：ni hao
2. 输入法显示候选：你好、泥号、尼好...
3. 用户选择"你好"
4. 系统进入组合状态，显示 [组合中] > 你好
5. 500ms 后自动退出组合状态
6. 用户可以继续输入或按 Enter 提交
```

#### 场景 2：日文输入

```
1. 用户输入罗马字：konnichiha
2. 输入法显示候选：こんにちは
3. 用户按空格选择汉字：今日は
4. 系统进入组合状态
5. 用户按 Enter 结束组合
6. 再按 Enter 提交
```

## 兼容性说明

### 终端模拟器

IME 支持依赖于终端模拟器的能力。推荐使用：

- **macOS**：iTerm2、Terminal.app
- **Windows**：Windows Terminal、ConEmu
- **Linux**：GNOME Terminal、Konsole、Alacritty

### 输入法

支持所有标准的 CJK 输入法：

- **中文**：搜狗输入法、微软拼音、百度输入法等
- **日文**：Google 日本語入力、Microsoft IME 等
- **韩文**：系统自带韩文输入法等

## 注意事项

1. **终端限制**：在某些较旧的终端中，IME 可能无法正常工作
2. **SSH 会话**：通过 SSH 连接时，IME 支持取决于本地终端和远程编码设置
3. **组合超时**：组合状态会在 500ms 后自动结束，如需调整可修改 `scheduleEndComposition()` 函数中的延迟时间

## 故障排除

### 问题：输入 CJK 字符后立即提交

**原因**：组合状态未被正确检测

**解决方案**：
1. 检查终端是否支持 UTF-8 编码
2. 确认输入法是否为标准 CJK 输入法
3. 尝试增加组合超时时间

### 问题：`[组合中]` 指示器一直显示

**原因**：组合状态未正确结束

**解决方案**：
1. 按 Enter 键手动结束组合
2. 按 Escape 键退出输入
3. 重启应用程序

## 开发参考

### 修改组合超时时间

在 `Input.tsx` 中找到 `scheduleEndComposition()` 函数：

```typescript
const scheduleEndComposition = () => {
  if (compositionTimerRef.current) {
    clearTimeout(compositionTimerRef.current);
  }
  // 修改这里的延迟时间（单位：毫秒）
  compositionTimerRef.current = setTimeout(() => {
    setIsComposing(false);
  }, 500); // 将 500 改为需要的值
};
```

### 添加更多语言支持

在 `isCJKChar()` 函数中添加新的 Unicode 范围：

```typescript
const isCJKChar = (char: string): boolean => {
  if (!char || char.length === 0) return false;
  const code = char.charCodeAt(0);
  return (
    // 现有范围...
    // 添加新范围，例如泰文：
    (code >= 0x0E00 && code <= 0x0E7F) ||
    // 添加更多...
  );
};
```

## 相关资源

- [Unicode 标准](https://www.unicode.org/charts/)
- [CJK 统一表意文字](https://en.wikipedia.org/wiki/CJK_Unified_Ideographs)
- [Node.js 终端输入处理](https://nodejs.org/api/readline.html)
- [Ink 终端 UI 框架](https://github.com/vadimdemedes/ink)

## 版本历史

- **v2.0.76+** - 首次实现 CJK 输入法支持
  - 自动检测 CJK 字符
  - 组合状态管理
  - 视觉指示器
  - Enter 键智能处理

## 贡献

如果您发现 IME 支持的问题或有改进建议，欢迎提交 Issue 或 Pull Request。
