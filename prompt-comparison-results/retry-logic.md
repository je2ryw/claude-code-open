# 重试逻辑对比报告

## 概述

对比项目实现与官方 Claude Code v2.0.76 源码中的重试逻辑相关代码和提示词。

## 项目文件

- `/home/user/claude-code-open/src/core/retryLogic.ts` - 上下文溢出自动恢复逻辑
- `/home/user/claude-code-open/src/network/retry.ts` - 网络请求重试策略

## 官方源码位置

- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. 上下文溢出恢复逻辑 (Context Overflow Recovery)

### 项目实现 (`src/core/retryLogic.ts`)

#### 常量定义
```typescript
// 最小输出 tokens（官方源码 lY0 = 3000）
const MIN_OUTPUT_TOKENS = 3000;

// 保留空间（避免精确边界）
const RESERVE_BUFFER = 1000;
```

#### 错误解析
```typescript
/**
 * 解析上下文溢出错误
 *
 * 错误格式示例：
 * "input length and `max_tokens` exceed context limit: 195000 + 8192 > 200000"
 */
export function parseContextOverflowError(error: any): ContextOverflowError | null {
  if (error.status !== 400 || !error.message) {
    return null;
  }

  const pattern = /input length and `max_tokens` exceed context limit: (\d+) \+ (\d+) > (\d+)/;
  const match = error.message.match(pattern);
  // ...解析逻辑
}
```

#### max_tokens 调整策略
```typescript
/**
 * 计算调整后的 max_tokens
 *
 * 策略：
 * 1. 计算可用空间 = contextLimit - inputTokens - reserve
 * 2. 如果可用空间 < MIN_OUTPUT_TOKENS，无法恢复
 * 3. 否则，返回 max(MIN_OUTPUT_TOKENS, available, thinkingTokens + 1)
 */
export function calculateAdjustedMaxTokens(
  overflow: ContextOverflowError,
  maxThinkingTokens: number = 0
): number | null {
  const { inputTokens, contextLimit } = overflow;
  const available = Math.max(0, contextLimit - inputTokens - RESERVE_BUFFER);

  if (available < MIN_OUTPUT_TOKENS) {
    return null;
  }

  const thinking = maxThinkingTokens + 1;
  const adjusted = Math.max(MIN_OUTPUT_TOKENS, available, thinking);

  return adjusted;
}
```

#### 重试执行
```typescript
export async function executeWithOverflowRecovery<T>(
  executeRequest: (maxTokens?: number) => Promise<T>,
  options: {
    maxTokens?: number;
    maxThinkingTokens?: number;
    maxRetries?: number;  // 默认 3
    onRetry?: (attempt: number, adjustedMaxTokens: number) => void;
  } = {}
): Promise<T>
```

### 官方实现 (cli.js)

#### 常量定义
```javascript
var RX5=10,     // 默认最大重试次数
    lY0=3000,   // 最小输出 tokens (MIN_OUTPUT_TOKENS)
    _X5=3,      // 回退触发阈值
    jX5=500     // 基础延迟（毫秒）
```

#### 核心重试函数 `d71`
```javascript
async function*d71(A,Q,B){
  let G=yX5(B),  // 获取最大重试次数
      Z={model:B.model,maxThinkingTokens:B.maxThinkingTokens},
      Y=null,
      J=0,
      X;

  for(let I=1;I<=G+1;I++){
    if(B.signal?.aborted)throw new LX;

    try{
      if(Y===null||X instanceof F9&&X.status===401||HY2(X))
        Y=await A();
      return await Q(Y,I,Z)
    }catch(W){
      X=W,

      // 处理 529 过载错误和 Opus 回退
      if(PX5(W)&&(process.env.FALLBACK_FOR_ALL_PRIMARY_MODELS||!zB()&&UZA(B.model))){
        if(J++,J>=_X5){
          if(B.fallbackModel)
            throw n("tengu_api_opus_fallback_triggered",{...}),
                  new m71(B.model,B.fallbackModel);
          if(!process.env.IS_SANDBOX)
            throw n("tengu_api_custom_529_overloaded_error",{}),
                  new _o(Error(pY0),Z)
        }
      }

      if(I>G)throw new _o(W,Z);
      if(!SX5(W)&&(!(W instanceof F9)||!xX5(W)))
        throw new _o(W,Z);

      // 处理上下文溢出
      if(W instanceof F9){
        let D=VY2(W);  // 解析上下文溢出错误
        if(D){
          let{inputTokens:F,contextLimit:E}=D,
              z=1000,  // RESERVE_BUFFER
              $=Math.max(0,E-F-1000);

          if($<lY0)  // 如果可用空间 < MIN_OUTPUT_TOKENS
            throw t(Error(`availableContext ${$} is less than FLOOR_OUTPUT_TOKENS ${lY0}`)),W;

          let L=(Z.maxThinkingTokens||0)+1,
              N=Math.max(lY0,$,L);  // 调整后的 max_tokens

          Z.maxTokensOverride=N,
          n("tengu_max_tokens_context_overflow_adjustment",{
            inputTokens:F,
            contextLimit:E,
            adjustedMaxTokens:N,
            attempt:I
          });
          continue
        }
      }

      // 计算重试延迟
      let V=TX5(W),  // 从 retry-after header 获取
          H=iY0(I,V);  // 计算延迟

      if(W instanceof F9)
        yield DY2(W,H,I,G);  // 生成进度信息

      n("tengu_api_retry",{
        attempt:I,
        delayMs:H,
        error:W.message,
        status:W.status,
        provider:wj()
      }),
      await k71(H,B.signal)  // 等待后重试
    }
  }
  throw new _o(X,Z)
}
```

