# 底层 API 调用完整流程

## 从配置到 HTTP 请求的完整调用链

### 📊 完整流程图

```
用户配置
   ↓
┌──────────────────────────────────────┐
│ 1. 配置获取                            │
│   - ConfigManager.getAll()            │
│   - getAuth()                         │
│   - 读取 apiBaseUrl, apiKey, authPriority │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 2. Provider 创建                     │
│   src/providers/index.ts            │
│   - createClient(config)            │
│   - getAnthropicApiConfig()         │
│   决定使用: apiKey 或 authToken      │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 3. ClaudeClient 初始化               │
│   src/core/client.ts               │
│   - new ClaudeClient(config)       │
│   - 设置 isOAuth 标志               │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 4. Anthropic SDK 初始化              │
│   @anthropic-ai/sdk                │
│   - new Anthropic({                │
│       apiKey: xxx,  // 或 null     │
│       authToken: yyy, // 或 null   │
│       baseURL: zzz                 │
│     })                             │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 5. 消息创建请求                      │
│   - createMessage() 或             │
│   - createMessageStream()          │
│   准备请求参数                      │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 6. 构建请求参数                      │
│   - buildBetas() - 根据 isOAuth   │
│   - formatSystemPrompt()          │
│   - buildApiTools()               │
│   - buildMetadata()               │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 7. 发起 HTTP 请求                   │
│   - client.beta.messages.create()  │
│   或                                │
│   - client.beta.messages.stream()  │
│   ↓                                 │
│   @anthropic-ai/sdk 内部           │
│   - 构建 HTTP POST 请求            │
│   - URL: {baseURL}/v1/messages     │
│   - Headers:                       │
│     • x-api-key: {apiKey}         │
│       或                            │
│     • authorization: Bearer {token}│
│     • anthropic-version: 2023-06-01│
│     • x-app: cli                   │
│     • anthropic-beta: ...          │
│   - Body: JSON payload             │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 8. Anthropic API 服务器             │
│   - 验证认证                        │
│   - 处理请求                        │
│   - 返回响应                        │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│ 9. 响应处理                         │
│   - 解析 JSON 响应                  │
│   - 提取 tokens 使用统计            │
│   - 返回内容和元数据                │
└──────────────────────────────────────┘
```

## 详细代码流程

### 步骤 1: 配置获取

**位置**: `src/web/server/api-manager.ts` 或任何需要创建客户端的地方

```typescript
// 1.1 获取认证信息
const auth = getAuth();  
// auth.type: 'api_key' | 'oauth'
// auth.apiKey: API密钥（API Key模式）
// auth.authToken: OAuth token（OAuth模式）

// 1.2 获取配置
const config = configManager.getAll();
// config.apiBaseUrl: 自定义端点
// config.customModelName: 自定义模型
// config.authPriority: 认证优先级
```

### 步骤 2: Provider 创建 Anthropic 客户端

**位置**: `src/providers/index.ts`

```typescript
export function createClient(config?: ProviderConfig): Anthropic {
  const providerConfig = config || detectProvider();
  
  // 根据 authPriority 决定使用什么认证
  const { apiKey, baseURL } = getAnthropicApiConfig(providerConfig);
  
  // 创建 Anthropic SDK 实例
  return new Anthropic({ 
    apiKey,    // ⭐ 这里传入的可能是 API Key 或 OAuth Token
    baseURL    // ⭐ 自定义端点
  });
}

// 辅助函数：获取API配置
function getAnthropicApiConfig(config: ProviderConfig): { 
  apiKey: string; 
  baseURL: string 
} {
  // 优先级判断
  const auth = getAuth();
  const authPriority = config.authPriority || 'auto';
  
  let apiKey: string | undefined;
  
  if (authPriority === 'apiKey') {
    // 强制使用 API Key
    apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  } else if (authPriority === 'oauth' && auth?.type === 'oauth') {
    // 强制使用 OAuth
    apiKey = auth.authToken || auth.accessToken;
  } else if (authPriority === 'auto') {
    // 自动：优先配置的 API Key
    apiKey = config.apiKey || 
             (auth?.type === 'oauth' ? auth.authToken : auth?.apiKey) ||
             process.env.ANTHROPIC_API_KEY;
  }
  
  const baseURL = config.baseUrl || 
                  process.env.ANTHROPIC_BASE_URL || 
                  'https://api.anthropic.com';
  
  if (!apiKey) {
    throw new Error('No API key or OAuth token available');
  }
  
  return { apiKey, baseURL };
}
```

