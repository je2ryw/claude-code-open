# OAuth 和 API Key 客户端区分机制

## 核心认证类型定义

### AuthConfig 接口
位置：`src/auth/index.ts`

```typescript
export interface AuthConfig {
  type: 'api_key' | 'oauth';      // 认证类型标识 ⭐
  accountType?: AccountType;      // 账户类型
  apiKey?: string;                 // API Key（API Key模式）
  authToken?: string;              // OAuth access token（OAuth模式）
  accessToken?: string;            // OAuth access token（同上）
  refreshToken?: string;           // OAuth refresh token
  expiresAt?: number;              // Token过期时间
  scope?: string[];                // OAuth scopes
  scopes?: string[];               // OAuth scopes（别名）
  userId?: string;                 // 用户ID
  email?: string;                  // 用户邮箱
  // OAuth创建的临时API Key
  oauthApiKey?: string;            // 用于非订阅用户
  oauthApiKeyExpiresAt?: number;
}
```

## 认证初始化流程

### initAuth() 函数优先级
位置：`src/auth/index.ts:244-363`

```
1. 环境变量 API Key（最高优先级）
   ├─ ANTHROPIC_API_KEY
   └─ CLAUDE_API_KEY
   
2. OAuth Token（订阅用户）
   ├─ 读取 ~/.claude/.credentials.json (claudeAiOauth)
   ├─ 检查是否有 user:inference scope
   └─ 有 scope → 直接使用 OAuth token ⭐订阅用户

3. Primary API Key（非订阅用户）
   ├─ 读取 ~/.claude/config.json (primaryApiKey)
   └─ OAuth 没有 inference scope 时使用

4. macOS Keychain（如果可用）

5. 未加密的API Key文件
   └─ ~/.claude/credentials.json

6. 自定义OAuth Token（加密存储）
   └─ ~/.claude/auth.json
```

## 关键区分点

### 1. 认证类型判断

**getAuthType() 函数**
```typescript
export function getAuthType(): 'api_key' | 'oauth' | null {
  return currentAuth?.type || null;
}
```

### 2. 订阅用户的特殊标识

**hasInferenceScope() 函数**
```typescript
function hasInferenceScope(scopes?: string[]): boolean {
  return Boolean(scopes?.includes('user:inference'));
}
```

**关键逻辑：**
- ✅ **有 `user:inference` scope** = 订阅用户（Pro/Team/Enterprise）
  - 可以直接使用 OAuth token
  - 支持所有模型（Opus, Sonnet, Haiku）
  - 不需要创建临时 API Key

- ❌ **没有 `user:inference` scope** = 非订阅用户（Free tier）
  - 需要使用 `primaryApiKey`
  - 或者通过 OAuth 创建临时 API Key
  - 模型访问受限

### 3. 客户端创建时的区分

**ApiManager 初始化**
位置：`src/web/server/api-manager.ts:22-41`

```typescript
private initializeClient(): void {
  const auth = getAuth();
  const apiKey = auth?.apiKey || configManager.getApiKey();
  const authToken = auth?.type === 'oauth' 
    ? (auth.accessToken || auth.authToken) 
    : undefined; // ⭐ 根据 type 决定使用哪个token

  this.client = new ClaudeClient({
    apiKey,      // API Key模式下有值
    authToken,   // OAuth模式下有值
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  });
}
```

### 4. 模型可用性判断

**getAvailableModels() 函数**
位置：`src/web/server/api-manager.ts:101-126`

```typescript
async getAvailableModels(): Promise<string[]> {
  const allModels = modelConfig.getAllModels().map(m => m.id);
  const auth = getAuth();
  
  if (auth?.type === 'oauth') {
    // OAuth模式 - 检查scope
    const scopes = auth.scope || auth.scopes || [];
    if (scopes.includes('user:inference')) {
      // 订阅用户 - 所有模型可用
      return allModels;
    } else {
      // 非订阅用户 - 仅Haiku可用
      return allModels.filter(m => m.includes('haiku'));
    }
  }
  
  // API Key模式 - 所有模型可用
  return allModels;
}
```

### 5. Token 状态查询

**getTokenStatus() 函数**
位置：`src/web/server/api-manager.ts:183-234`

```typescript
getTokenStatus(): ApiStatusPayload['tokenStatus'] {
  const auth = getAuth();
  
  if (auth?.type === 'api_key') {
    return {
      type: 'api_key',  // ⭐ 返回API Key类型
      valid: !!auth.apiKey,
    };
  }
  
  if (auth?.type === 'oauth') {
    return {
      type: 'oauth',    // ⭐ 返回OAuth类型
      valid: !!token && !isExpired,
      expiresAt,
      scope: scopes,     // ⭐ 包含scope信息
    };
  }
  
  return { type: 'none', valid: false };
}
```

## 流程图

### 认证初始化流程

```
┌─────────────────┐
│  initAuth()     │
└────────┬────────┘
         │
         ├───1──→ 环境变量 API Key? ───Yes──→ [API Key模式]
         │                  │
         │                  No
         │                  ↓
         ├───2──→ .credentials.json (OAuth)?
         │                  │
         │                  ├──→ user:inference scope?
         │                  │         │
         │                  │        Yes → [OAuth订阅模式] ✅
         │                  │         │
         │                  │        No
         │                  │         ↓
         ├───3──→ config.json (primaryApiKey)? ───Yes──→ [API Key模式]
         │                  │
         │                  No
         │                  ↓
         ├───4──→ Keychain? ───Yes──→ [API Key模式]
         │                  │
         │                  No
         │                  ↓
         └───5──→ auth.json? ───Yes──→ [OAuth自定义模式]
                            │
                           No → null
```

