# Claude Code Open 系统架构文档

> 生成日期: 2026-01-16  
> 版本: v2.1.7  
> 基于官方 Claude Code v2.1.4 逆向工程

## 文档概览

本文档详细描述了 claude-code-open 项目的系统架构设计,包括核心模块、数据流、工具系统、WebUI 架构以及蓝图(Blueprint)系统。

**目录**
1. [整体系统架构](#1-整体系统架构)
2. [双模式架构](#2-双模式架构-cli--webui)
3. [核心引擎层详解](#3-核心引擎层详解)
4. [工具系统架构](#4-工具系统架构)
5. [蓝图(Blueprint)系统](#5-蓝图blueprint系统架构)
6. [记忆系统架构](#6-统一记忆系统架构)
7. [流式处理详解](#7-流式输出处理)
8. [权限与安全](#8-权限系统架构)
9. [性能优化机制](#9-三层自动压缩机制)
10. [配置与扩展](#10-配置和环境变量)

---

## 1. 整体系统架构 (数据流图)

```mermaid
flowchart TB
    subgraph 用户层["👤 用户层"]
        CLI["CLI 命令行<br/>npm run dev / node dist/cli.js"]
        WebUI["Web UI<br/>(可选)"]
    end

    subgraph 入口层["🚪 入口层 (cli.ts)"]
        Parser["Commander.js<br/>参数解析"]
        Init["系统初始化<br/>配置/认证/工具注册"]
    end

    subgraph 核心引擎["⚙️ 核心引擎层"]
        Loop["ConversationLoop<br/>对话主循环 (2238行)"]
        Client["ClaudeClient<br/>API通信 (1023行)"]
        Session["Session<br/>会话管理 (707行)"]
        Prompt["SystemPromptBuilder<br/>系统提示构建"]
    end

    subgraph 压缩系统["📦 自动压缩系统"]
        Micro["MicroCompact<br/>清理旧持久化输出"]
        TJ1["Session Memory<br/>结构化会话记忆"]
        NJ1["对话总结<br/>技术摘要生成"]
    end

    subgraph API层["☁️ API 层"]
        Anthropic["Anthropic API<br/>beta.messages.create"]
        Streaming["流式响应<br/>SSE/JSON Stream"]
    end

    subgraph 工具系统["🔧 工具系统层"]
        Registry["ToolRegistry<br/>工具注册表"]
        Base["BaseTool<br/>工具基类"]
        Tools["18+ 核心工具"]
    end

    subgraph 支持系统["🛠️ 支持系统"]
        Config["ConfigManager<br/>配置管理"]
        Auth["Auth<br/>API Key/OAuth"]
        Permission["PermissionManager<br/>权限检查"]
        MCP["MCPManager<br/>MCP服务器"]
        Hooks["HookSystem<br/>扩展点"]
    end

    subgraph 持久化["💾 持久化层"]
        Storage["~/.claude/sessions/"]
        Settings["~/.claude/settings.json"]
        Credentials["credentials.json"]
    end

    %% 连接线
    CLI --> Parser
    WebUI --> Parser
    Parser --> Init
    Init --> Loop
    Init --> Config
    Init --> Auth
    Init --> Registry

    Loop --> Client
    Loop --> Session
    Loop --> Prompt
    Loop --> Micro
    Micro --> TJ1
    TJ1 --> NJ1

    Client --> Anthropic
    Anthropic --> Streaming
    Streaming --> Loop

    Loop --> Registry
    Registry --> Base
    Base --> Tools

    Loop --> Permission
    Permission --> Hooks

    Session --> Storage
    Config --> Settings
    Auth --> Credentials
    MCP --> Registry

    %% 样式
    classDef userClass fill:#e1f5fe,stroke:#01579b
    classDef entryClass fill:#fff3e0,stroke:#e65100
    classDef coreClass fill:#f3e5f5,stroke:#7b1fa2
    classDef compactClass fill:#ffebee,stroke:#c62828
    classDef apiClass fill:#e8f5e9,stroke:#2e7d32
    classDef toolClass fill:#fff8e1,stroke:#f9a825
    classDef supportClass fill:#e3f2fd,stroke:#1565c0
    classDef storageClass fill:#fafafa,stroke:#616161

    class CLI,WebUI userClass
    class Parser,Init entryClass
    class Loop,Client,Session,Prompt coreClass
    class Micro,TJ1,NJ1 compactClass
    class Anthropic,Streaming apiClass
    class Registry,Base,Tools toolClass
    class Config,Auth,Permission,MCP,Hooks supportClass
    class Storage,Settings,Credentials storageClass
```

---

## 2. 流式输出处理 (信号序列图)

```mermaid
sequenceDiagram
    autonumber
    participant User as 👤 用户
    participant Loop as ConversationLoop
    participant Client as ClaudeClient
    participant API as Anthropic API
    participant Stream as StreamParser
    participant Tool as ToolRegistry

    User->>Loop: 输入消息
    activate Loop

    Loop->>Loop: MicroCompact 清理
    Loop->>Loop: AutoCompact 检查

    Loop->>Client: createMessageStream()
    activate Client

    Client->>API: POST /v1/messages (stream=true)
    activate API

    rect rgb(230, 245, 255)
        Note over API,Stream: 流式响应阶段
        API-->>Stream: message_start
        Stream-->>Loop: 消息开始信号

        loop 内容块循环
            API-->>Stream: content_block_start
            Note right of Stream: type: text/tool_use/thinking

            API-->>Stream: content_block_delta
            Note right of Stream: text_delta/input_json_delta/thinking_delta

            API-->>Stream: content_block_stop
            Stream-->>Loop: 内容块完成
        end

        API-->>Stream: message_delta
        Note right of Stream: stop_reason, usage

        API-->>Stream: message_stop
    end

    deactivate API
    deactivate Client

    alt 有工具调用
        Loop->>Tool: 执行工具
        activate Tool
        Tool->>Tool: 权限检查
        Tool-->>Loop: tool_result
        deactivate Tool
        Loop->>Loop: 继续循环
    else 无工具调用
        Loop-->>User: 返回响应
    end

    deactivate Loop
```

---

## 3. 流式事件类型详解

```mermaid
flowchart LR
    subgraph 消息级事件["📨 消息级事件"]
        MS["message_start<br/>消息开始"]
        MD["message_delta<br/>消息增量"]
        MST["message_stop<br/>消息结束"]
    end

    subgraph 内容块事件["📝 内容块事件"]
        CBS["content_block_start<br/>块开始"]
        CBD["content_block_delta<br/>块增量"]
        CBST["content_block_stop<br/>块结束"]
    end

    subgraph Delta类型["⚡ Delta 类型"]
        TD["text_delta<br/>文本增量"]
        TKD["thinking_delta<br/>思考增量"]
        IJD["input_json_delta<br/>工具参数JSON"]
        CD["citations_delta<br/>引用信息"]
        SD["signature_delta<br/>签名增量"]
    end

    MS --> CBS
    CBS --> CBD
    CBD --> CBST
    CBST --> MD
    MD --> MST

    CBD --> TD
    CBD --> TKD
    CBD --> IJD
    CBD --> CD
    CBD --> SD

    style MS fill:#e3f2fd
    style MD fill:#e3f2fd
    style MST fill:#e3f2fd
    style CBS fill:#fff3e0
    style CBD fill:#fff3e0
    style CBST fill:#fff3e0
    style TD fill:#e8f5e9
    style TKD fill:#fce4ec
    style IJD fill:#fff8e1
    style CD fill:#f3e5f5
    style SD fill:#eceff1
```

---

## 4. 工具调用流程

```mermaid
flowchart TB
    subgraph 接收阶段["📥 接收阶段"]
        Receive["接收 tool_use 事件"]
        Parse["解析工具名称和参数"]
    end

    subgraph 权限检查["🔐 权限检查 (三步)"]
        Check1["① 工具自身权限检查<br/>BaseTool.checkPermissions()"]
        Check2["② 会话级权限记忆<br/>session.isToolAlwaysAllowed()"]
        Check3["③ Permission Hook<br/>触发扩展点"]
        ModeCheck["④ 权限模式判断"]
    end

    subgraph 用户交互["👤 用户交互"]
        Dialog["显示权限对话框"]
        UserChoice{"用户选择"}
        AllowOnce["[y] 允许一次"]
        Deny["[n] 拒绝"]
        AllowAlways["[a] 始终允许"]
    end

    subgraph 执行阶段["⚡ 执行阶段"]
        Execute["tool.execute(input)"]
        Format["formatToolResult()"]
        Persist{"输出 > 400KB?"}
        PersistTag["使用持久化标签<br/>&lt;persisted-output&gt;"]
        DirectResult["直接返回结果"]
    end

    subgraph 结果处理["📤 结果处理"]
        AddResult["添加 tool_result 到历史"]
        Continue["继续对话循环"]
    end

    Receive --> Parse
    Parse --> Check1
    Check1 -->|通过| Check2
    Check1 -->|拒绝| Deny
    Check2 -->|已记忆| Execute
    Check2 -->|无记忆| Check3
    Check3 -->|Hook允许| Execute
    Check3 -->|Hook拒绝| Deny
    Check3 -->|无决策| ModeCheck

    ModeCheck -->|bypassPermissions| Execute
    ModeCheck -->|dontAsk| Deny
    ModeCheck -->|default| Dialog

    Dialog --> UserChoice
    UserChoice --> AllowOnce
    UserChoice --> Deny
    UserChoice --> AllowAlways

    AllowOnce --> Execute
    AllowAlways -->|保存到Session| Execute

    Execute --> Format
    Format --> Persist
    Persist -->|是| PersistTag
    Persist -->|否| DirectResult
    PersistTag --> AddResult
    DirectResult --> AddResult
    AddResult --> Continue

    style Receive fill:#e3f2fd
    style Check1 fill:#fff3e0
    style Check2 fill:#fff3e0
    style Check3 fill:#fff3e0
    style ModeCheck fill:#fff3e0
    style Execute fill:#e8f5e9
    style Dialog fill:#fce4ec
    style AddResult fill:#f3e5f5
```

---

## 5. 三层自动压缩机制

```mermaid
flowchart TB
    Start["消息总 tokens"]

    Check1{"tokens > 40K?"}
    Micro["🔹 MicroCompact<br/>清理旧持久化输出"]

    Check2{"tokens > 自动压缩阈值?"}

    Check3{"DISABLE_COMPACT=1?"}
    Warning1["⚠️ 输出警告<br/>不压缩"]

    TJ1["🔸 Session Memory 压缩 (TJ1)<br/>生成结构化会话记忆"]
    TJ1Result{"压缩成功?"}

    NJ1["🔺 对话总结 (NJ1)<br/>生成详细技术摘要"]
    NJ1Result{"总结成功?"}

    Success["✅ 返回压缩消息"]
    Fail["⚠️ 保持原消息<br/>输出警告"]
    NoCompress["不压缩<br/>返回原消息"]

    Start --> Check1
    Check1 -->|是| Micro
    Check1 -->|否| Check2
    Micro --> Check2

    Check2 -->|是| Check3
    Check2 -->|否| NoCompress

    Check3 -->|是| Warning1
    Check3 -->|否| TJ1

    TJ1 --> TJ1Result
    TJ1Result -->|成功| Success
    TJ1Result -->|失败| NJ1

    NJ1 --> NJ1Result
    NJ1Result -->|成功| Success
    NJ1Result -->|失败| Fail

    style Micro fill:#e3f2fd,stroke:#1565c0
    style TJ1 fill:#fff3e0,stroke:#e65100
    style NJ1 fill:#ffebee,stroke:#c62828
    style Success fill:#e8f5e9,stroke:#2e7d32
    style Fail fill:#fafafa,stroke:#616161
```

---

## 6. 工具系统架构

```mermaid
flowchart TB
    subgraph 工具注册表["📋 ToolRegistry"]
        Registry["ToolRegistry<br/>单例模式"]
    end

    subgraph 基类["🏗️ BaseTool"]
        Base["BaseTool<br/>抽象基类"]
        Methods["+ name: string<br/>+ description: string<br/>+ inputSchema: ZodSchema<br/>+ execute(input): Promise<br/>+ checkPermissions(): PermissionResult"]
    end

    subgraph 文件工具["📁 文件工具 (3个)"]
        Read["ReadTool<br/>文件读取"]
        Write["WriteTool<br/>文件写入"]
        Edit["EditTool<br/>文件编辑"]
    end

    subgraph 搜索工具["🔍 搜索工具 (3个)"]
        Bash["BashTool<br/>命令执行"]
        Glob["GlobTool<br/>文件匹配"]
        Grep["GrepTool<br/>内容搜索"]
    end

    subgraph Web工具["🌐 Web工具 (2个)"]
        Fetch["WebFetchTool<br/>网页获取"]
        Search["WebSearchTool<br/>网页搜索"]
    end

    subgraph 任务工具["📝 任务工具 (3个)"]
        Todo["TodoWriteTool<br/>待办管理"]
        Task["TaskTool<br/>子代理"]
        TaskOutput["TaskOutputTool<br/>获取输出"]
    end

    subgraph MCP工具["🔌 MCP工具 (3个)"]
        MCPSearch["MCPSearchTool"]
        ListMcp["ListMcpResourcesTool"]
        ReadMcp["ReadMcpResourceTool"]
    end

    subgraph 其他工具["🛠️ 其他工具 (4+个)"]
        Notebook["NotebookEditTool<br/>Jupyter编辑"]
        Skill["SkillTool<br/>技能系统"]
        LSP["LSPTool<br/>语言服务器"]
        Ask["AskUserQuestionTool<br/>用户交互"]
    end

    subgraph 计划工具["📐 计划工具 (2个)"]
        Enter["EnterPlanModeTool"]
        Exit["ExitPlanModeTool"]
    end

    Registry --> Base
    Base --> Methods

    Base --> Read
    Base --> Write
    Base --> Edit

    Base --> Bash
    Base --> Glob
    Base --> Grep

    Base --> Fetch
    Base --> Search

    Base --> Todo
    Base --> Task
    Base --> TaskOutput

    Base --> MCPSearch
    Base --> ListMcp
    Base --> ReadMcp

    Base --> Notebook
    Base --> Skill
    Base --> LSP
    Base --> Ask

    Base --> Enter
    Base --> Exit

    style Registry fill:#f3e5f5,stroke:#7b1fa2
    style Base fill:#e3f2fd,stroke:#1565c0
```

---

## 7. Agent 系统架构

```mermaid
flowchart TB
    subgraph 代理系统["🤖 Agent 系统"]
        Main["MainAgent<br/>主代理"]
    end

    subgraph 专用代理["🎯 专用代理"]
        Explore["ExploreAgent<br/>代码浏览"]
        Plan["PlanAgent<br/>架构规划"]
        Guide["GuideAgent<br/>指导帮助"]
        Comm["CommunicationAgent<br/>通信代理"]
    end

    subgraph 工具配置["⚙️ 代理工具配置"]
        ExploreTools["Explore 工具<br/>Glob, Grep, Read<br/>只读模式"]
        PlanTools["Plan 工具<br/>全部工具<br/>elevated 权限"]
        GuideTools["Guide 工具<br/>WebFetch, WebSearch<br/>标准权限"]
    end

    subgraph 限制机制["🔒 工具限制"]
        ParamLimit["参数限制<br/>allowedValues/disallowedValues"]
        RateLimit["速率限制<br/>windowMs/maxCalls"]
        ScopeLimit["范围限制<br/>allowedPaths/allowedCommands"]
    end

    Main --> Explore
    Main --> Plan
    Main --> Guide
    Main --> Comm

    Explore --> ExploreTools
    Plan --> PlanTools
    Guide --> GuideTools

    ExploreTools --> ParamLimit
    PlanTools --> ScopeLimit
    GuideTools --> RateLimit

    style Main fill:#f3e5f5,stroke:#7b1fa2
    style Explore fill:#e3f2fd,stroke:#1565c0
    style Plan fill:#fff3e0,stroke:#e65100
    style Guide fill:#e8f5e9,stroke:#2e7d32
```

---

## 8. 权限系统架构

```mermaid
flowchart LR
    subgraph 权限模式["🔐 权限模式"]
        Default["default<br/>询问用户"]
        Accept["acceptEdits<br/>自动允许编辑"]
        Bypass["bypassPermissions<br/>跳过所有检查"]
        DontAsk["dontAsk<br/>自动拒绝"]
        Delegate["delegate<br/>委托代理"]
        PlanMode["plan<br/>规划模式"]
    end

    subgraph 检查流程["✅ 检查流程"]
        Tool["工具权限检查"]
        Session["会话权限记忆"]
        Hook["Permission Hook"]
        Mode["模式判断"]
    end

    subgraph 结果["📋 结果"]
        Allow["✅ 允许执行"]
        Deny["❌ 拒绝执行"]
        Ask["❓ 询问用户"]
    end

    Default --> Ask
    Accept --> Allow
    Bypass --> Allow
    DontAsk --> Deny
    Delegate --> Hook

    Tool --> Session
    Session --> Hook
    Hook --> Mode
    Mode --> Allow
    Mode --> Deny
    Mode --> Ask

    style Default fill:#e3f2fd
    style Accept fill:#e8f5e9
    style Bypass fill:#ffebee
    style DontAsk fill:#fafafa
    style Allow fill:#c8e6c9
    style Deny fill:#ffcdd2
    style Ask fill:#fff9c4
```

---

## 9. 模块间调用关系

```mermaid
flowchart TB
    subgraph Entry["入口"]
        CLI["cli.ts"]
    end

    subgraph Init["初始化"]
        Config["ConfigManager"]
        Auth["Auth"]
        ToolReg["ToolRegistry"]
        MCPMgr["MCPManager"]
    end

    subgraph Core["核心"]
        Loop["ConversationLoop"]
        Client["ClaudeClient"]
        Sess["Session"]
        PromptB["SystemPromptBuilder"]
    end

    subgraph Compress["压缩"]
        AutoC["autoCompact"]
        MicroC["MicroCompact"]
        SessM["SessionMemory"]
        ConvS["ConversationSummary"]
    end

    subgraph Tools["工具"]
        Base["BaseTool"]
        Exec["execute()"]
        Format["formatResult()"]
    end

    subgraph Support["支持"]
        Perm["Permission"]
        Hooks["Hooks"]
        Plugins["Plugins"]
    end

    subgraph External["外部"]
        API["Anthropic API"]
        MCP["MCP Servers"]
        FS["File System"]
    end

    CLI --> Config
    CLI --> Auth
    CLI --> ToolReg
    CLI --> MCPMgr
    CLI --> Loop

    Loop --> Client
    Loop --> Sess
    Loop --> PromptB
    Loop --> AutoC
    Loop --> Base

    AutoC --> MicroC
    AutoC --> SessM
    AutoC --> ConvS

    Client --> API
    MCPMgr --> MCP
    Sess --> FS

    Base --> Exec
    Exec --> Perm
    Exec --> Format
    Perm --> Hooks

    style CLI fill:#fff3e0
    style Loop fill:#f3e5f5
    style Client fill:#e3f2fd
    style API fill:#e8f5e9
```

---

## 10. 消息结构

```mermaid
classDiagram
    class Message {
        +role: user | assistant
        +content: string | ContentBlock[]
    }

    class TextBlock {
        +type: text
        +text: string
        +citations: Citation[]
    }

    class ToolUseBlock {
        +type: tool_use
        +id: string
        +name: string
        +input: any
    }

    class ToolResultBlock {
        +type: tool_result
        +tool_use_id: string
        +content: string
    }

    class ThinkingBlock {
        +type: thinking
        +thinking: string
    }

    Message --> TextBlock
    Message --> ToolUseBlock
    Message --> ToolResultBlock
    Message --> ThinkingBlock
```

---

## 11. 完整数据流路径

```mermaid
flowchart TB
    subgraph 用户输入["1️⃣ 用户输入"]
        Input["CLI 命令/提示词"]
    end

    subgraph 参数解析["2️⃣ 参数解析"]
        Commander["Commander.js 解析"]
        Validate["参数验证"]
    end

    subgraph 系统初始化["3️⃣ 系统初始化"]
        LoadConfig["加载配置"]
        InitAuth["初始化认证"]
        RegTools["注册工具"]
        LoadMCP["加载MCP服务器"]
    end

    subgraph 对话循环["4️⃣ 对话循环"]
        AddMsg["添加用户消息"]
        Compress["自动压缩检查"]
        BuildPrompt["构建系统提示"]
        CallAPI["调用 API"]
    end

    subgraph 流式处理["5️⃣ 流式处理"]
        ParseStream["解析流式响应"]
        ExtractText["提取文本"]
        ExtractTool["提取工具调用"]
        ExtractThink["提取思考过程"]
    end

    subgraph 工具执行["6️⃣ 工具执行"]
        CheckPerm["权限检查"]
        ExecTool["执行工具"]
        FormatResult["格式化结果"]
    end

    subgraph 结果处理["7️⃣ 结果处理"]
        AddResult["添加结果到历史"]
        CheckContinue{"继续循环?"}
        Return["返回最终响应"]
    end

    Input --> Commander
    Commander --> Validate
    Validate --> LoadConfig
    LoadConfig --> InitAuth
    InitAuth --> RegTools
    RegTools --> LoadMCP
    LoadMCP --> AddMsg

    AddMsg --> Compress
    Compress --> BuildPrompt
    BuildPrompt --> CallAPI
    CallAPI --> ParseStream

    ParseStream --> ExtractText
    ParseStream --> ExtractTool
    ParseStream --> ExtractThink

    ExtractTool --> CheckPerm
    CheckPerm --> ExecTool
    ExecTool --> FormatResult
    FormatResult --> AddResult

    AddResult --> CheckContinue
    CheckContinue -->|是| Compress
    CheckContinue -->|否| Return

    ExtractText --> Return

    style Input fill:#e1f5fe
    style CallAPI fill:#f3e5f5
    style ExecTool fill:#e8f5e9
    style Return fill:#fff8e1
```

---

## 12. 配置和环境变量

```mermaid
flowchart LR
    subgraph 环境变量["🔧 环境变量"]
        API_KEY["ANTHROPIC_API_KEY<br/>API密钥"]
        SESSION["CLAUDE_CODE_SESSION_ID<br/>会话ID"]
        COMPACT["DISABLE_COMPACT<br/>禁用压缩"]
        MEMORY["ENABLE_SESSION_MEMORY<br/>会话记忆"]
        TOKENS["CLAUDE_CODE_MAX_OUTPUT_TOKENS<br/>最大输出"]
    end

    subgraph 配置文件["📁 配置文件"]
        Settings["~/.claude/settings.json<br/>全局配置"]
        Sessions["~/.claude/sessions/<br/>会话数据"]
        Credentials["credentials.json<br/>认证信息"]
        MCPConfig["mcp-servers.json<br/>MCP配置"]
    end

    subgraph 加载顺序["📊 加载优先级"]
        Env["① 环境变量"]
        Local["② 本地配置"]
        Global["③ 全局配置"]
        Default["④ 默认值"]
    end

    API_KEY --> Env
    SESSION --> Env
    Settings --> Local
    Credentials --> Local

    Env --> Local
    Local --> Global
    Global --> Default

    style API_KEY fill:#ffebee
    style Settings fill:#e3f2fd
    style Env fill:#e8f5e9
```

---

## 附录: 关键常量

| 常量 | 值 | 说明 |
|-----|-----|-----|
| `MICROCOMPACT_THRESHOLD` | 40K tokens | MicroCompact 触发阈值 |
| `MIN_SAVINGS_THRESHOLD` | 20K tokens | 最小节省阈值 |
| `KEEP_RECENT_COUNT` | 3 | 保留最近工具结果数 |
| `PERSIST_OUTPUT_THRESHOLD` | 400KB | 持久化输出阈值 |
| `PREVIEW_SIZE` | 2KB | 预览大小 |
| `MAX_OUTPUT_TOKENS` | 32K | 默认最大输出 |
| `CONTEXT_WINDOW` | 200K | 模型上下文窗口 |

---

> 本文档使用 Mermaid 语法，可在支持 Mermaid 的 Markdown 渲染器中查看（如 GitHub、VSCode、Typora 等）