### 步骤 3: ClaudeClient 初始化

**位置**: `src/core/client.ts:300-405`

```typescript
constructor(config: ClientConfig = {}) {
  // 3.1 决定使用 API Key 还是 OAuth Token
  const authToken = config.authToken || process.env.ANTHROPIC_AUTH_TOKEN;
  
  // ⭐ 关键逻辑：如果有 authToken，则不使用 apiKey
  const apiKey = authToken ? null : (
    config.apiKey || 
    process.env.ANTHROPIC_API_KEY || 
    process.env.CLAUDE_API_KEY
  );
  
  // 3.2 构建请求头
  const defaultHeaders: Record<string, string> = {
    'x-app': 'cli',
    'User-Agent': `claude-cli/${VERSION_BASE}`,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  
  // 3.3 标记 OAuth 模式
  if (authToken) {
    this.isOAuth = true;  // ⭐ 影响后续请求的构建
  }
  
  // 3.4 创建 Anthropic SDK 实例
  const anthropicConfig = {
    apiKey: apiKey,           // OAuth模式下为 null
    authToken: authToken || null,  // API Key模式下为 null
    baseURL: config.baseUrl,
    maxRetries: 0,
    defaultHeaders,
    dangerouslyAllowBrowser: true,
  };
  
  this.client = new Anthropic(anthropicConfig);  // ⭐ SDK实例
}
```

### 步骤 4: Anthropic SDK 内部

**位置**: `node_modules/@anthropic-ai/sdk`

```typescript
// Anthropic SDK 构造函数（简化）
class Anthropic {
  constructor(options) {
    this.apiKey = options.apiKey;
    this.authToken = options.authToken;
    this.baseURL = options.baseURL || 'https://api.anthropic.com';
    this.defaultHeaders = options.defaultHeaders || {};
    // ... 其他配置
  }
  
  // 内部方法：构建请求头
  private buildHeaders() {
    const headers = { ...this.defaultHeaders };
    
    if (this.authToken) {
      // OAuth 模式：使用 Bearer token
      headers['authorization'] = `Bearer ${this.authToken}`;
    } else if (this.apiKey) {
      // API Key 模式：使用 x-api-key
      headers['x-api-key'] = this.apiKey;
    }
    
    headers['anthropic-version'] = '2023-06-01';
    headers['content-type'] = 'application/json';
    
    return headers;
  }
}
```

### 步骤 5-6: 构建请求参数

**位置**: `src/core/client.ts:550-618`

```typescript
async createMessage(messages, tools, systemPrompt, options) {
  // 5.1 准备请求
  const executeRequest = async (currentModel: string) => {
    return await this.withRetry(async () => {
      
      // 6.1 构建 betas（根据 OAuth 模式不同）
      const betas = buildBetas(currentModel, this.isOAuth);
      // API Key: ['interleaved-thinking-2025-05-14']
      // OAuth:  ['claude-code-20250219', 'oauth-2025-04-20', 
      //          'interleaved-thinking-2025-05-14']
      
      // 6.2 格式化系统提示（OAuth 需要特殊格式）
      const formattedSystem = formatSystemPrompt(systemPrompt, this.isOAuth);
      // API Key: 原始字符串
      // OAuth:  [{type: 'text', text: 'You are Claude Code...'}]
      
      // 6.3 构建工具列表
      const apiTools = buildApiTools(tools);
      
      // 6.4 构建元数据
      const metadata = buildMetadata();
      
      // 6.5 组装请求参数
      const requestParams = {
        model: currentModel,
        max_tokens: this.maxTokens,
        system: formattedSystem,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        tools: apiTools,
        betas,       // ⭐ 影响API行为
        metadata,
      };
      
      // 6.6 调用 SDK
      return await this.client.beta.messages.create(requestParams);
      //                        ↑
      //                   使用 beta API
    });
  };
  
  // 执行请求
  const response = await executeRequest(this.model);
  return response;
}
```