#### 上下文溢出解析 `VY2`
```javascript
function VY2(A){
  if(A.status!==400||!A.message)return;
  if(!A.message.includes("input length and `max_tokens` exceed context limit"))return;

  let Q=/input length and `max_tokens` exceed context limit: (\d+) \+ (\d+) > (\d+)/,
      B=A.message.match(Q);

  if(!B||B.length!==4)return;
  if(!B[1]||!B[2]||!B[3]){
    t(Error("Unable to parse max_tokens from max_tokens exceed context limit error message"));
    return
  }

  let G=parseInt(B[1],10),  // inputTokens
      Z=parseInt(B[2],10),  // maxTokens
      Y=parseInt(B[3],10);  // contextLimit

  if(isNaN(G)||isNaN(Z)||isNaN(Y))return;

  return{inputTokens:G,maxTokens:Z,contextLimit:Y}
}
```

#### 延迟计算 `iY0`
```javascript
function iY0(A,Q){
  if(Q){
    let Z=parseInt(Q,10);
    if(!isNaN(Z))return Z*1000
  }

  let B=Math.min(jX5*Math.pow(2,A-1),32000),  // 指数退避，最大 32s
      G=Math.random()*0.25*B;  // 25% 抖动

  return B+G
}
```

### 差异分析

#### 相同点 ✅
1. **MIN_OUTPUT_TOKENS 常量**: 都是 3000
2. **RESERVE_BUFFER 常量**: 都是 1000
3. **错误消息模式**: 都使用相同的正则表达式解析
4. **调整策略**: 都使用 `Math.max(MIN_OUTPUT_TOKENS, available, thinkingTokens + 1)`

#### 差异点 ⚠️

| 特性 | 项目实现 | 官方实现 |
|------|---------|---------|
| **默认最大重试次数** | 3 次 | 10 次 (RX5=10) |
| **返回类型** | Promise | AsyncGenerator (yield 进度) |
| **延迟策略** | 项目未实现 | 指数退避 + 抖动 |
| **遥测事件** | 无 | 有 (tengu_api_retry, tengu_max_tokens_context_overflow_adjustment) |
| **进度报告** | 简单 console.warn | yield 生成器，返回进度对象 |
| **Opus 回退** | 不支持 | 支持 (_X5=3 次后触发) |
| **retry-after header** | 不支持 | 支持 (TX5 函数) |

---

## 2. 网络重试策略 (Network Retry)

### 项目实现 (`src/network/retry.ts`)

#### 配置接口
```typescript
export interface RetryConfig {
  maxRetries?: number;        // 默认 4
  baseDelay?: number;         // 默认 1000ms
  maxDelay?: number;          // 默认 30000ms
  exponentialBackoff?: boolean; // 默认 true
  jitter?: number;            // 默认 0.1 (10%)
  retryableErrors?: string[];
  retryableStatusCodes?: number[];
}
```

#### 可重试错误
```typescript
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 4,
  baseDelay: 1000,
  maxDelay: 30000,
  exponentialBackoff: true,
  jitter: 0.1,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EAI_AGAIN',
    'overloaded_error',
    'rate_limit_error',
    'api_error',
    'timeout',
  ],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};
```

