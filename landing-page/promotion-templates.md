# 推广文案模板

## 1. 掘金 / CSDN 文章

**标题：** 开源了一个 Claude Code 逆向工程学习项目，25+ 工具完整复现

**正文：**

---

大家好，我最近开源了一个教育性项目 **Claude Code Open**，通过逆向工程的方式重新实现了 Claude Code CLI 的核心功能。

### 为什么做这个项目？

Claude Code 是 Anthropic 官方推出的 AI 编程助手 CLI 工具，但官方代码是混淆的，无法直接学习其架构设计。作为一个对 AI 工具链感兴趣的开发者，我决定通过逆向工程的方式还原它的实现，用于学习和研究。

### 项目亮点

- **25+ 内置工具**：Bash、Read、Write、Edit、Glob、Grep、WebFetch、Task 等完整工具集
- **三层架构设计**：入口层 → 核心引擎 → 工具系统，清晰易懂
- **完整会话管理**：支持 30 天自动过期、历史对话恢复
- **MCP 协议支持**：可扩展外部工具服务
- **React + Ink UI**：现代化终端界面
- **Tree-sitter 代码解析**：多语言精准代码理解

### 技术栈

- TypeScript
- Anthropic SDK
- React + Ink（终端 UI）
- Tree-sitter WASM
- Zod（Schema 校验）

### 快速开始

```bash
git clone https://github.com/kill136/claude-code.git
cd claude-code && npm install
export ANTHROPIC_API_KEY=your-key
npm run dev
```

### 相关链接

- 🌐 官网：https://www.chatbi.site
- 📦 GitHub：https://github.com/kill136/claude-code
- 💬 Discord：https://discord.gg/bNyJKk6PVZ

---

**声明：** 这是一个教育性项目，用于学习 CLI 工具架构设计，不是 Anthropic 官方产品。

欢迎 Star ⭐ 和提 Issue！

---

## 2. V2EX 帖子

**标题：** [开源] Claude Code 逆向工程学习项目，25+ 工具完整复现

**正文：**

分享一个我最近做的开源项目：**Claude Code Open**

这是一个通过逆向工程重新实现 Claude Code CLI 的教育性项目，用于学习 AI 编程助手的架构设计。

**主要特性：**
- 25+ 内置工具（Bash、文件操作、搜索、Web 访问等）
- 完整的会话管理和持久化
- MCP 协议支持
- React + Ink 终端 UI
- Tree-sitter 多语言代码解析

**技术栈：** TypeScript, Anthropic SDK, React/Ink, Zod

🌐 官网：https://www.chatbi.site
📦 GitHub：https://github.com/kill136/claude-code

纯学习项目，欢迎交流！

---

## 3. Twitter/X 推文

**推文 1（主推）：**

🚀 开源了 Claude Code 逆向工程项目！

通过还原 Anthropic 的 Claude Code CLI，深入学习 AI 编程助手架构：

✅ 25+ 内置工具
✅ 三层架构设计
✅ MCP 协议支持
✅ React + Ink 终端 UI

🔗 https://www.chatbi.site
📦 https://github.com/kill136/claude-code

#OpenSource #AI #ClaudeCode #TypeScript

##英文版本

**推文 1（主推）：**

🚀 Open-sourced Claude Code reverse-engineering project!

Learn AI coding assistant architecture by recreating Anthropic's Claude Code CLI:

✅ 25+ built-in tools
✅ Three-layer architecture
✅ MCP protocol support
✅ React + Ink terminal UI

🔗 https://www.chatbi.site
📦 https://github.com/kill136/claude-code

#OpenSource #AI #ClaudeCode #TypeScript

---

**推文 2（Thread）：**

🧵 Why I reverse-engineered Claude Code?

1/ Claude Code is one of the best AI coding assistants, but official code is obfuscated

2/ I recreated core features from public APIs and type definitions

3/ Includes 25+ tools, session management, MCP support, React terminal UI

4/ Great for developers wanting to learn AI tool architecture

🔗 https://www.chatbi.site

---

## 4. Hacker News

**Title:** Show HN: Claude Code Open – Reverse-engineered Claude Code CLI for learning

**Text:**