### 步骤 7: HTTP 请求发送

**Anthropic SDK 内部处理**

```typescript
// SDK 内部（简化示意）
async create(params) {
  // 7.1 构建 URL
  const url = `${this.baseURL}/v1/messages`;
  
  // 7.2 构建请求头
  const headers = {
    'x-api-key': this.apiKey || undefined,              // API Key 模式
    'authorization': this.authToken ? `Bearer ${this.authToken}` : undefined,  // OAuth 模式
    'anthropic-version': '2023-06-01',
    'anthropic-beta': params.betas?.join(','),           // ⭐ Beta features
    'content-type': 'application/json',
    'x-app': 'cli',
    'user-agent': 'claude-cli/...',
    ...this.defaultHeaders
  };
  
  // 7.3 构建请求体
  const body = JSON.stringify({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system,
    messages: params.messages,
    tools: params.tools,
    metadata: params.metadata,
    thinking: params.thinking,
  });
  
  // 7.4 发送 HTTP POST 请求
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: body,
  });
  
  // 7.5 解析响应
  if (!response.ok) {
    throw new APIError(response.status, await response.text());
  }
  
  return await response.json();
}
```

### 实际 HTTP 请求示例

#### API Key 模式的请求

```http
POST /v1/messages HTTP/1.1
Host: api.anthropic.com
x-api-key: sk-ant-api03-xxx
anthropic-version: 2023-06-01
anthropic-beta: interleaved-thinking-2025-05-14
content-type: application/json
x-app: cli
user-agent: claude-cli/2.1.0

{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 21000,
  "system": "You are a helpful assistant...",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ]
}
```

#### OAuth 模式的请求

```http
POST /v1/messages HTTP/1.1
Host: api.anthropic.com
authorization: Bearer eyJ...  ← ⭐ OAuth Token
anthropic-version: 2023-06-01
anthropic-beta: claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14  ← ⭐ 特殊 betas
content-type: application/json
x-app: cli
user-agent: claude-cli/2.1.0

{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 21000,
  "system": [  ← ⭐ 数组格式，包含身份标识
    {
      "type": "text",
      "text": "You are Claude Code, Anthropic's official CLI for Claude.",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "metadata": {  ← ⭐ 会话元数据
    "user_id": "user_xxx_account_yyy_session_zzz"
  }
}
```

## 关键区分点

### API Key vs OAuth 的底层差异

| 特性              | API Key 模式                      | OAuth 模式                                    |
| ----------------- | --------------------------------- | --------------------------------------------- |
| **认证头**        | `x-api-key: sk-ant-...`           | `authorization: Bearer eyJ...`                |
| **Betas**         | `interleaved-thinking-2025-05-14` | `claude-code-20250219, oauth-2025-04-20, ...` |
| **System Prompt** | 字符串                            | 数组（必须包含 Claude Code 身份）             |
| **Metadata**      | 可选                              | 必需（user_id）                               |
| **Models**        | 所有模型                          | 订阅用户全部，非订阅仅 Haiku                  |

### 代码中的判断位置

```typescript
// 1. ClaudeClient 构造函数
if (authToken) {
  this.isOAuth = true;  // ⭐ 设置模式标志
}

// 2. 构建 betas
function buildBetas(model: string, isOAuth: boolean): string[] {
  const betas: string[] = [];
  if (isOAuth) {
    betas.push('claude-code-20250219');  // ⭐ OAuth 特有
    betas.push('oauth-2025-04-20');
  }
  betas.push('interleaved-thinking-2025-05-14');
  return betas;
}

// 3. 格式化 System Prompt
function formatSystemPrompt(prompt: string, isOAuth: boolean) {
  if (!isOAuth) {
    return prompt;  // API Key：直接返回
  }
  // OAuth：转换为数组格式并添加身份
  return [
    { type: 'text', text: 'You are Claude Code...', cache_control: {...} },
    { type: 'text', text: prompt, cache_control: {...} }
  ];
}
```

## 配置如何影响底层调用

### 自定义 API Base URL

```typescript
// 用户配置
config.apiBaseUrl = "https://custom-api.example.com";

// ↓ 传递给 createClient
const client = new Anthropic({
  baseURL: "https://custom-api.example.com"  // ⭐ 改变请求目标
});

// ↓ HTTP 请求
POST https://custom-api.example.com/v1/messages
```