#### 延迟计算
```typescript
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = {}
): number {
  const {
    baseDelay = DEFAULT_RETRY_CONFIG.baseDelay,
    maxDelay = DEFAULT_RETRY_CONFIG.maxDelay,
    exponentialBackoff = DEFAULT_RETRY_CONFIG.exponentialBackoff,
    jitter = DEFAULT_RETRY_CONFIG.jitter,
  } = config;

  let delay = baseDelay;

  if (exponentialBackoff) {
    delay = baseDelay * Math.pow(2, attempt);
  }

  // 应用抖动 (避免惊群效应)
  if (jitter > 0) {
    const jitterAmount = delay * jitter;
    const randomJitter = Math.random() * jitterAmount * 2 - jitterAmount;
    delay += randomJitter;
  }

  // 限制最大延迟
  return Math.min(delay, maxDelay);
}
```

### 官方实现 (cli.js)

#### 可重试判断 `xX5`
```javascript
function xX5(A){
  if(GY2(A))return!1;  // 429 + claudeai 特殊处理
  if(A.message?.includes('"type":"overloaded_error"'))return!0;
  if(VY2(A))return!0;  // 上下文溢出可重试

  let Q=A.headers?.get("x-should-retry");
  if(Q==="true"&&!zB())return!0;
  if(Q==="false")return!1;
  if(A instanceof SC)return!0;  // 连接错误
  if(!A.status)return!1;
  if(A.status===408)return!0;
  if(A.status===409)return!0;
  if(A.status===429)return!zB();  // 429 仅对非 claudeai
  if(A.status===401)return GsA(),!0;
  if(A.status&&A.status>=500)return!0;

  return!1
}
```

#### 延迟计算 `iY0`
```javascript
function iY0(A,Q){
  if(Q){  // 如果有 retry-after header
    let Z=parseInt(Q,10);
    if(!isNaN(Z))return Z*1000
  }

  let B=Math.min(jX5*Math.pow(2,A-1),32000),  // 指数退避
      G=Math.random()*0.25*B;  // 25% 抖动

  return B+G
}
```

### 差异分析

| 特性 | 项目实现 | 官方实现 |
|------|---------|---------|
| **基础延迟** | 1000ms | 500ms (jX5) |
| **最大延迟** | 30000ms | 32000ms |
| **抖动比例** | ±10% | ±12.5% |
| **retry-after** | 不支持 | **支持** ⚠️ |
| **x-should-retry header** | 不支持 | **支持** ⚠️ |
| **401 自动重试** | 不支持 | 支持 (调用 GsA()) |
| **429 特殊处理** | 简单重试 | 区分 claudeai/API |
| **上下文溢出** | 单独处理 | 集成在重试判断中 |

---

## 3. 错误消息和提示词

### 官方错误消息常量

```javascript
var SV="API Error",
    uKA="Prompt is too long",
    b71="Credit balance is too low",
    f71="Invalid API key · Please run /login",
    h71="Invalid API key · Fix external API key",
    XL="(no content)",
    g71="OAuth token revoked · Please run /login",
    pY0="Repeated 529 Overloaded errors",
    y2A="Opus is experiencing high load, please use /model to switch to Sonnet",
    u71="Request timed out",
    qX5="PDF too large. Please double press esc to edit your message and try again.",
    NX5="PDF is password protected. Please double press esc to edit your message and try again.",
    LX5="Image was too large. Double press esc to go back and try again with a smaller image.",
    OX5="Your account does not have access to Claude Code. Please run /login.";
```

### 错误处理函数 `cY0` (部分)

```javascript
function cY0(A,Q,B){
  if(A instanceof Ov||A instanceof SC&&A.message.toLowerCase().includes("timeout"))
    return eJ({content:u71,error:"unknown"});

  if(A instanceof Error&&A.message.includes(y2A))
    return eJ({content:y2A,error:"rate_limit"});

  if(A instanceof F9&&A.status===429&&bKA(zB())){
    let G=A.headers?.get?.("anthropic-ratelimit-unified-representative-claim"),
        Z=A.headers?.get?.("anthropic-ratelimit-unified-overage-status");
    // ...处理统一速率限制逻辑
  }

  if(A instanceof Error&&A.message.toLowerCase().includes("prompt is too long"))
    return eJ({content:uKA,error:"invalid_request"});

  // ...更多错误处理
}
```

### 项目中缺失的错误消息

项目实现中缺少以下官方错误提示词：

1. **速率限制相关**:
   - "Opus is experiencing high load, please use /model to switch to Sonnet"
   - "Repeated 529 Overloaded errors"

