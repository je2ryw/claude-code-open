# Claude Code (Restored)

基于 `@anthropic-ai/claude-code` v2.0.76 的逆向工程还原实现。

**仅用于教育和研究目的。**

## 免责声明

这是一个教育项目，用于研究和学习 CLI 工具的架构设计。这**不是**官方 Claude Code 的源代码，而是基于公开 API 和类型定义的重新实现。

如需使用官方 Claude Code，请安装官方版本：
```bash
npm install -g @anthropic-ai/claude-code
```

## 安装

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 全局链接（可选）
npm link
```

## 使用

```bash
# 交互模式
npm run dev

# 或构建后运行
node dist/cli.js

# 带初始 prompt
node dist/cli.js "你好，请帮我分析这个项目"

# 打印模式
node dist/cli.js -p "解释这段代码"

# 指定模型
node dist/cli.js -m opus "复杂任务"
```

## 配置

设置 API 密钥：
```bash
export ANTHROPIC_API_KEY=your-api-key
# 或
export CLAUDE_API_KEY=your-api-key
```

## 项目结构

```
src/
├── cli.ts              # CLI 入口点
├── core/
│   ├── client.ts       # Anthropic API 客户端
│   ├── session.ts      # 会话管理
│   └── loop.ts         # 对话循环
├── tools/
│   ├── base.ts         # 工具基类
│   ├── bash.ts         # Bash 命令执行
│   ├── file.ts         # 文件读写编辑
│   ├── search.ts       # Glob/Grep 搜索
│   ├── web.ts          # Web 获取/搜索
│   ├── todo.ts         # 任务管理
│   └── agent.ts        # 子代理
├── config/
│   └── index.ts        # 配置管理
├── utils/
│   └── index.ts        # 工具函数
└── types/
    └── index.ts        # 类型定义
```

## 已实现的工具

| 工具 | 状态 | 说明 |
|------|------|------|
| Bash | ✅ | 命令执行，支持后台运行 |
| BashOutput | ✅ | 获取后台命令输出 |
| KillShell | ✅ | 终止后台进程 |
| Read | ✅ | 文件读取，支持图片/PDF |
| Write | ✅ | 文件写入 |
| Edit | ✅ | 文件编辑（字符串替换） |
| Glob | ✅ | 文件模式匹配 |
| Grep | ✅ | 内容搜索（基于 ripgrep） |
| WebFetch | ✅ | 网页获取 |
| WebSearch | ⚠️ | 需要搜索 API |
| TodoWrite | ✅ | 任务管理 |
| Task | ✅ | 子代理（框架） |

## 斜杠命令

- `/help` - 显示帮助
- `/clear` - 清除对话历史
- `/save` - 保存会话
- `/stats` - 显示统计
- `/tools` - 列出工具
- `/model` - 切换模型
- `/exit` - 退出

## 与官方版本的差异

1. **无 UI 框架**: 官方使用 Ink (React for CLI)，此版本使用简单的 readline
2. **无 MCP 完整支持**: MCP 协议框架已搭建，但未完整实现
3. **无遥测**: 不收集使用数据
4. **无沙箱**: Bash 命令不使用 Bubblewrap 沙箱
5. **简化的代理**: 子代理功能需要进一步开发

## 开发

```bash
# 开发模式（使用 tsx）
npm run dev

# 构建
npm run build

# 类型检查
npx tsc --noEmit
```

## License

本项目仅用于教育目的。原始 Claude Code 归 Anthropic PBC 所有。

---

*此项目是对混淆代码的逆向工程研究，不代表官方实现。*