### 自定义 API Key

```typescript
// 用户配置
config.apiKey = "sk-custom-key-123";

// ↓ 传递给 Anthropic SDK
new Anthropic({
  apiKey: "sk-custom-key-123"  // ⭐ 使用自定义 Key
});

// ↓ HTTP 请求头
x-api-key: sk-custom-key-123
```

### Auth Priority 配置

```typescript
// 用户配置
config.authPriority = "apiKey";  // 强制使用 API Key

// ↓ 在 getAnthropicApiConfig 中判断
if (authPriority === 'apiKey') {
  apiKey = config.apiKey;  // ⭐ 忽略 OAuth
} else if (authPriority === 'oauth') {
  apiKey = auth.authToken;  // ⭐ 忽略 API Key
} else {  // 'auto'
  apiKey = config.apiKey || auth.authToken;  // ⭐ 优先 API Key
}
```

## 完整调用示例

### 从前端点击"测试连接"到 API 响应

```typescript
// 1. 前端触发
handleTest() {
  fetch('/api/config/api/test', {
    method: 'POST',
    body: JSON.stringify({ apiKey, apiBaseUrl, customModelName })
  });
}

// 2. 后端接收 (config-api.ts)
app.post('/api/config/api/test', async (req, res) => {
  const { apiBaseUrl, apiKey, customModelName } = req.body;
  
  // 3. 创建临时客户端
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({
    apiKey: apiKey,      // ⭐ 用户配置的 Key
    baseURL: apiBaseUrl  // ⭐ 用户配置的 URL
  });
  
  // 4. 发送测试请求
  const response = await client.messages.create({
    model: customModelName || 'claude-3-5-haiku-20241022',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Hi' }]
  });
  
  // 5. 返回结果
  res.json({ success: true, model: response.model });
});
```

### HTTP 请求追踪

```bash
# 用户配置
apiBaseUrl: "https://my-proxy.com"
apiKey: "sk-my-key-123"

# ↓ 生成的 HTTP 请求
POST https://my-proxy.com/v1/messages
x-api-key: sk-my-key-123
content-type: application/json

{
  "model": "claude-3-5-haiku-20241022",
  "max_tokens": 10,
  "messages": [{"role": "user", "content": "Hi"}]
}

# ↓ Anthropic API 响应
{
  "id": "msg_xxx",
  "model": "claude-3-5-haiku-20241022",
  "content": [{"type": "text", "text": "Hello!"}],
  "usage": {"input_tokens": 10, "output_tokens": 5}
}
```

## 总结

### 配置 → HTTP 的数据流

```
用户界面配置
  ↓
ConfigManager 存储
  ↓
getAuth() + ConfigManager.getAll()
  ↓
createClient() 决定认证类型
  ↓
new ClaudeClient() 设置 isOAuth
  ↓
new Anthropic() SDK 初始化
  ↓
createMessage() 构建请求参数
  ↓
buildBetas() + formatSystemPrompt()  ← 根据 isOAuth 不同
  ↓
client.beta.messages.create()
  ↓
Anthropic SDK 内部
  ↓
fetch() HTTP POST
  ↓
Headers:
  - x-api-key (API Key 模式)
  或
  - authorization: Bearer xxx (OAuth 模式)
Body:
  - betas: [...] (不同模式不同)
  - system: 字符串 或 数组 (不同模式不同)
  ↓
Anthropic API 服务器
```

### 关键文件调用链

1. `src/web/client/src/components/config/ApiConfigPanel.tsx` - 用户配置UI
2. `src/web/server/routes/config-api.ts` - API 测试端点
3. `src/web/server/services/config-service.ts` - 配置存储
4. `src/auth/index.ts` - 认证信息获取
5. `src/providers/index.ts` - **创建 Anthropic 客户端** ⭐
6. `src/core/client.ts` - **ClaudeClient 封装** ⭐
7. `node_modules/@anthropic-ai/sdk` - **Anthropic SDK** ⭐
8. **HTTP 请求** → Anthropic API 服务器

每一层都正确传递和使用了用户的配置！