2. **认证相关**:
   - "OAuth token revoked · Please run /login"
   - "Your account does not have access to Claude Code. Please run /login."

3. **资源限制**:
   - "PDF too large. Please double press esc..."
   - "PDF is password protected..."
   - "Image was too large..."

---

## 4. 遥测和日志

### 官方实现的遥测事件

```javascript
n("tengu_api_retry", {
  attempt: I,
  delayMs: H,
  error: W.message,
  status: W.status,
  provider: wj()
})

n("tengu_max_tokens_context_overflow_adjustment", {
  inputTokens: F,
  contextLimit: E,
  adjustedMaxTokens: N,
  attempt: I
})

n("tengu_api_opus_fallback_triggered", {
  original_model: B.model,
  fallback_model: B.fallbackModel,
  provider: wj()
})
```

### 项目实现

项目中使用简单的 `console.warn` 和 `console.error`，缺少结构化的遥测事件。

---

## 5. 关键功能差异总结

### 项目缺失的功能 ⚠️

1. **retry-after header 支持**: 官方会优先使用服务器返回的重试延迟
2. **x-should-retry header**: 官方支持服务器端控制重试行为
3. **Opus 模型回退机制**: 遇到连续 529 错误时自动切换模型
4. **进度报告生成器**: 官方使用 async generator 实时返回重试进度
5. **统一速率限制处理**: 官方有复杂的速率限制状态管理
6. **结构化遥测**: 官方记录详细的重试和错误事件

### 项目多余的功能 ℹ️

1. **装饰器支持**: `retry()` 装饰器，官方未使用
2. **更灵活的配置**: 项目支持更多可定制的重试配置选项

---

## 6. 建议改进

### 高优先级 🔴

1. **添加 retry-after header 支持**
   ```typescript
   function getRetryAfter(error: any): number | null {
     const retryAfter = error.headers?.get?.('retry-after');
     if (retryAfter) {
       const seconds = parseInt(retryAfter, 10);
       if (!isNaN(seconds)) return seconds * 1000;
     }
     return null;
   }
   ```

2. **实现进度报告生成器**
   ```typescript
   async function* executeWithProgress<T>(...) {
     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         return await executeRequest();
       } catch (error) {
         yield { attempt, error, delay };
         await sleep(delay);
       }
     }
   }
   ```

3. **统一最大重试次数**: 改为 10 次（与官方一致）

### 中优先级 🟡

1. **添加 x-should-retry header 支持**
2. **实现 Opus 模型回退机制**
3. **添加结构化日志/遥测**
4. **调整基础延迟**: 500ms -> 1000ms 或保持 500ms 与官方一致

### 低优先级 🟢

1. 添加官方错误消息常量
2. 实现统一速率限制状态管理
3. 区分 claudeai 和 API 的 429 处理

---

## 7. 代码对照表

### 函数名映射

| 官方函数名 | 项目函数名 | 说明 |
|-----------|----------|------|
| `d71` | `executeWithOverflowRecovery` | 主重试循环 |
| `VY2` | `parseContextOverflowError` | 解析溢出错误 |
| `iY0` | `calculateRetryDelay` | 计算延迟 |
| `xX5` | `isRetryableError` | 判断可重试 |
| `lY0` | `MIN_OUTPUT_TOKENS` | 最小输出 tokens |
| `RX5` | - | 默认最大重试次数 (10) |
| `jX5` | `baseDelay` | 基础延迟 (500ms) |

### 常量映射

| 官方常量 | 值 | 项目常量 | 值 |
|---------|---|---------|---|
| `lY0` | 3000 | `MIN_OUTPUT_TOKENS` | 3000 ✅ |
| `RX5` | 10 | `maxRetries` 默认 | 3 ❌ |
| `jX5` | 500 | `baseDelay` 默认 | 1000 ❌ |
| reserve | 1000 | `RESERVE_BUFFER` | 1000 ✅ |
| `_X5` | 3 | - | - (Opus 回退阈值) |

---

## 结论

项目实现了官方重试逻辑的**核心功能**（上下文溢出恢复、指数退避、抖动），但缺少一些**高级特性**：

1. ✅ **已正确实现**: 上下文溢出解析、max_tokens 调整、基本重试逻辑
2. ⚠️ **需要改进**: retry-after 支持、默认重试次数、进度报告
3. ❌ **缺失功能**: Opus 回退、x-should-retry、统一速率限制、遥测

建议优先实现 retry-after header 支持和调整默认重试次数，以更好地与官方行为保持一致。
