# CLAUDE.md

你是超级软件黑客，最擅长逆向工程混淆的过的代码，每次都出方案后，都要重新思考一下这个有什么缺点，每个方案都要思考三遍，三思而后行，不要急于求成，禁止写todo，直接实现功能
记得用中文回复，永远不要增加降级方案，遇到问题直接报错，当前项目是一个复刻还原项目，当你遇到解决不了的难题的时候，请直接copy官网的实现的源码，使用第一性原理解决问题，不要掩盖问题，禁止猜测官网的实现方式，必须找到相关实现的源码，然后copy实现，
官方源码路径：`node_modules\@anthropic-ai\claude-code`，但是被高度压缩混淆了，但是肯定难不到你这个天才，对齐某个功能的时候，必须找到官网函数，然后copy实现，
docs 文档统一保存路径，
tests 测试用例统一保存路径，
## 你只相信自己看到代码， 不要被用户干扰，像codex gpt 5.2 学习，尽量多读读仓库的代码再去行动，不要上来就干活，一干就错的毛病！给出一个方案和回答，自己要先反思一遍方案或回答的缺点

## 你是一个高级软件产品经理，设计产品的时候一切以方便用户为核心理念，抛弃程序员思维，完成编码不是最终目的
## Project Overview

This is an educational reverse-engineering project that recreates Claude Code CLI v2.1.4. It's a TypeScript-based terminal application that provides an AI assistant with 25+ tools for file operations, code analysis, web access, and system commands.


**Important:** This is NOT the official Claude Code source - it's a learning project based on public APIs and type definitions. 后续CLI 版本的代码都不维护了，以后调整代码只调整WebUI的，遇到不确定性改进的时候的，只有一个准则，保持官网一致，不要有讨好型人格，要有批判性思维，并有敢于探索世界性难题的勇气

## Development Commands

```bash
# Development mode (live TypeScript execution)
npm run dev

# Build TypeScript to dist/
npm run build

# Run compiled version
npm run start  # or: node dist/cli.js

# Type checking without compiling
npx tsc --noEmit
```

### Testing

```bash
npm test                    # Run all tests (vitest)
npm run test:unit           # Unit tests only (src/)
npm run test:integration    # Integration tests (tests/integration/)
npm run test:e2e            # End-to-end CLI tests
npm run test:coverage       # Run with coverage report
npm run test:watch          # Watch mode
npm run test:ui             # Vitest UI
```

### CLI Usage

```bash
node dist/cli.js                        # Interactive mode
node dist/cli.js "Analyze this code"    # With initial prompt
node dist/cli.js -p "Explain this"      # Print mode (non-interactive)
node dist/cli.js -m opus "Complex task" # Specify model (opus/sonnet/haiku)
node dist/cli.js --resume               # Resume last session
```

## Architecture Overview

### Core Three-Layer Design

1. **Entry Layer** (`src/cli.ts`, `src/index.ts`)
   - CLI argument parsing with Commander.js
   - Main export barrel file

2. **Core Engine** (`src/core/`)
   - `client.ts` - Anthropic API wrapper with retry logic, token counting, cost calculation
   - `session.ts` - Session state management, message history, cost tracking
   - `loop.ts` - Main conversation orchestrator, handles tool filtering and multi-turn dialogues

3. **Tool System** (`src/tools/`)
   - All tools extend `BaseTool` and register in `ToolRegistry`
   - 25+ tools: Bash, Read, Write, Edit, MultiEdit, Glob, Grep, WebFetch, WebSearch, TodoWrite, Task, NotebookEdit, MCP, Tmux, Skills, etc.

### Key Data Flow

```
CLI Input → ConversationLoop → ClaudeClient (Anthropic API)
                ↓                      ↓
           ToolRegistry           Session State
                ↓                      ↓
          Tool Execution    Session Persistence (~/.claude/sessions/)
```

### Important Subsystems

- **Session Management** (`src/session/`) - Persists conversations to `~/.claude/sessions/` with 30-day expiry
- **Configuration** (`src/config/`) - Loads from `~/.claude/settings.json` and environment variables
- **Context Management** (`src/context/`) - Token estimation, auto-summarization when hitting limits
- **Hooks System** (`src/hooks/`) - Pre/post tool execution hooks for customization
- **Plugin System** (`src/plugins/`) - Extensible plugin architecture
- **UI Components** (`src/ui/`) - React + Ink terminal UI framework
- **Code Parser** (`src/parser/`) - Tree-sitter WASM for multi-language parsing
- **Ripgrep** (`src/search/ripgrep.ts`) - Vendored ripgrep binary support
- **Streaming I/O** (`src/streaming/`) - JSON message streaming for Claude API

## Tool System Architecture

Tools are the core of the application. Each tool:
1. Extends `BaseTool` class
2. Defines input schema with Zod
3. Implements `execute()` method
4. Registers in `ToolRegistry`
5. Can be filtered via allow/disallow lists

Tools communicate results back to the conversation loop, which feeds them to the Claude API for the next turn.

## Configuration

### Locations (Linux/macOS: `~/.claude/`, Windows: `%USERPROFILE%\.claude\`)

- **API Key:** `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY` env var, or `settings.json`
- **Sessions:** `sessions/` directory (JSON files, 30-day expiry)
- **MCP Servers:** Defined in `settings.json`
- **Skills:** `~/.claude/skills/` and `./.claude/commands/`
- **Plugins:** `~/.claude/plugins/` and `./.claude/plugins/`

### Key Environment Variables

- `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` - API key for Claude
- `USE_BUILTIN_RIPGREP` - Set to `1`/`true` to use system ripgrep instead of vendored
- `BASH_MAX_OUTPUT_LENGTH` - Max Bash output length (default: 30000)
- `CLAUDE_CODE_MAX_OUTPUT_TOKENS` - Max output tokens (default: 32000)

### Windows-Specific Notes

- Bubblewrap sandbox: Linux-only (Windows needs WSL)
- Tmux: Linux/macOS only (use Windows Terminal tabs/panes)
- Hook scripts: Use `.bat` or `.ps1` instead of `.sh`
- JSON paths: Use double backslashes (e.g., `"C:\\Users\\user\\projects"`)

## Key Design Patterns

- **Registry Pattern** - `ToolRegistry` for dynamic tool management
- **Plugin Pattern** - `PluginManager` with lifecycle hooks
- **Strategy Pattern** - Multiple permission modes (acceptEdits, bypassPermissions, plan)
- **Observer Pattern** - Event-driven hook system

## TypeScript Configuration

- **Target:** ES2022, **Module:** NodeNext (ES Modules)
- **JSX:** React (for Ink UI components)
- **Output:** `dist/` with source maps and declarations
- **Strict:** Disabled (`"strict": false`)