### 客户端创建流程

```
┌──────────────────┐
│   getAuth()      │
└────────┬─────────┘
         │
         ├── type === 'api_key'? ────Yes──→ new Anthropic({ apiKey })
         │        │
         │       No
         │        ↓
         └── type === 'oauth'? ──────Yes──→ new Anthropic({ apiKey: authToken })
                  │                             或
                 No                          new Anthropic({ apiKey: oauthApiKey })
                  ↓
              Error
```

## 实际使用示例

### 场景 1：订阅用户（Pro/Team/Enterprise）

```typescript
// ~/.claude/.credentials.json
{
  "claudeAiOauth": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresAt": 1234567890000,
    "scopes": ["user:inference", "user:profile"]  // ⭐ 有inference
  }
}

// 初始化结果
currentAuth = {
  type: 'oauth',               // ⭐ OAuth 类型
  accountType: 'subscription',  // ⭐ 订阅账户
  authToken: "eyJ...",         // 直接使用OAuth token
  scopes: ["user:inference", "user:profile"]
}

// 可用模型：全部（Opus, Sonnet, Haiku）
```

### 场景 2：非订阅用户（Free tier）

```typescript
// ~/.claude/.credentials.json
{
  "claudeAiOauth": {
    "accessToken": "eyJ...",
    "scopes": ["user:profile"]  // ⭐ 没有inference scope
  }
}

// ~/.claude/config.json
{
  "primaryApiKey": "sk-ant-..."  // ⭐ 使用这个
}

// 初始化结果
currentAuth = {
  type: 'api_key',        // ⭐ API Key 类型
  accountType: 'api',
  apiKey: "sk-ant-..."    // 使用primaryApiKey
}

// 可用模型：全部（通过API Key）
```

### 场景 3：纯API Key用户

```typescript
// 环境变量
ANTHROPIC_API_KEY=sk-ant-...

// 初始化结果
currentAuth = {
  type: 'api_key',        // ⭐ API Key 类型
  accountType: 'api',
  apiKey: "sk-ant-..."
}

// 可用模型：全部
```

## 如何在代码中使用

### 1. 检查认证类型

```typescript
import { getAuth, getAuthType } from './auth/index.js';

const authType = getAuthType();
if (authType === 'oauth') {
  console.log('使用 OAuth 认证');
} else if (authType === 'api_key') {
  console.log('使用 API Key 认证');
}
```

### 2. 获取认证信息

```typescript
const auth = getAuth();
if (auth?.type === 'oauth') {
  const token = auth.accessToken || auth.authToken;
  const scopes = auth.scope || auth.scopes || [];
  const isSubscription = scopes.includes('user:inference');
  
  console.log('OAuth Token:', token);
  console.log('Is Subscription:', isSubscription);
}
```

### 3. 创建客户端

```typescript
import { getAuth } from './auth/index.js';
import Anthropic from '@anthropic-ai/sdk';

const auth = getAuth();
const client = auth?.type === 'oauth' 
  ? new Anthropic({ apiKey: auth.authToken || auth.accessToken })
  : new Anthropic({ apiKey: auth?.apiKey });
```

### 4. 检查模型权限

```typescript
import { apiManager } from './web/server/api-manager.js';

const availableModels = await apiManager.getAvailableModels();
const canUseOpus = availableModels.some(m => m.includes('opus'));

if (!canUseOpus) {
  console.log('当前认证无法使用Opus模型');
}
```

## 配置新增字段的集成

根据你新增的 `apiBaseUrl`, `apiKey`, `customModelName`, `authPriority` 配置，需要这样集成：

```typescript
// 1. 更新 providers/index.ts 的 getAnthropicApiConfig
function getAnthropicApiConfig(config: ProviderConfig): { apiKey: string; baseURL: string } {
  // 优先级：配置 > OAuth > 环境变量
  const auth = getAuth();
  
  // 根据 authPriority 决定
  const authPriority = config.authPriority || 'auto';
  
  let apiKey: string | undefined;
  
  if (authPriority === 'apiKey' || (authPriority === 'auto' && config.apiKey)) {
    // 使用 API Key
    apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  } else if (authPriority === 'oauth' || (authPriority === 'auto' && auth?.type === 'oauth')) {
    // 使用 OAuth
    apiKey = auth?.authToken || auth?.accessToken;
  }
  
  const baseURL = config.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  
  if (!apiKey) {
    throw new Error('No API key or OAuth token available');
  }
  
  return { apiKey, baseURL };
}
```

## 总结

### API Key 客户端特征
- ✅ `type: 'api_key'`
- ✅ 使用 `apiKey` 字段
- ✅ 所有模型可用
- ✅ 来源：环境变量、primaryApiKey、credentials.json、Keychain

### OAuth 订阅客户端特征
- ✅ `type: 'oauth'`
- ✅ 使用 `authToken` / `accessToken` 字段
- ✅ **有 `user:inference` scope** ⭐
- ✅ 所有模型可用
- ✅ 来源：.credentials.json (claudeAiOauth)

### OAuth 非订阅客户端特征
- ⚠️ `type: 'oauth'`
- ⚠️ **没有 `user:inference` scope**
- ⚠️ 需要创建 `oauthApiKey` 或使用 `primaryApiKey`
- ⚠️ 通常降级为 API Key 模式使用

### 关键判断点
1. **`auth.type`** - 区分 OAuth 还是 API Key
2. **`user:inference` scope** - 区分订阅用户还是非订阅用户
3. **`authToken` vs `apiKey`** - 决定使用哪个凭证
4. **`authPriority`** - 自定义优先级（新增）