I reverse-engineered Anthropic's Claude Code CLI to understand how AI coding assistants are built.

**What it includes:**
- 25+ tools (Bash, file ops, search, web access, etc.)
- Three-layer architecture (Entry → Core Engine → Tool System)
- Session management with 30-day persistence
- MCP protocol support
- React + Ink terminal UI
- Tree-sitter WASM for multi-language parsing

**Tech stack:** TypeScript, Anthropic SDK, React/Ink, Zod

This is purely for educational purposes - great for anyone wanting to learn how AI coding tools work under the hood.

Website: https://www.chatbi.site
GitHub: https://github.com/kill136/claude-code

---

## 5. Reddit (r/programming, r/MachineLearning)

**Title:** [Project] Reverse-engineered Claude Code CLI - 25+ tools, full architecture study

**Body:**

Hey everyone,

I've been working on an open-source project that reverse-engineers Anthropic's Claude Code CLI. Since the official code is obfuscated, I decided to recreate it from public APIs and type definitions for educational purposes.

**Features:**
- 25+ built-in tools (Bash, Read, Write, Edit, Glob, Grep, WebFetch, etc.)
- Clean three-layer architecture
- Session management with auto-save
- MCP protocol support
- React + Ink terminal UI
- Tree-sitter for code parsing

**Links:**
- Website: https://www.chatbi.site
- GitHub: https://github.com/kill136/claude-code

It's a great resource if you want to understand how modern AI coding assistants are architected. Feedback welcome!

---

## 发布清单

- [ ] 掘金发布（标签：开源、AI、TypeScript）
- [ ] CSDN 发布
- [ ] V2EX /create 节点发布
- [ ] Twitter/X 发推文
- [ ] Hacker News Show HN
- [ ] Reddit r/programming
- [ ] Reddit r/MachineLearning

---

**推文 2（Thread）：**

🧵 为什么我逆向工程了 Claude Code？

1/ Claude Code 是目前最强的 AI 编程助手之一，但官方代码是混淆的

2/ 我通过分析公开 API 和类型定义，完整还原了核心功能

3/ 项目包含 25+ 工具、会话管理、MCP 协议、React 终端 UI

4/ 适合想学习 AI 工具架构的开发者

🔗 https://www.chatbi.site

---

## 4. Hacker News

**Title:** Show HN: Claude Code Open – Reverse-engineered Claude Code CLI for learning

**Text:**

I reverse-engineered Anthropic's Claude Code CLI to understand how AI coding assistants are built.

**What it includes:**
- 25+ tools (Bash, file ops, search, web access, etc.)
- Three-layer architecture (Entry → Core Engine → Tool System)
- Session management with 30-day persistence
- MCP (Model Context Protocol) support
- React + Ink terminal UI
- Tree-sitter WASM for multi-language parsing

**Tech stack:** TypeScript, Anthropic SDK, React/Ink, Zod

This is purely for educational purposes - great for anyone wanting to learn how AI coding tools work under the hood.

Website: https://www.chatbi.site
GitHub: https://github.com/kill136/claude-code

---

## 5. Reddit (r/programming, r/MachineLearning)

**Title:** [Project] Reverse-engineered Claude Code CLI - 25+ tools, full architecture study

**Body:**

Hey everyone,

I've been working on an open-source project that reverse-engineers Anthropic's Claude Code CLI. Since the official code is obfuscated, I decided to recreate it from public APIs and type definitions for educational purposes.

**Features:**
- 25+ built-in tools (Bash, Read, Write, Edit, Glob, Grep, WebFetch, etc.)
- Clean three-layer architecture
- Session management with auto-save
- MCP protocol support
- React + Ink terminal UI
- Tree-sitter for code parsing

**Links:**
- Website: https://www.chatbi.site
- GitHub: https://github.com/kill136/claude-code

It's a great resource if you want to understand how modern AI coding assistants are architected. Feedback welcome!

---

## 发布清单

- [ ] 掘金发布（标签：开源、AI、TypeScript）
- [ ] CSDN 发布
- [ ] V2EX /create 节点发布
- [ ] Twitter/X 发推文
- [ ] Hacker News Show HN
- [ ] Reddit r/programming
- [ ] Reddit r/MachineLearning
