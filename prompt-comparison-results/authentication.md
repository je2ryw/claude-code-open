# 认证系统提示词对比报告

## 概述

本报告对比了项目中认证系统的提示词、错误消息和用户界面文本与官方 Claude Code CLI 源码的差异。

---

## 1. 命令描述对比

### 1.1 setup-token 命令

**项目实现** (`src/auth/index.ts`)
```
未实现此命令
```

**官方实现** (`cli.js` line 5034)
```
"Set up a long-lived authentication token (requires Claude subscription)"
```

**差异分析：**
- ❌ **项目缺失**：项目中没有实现 `setup-token` 命令
- ✅ **官方功能**：官方明确说明此功能需要 Claude 订阅
- 📝 **建议**：应添加 `setup-token` 命令并使用官方的描述文本

---

## 2. 账户类型提示词对比

### 2.1 Claude.ai 账户描述

**项目实现** (`src/auth/index.ts` lines 28-29, 122-129)
```typescript
export type AccountType = 'claude.ai' | 'console' | 'api' | 'subscription';

// OAuth 端点配置
const OAUTH_ENDPOINTS: Record<'claude.ai' | 'console', OAuthConfig> = {
  'claude.ai': {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    authorizationEndpoint: 'https://claude.ai/oauth/authorize',
    deviceCodeEndpoint: 'https://claude.ai/oauth/device/code',
    tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    scope: OAUTH_SCOPES,
  },
```

**官方实现** (`cli.js` line 1718)
```javascript
{
  label: "Claude.ai account · Subscription billing",
  value: "claudeai"
}
```

**官方实现** (`cli.js` line 1718)
```javascript
{
  label: "Anthropic Console account · API usage billing",
  value: "console"
}
```

**差异分析：**
- ⚠️ **描述文本差异**：
  - 项目：缺少用户友好的描述文本
  - 官方：明确标注 "Subscription billing" vs "API usage billing"
- ✅ **端点配置**：项目的 OAuth 端点配置基本正确
- 📝 **建议**：在 CLI 选项中添加类似的描述性文本

---

## 3. 认证警告提示对比

### 3.1 已配置认证警告

**项目实现**
```
未找到相关警告
```

**官方实现** (`cli.js` line 5034-5035)
```
Warning: You already have authentication configured via environment variable or API key helper.
```

**差异分析：**
- ❌ **项目缺失**：未实现重复认证警告
- ✅ **官方功能**：检查并警告用户已有认证配置
- 📝 **建议**：在 OAuth 登录流程中添加此警告

---

## 4. 认证错误消息对比

### 4.1 Session 过期错误

**项目实现**
```
未找到相关错误处理
```

**官方实现** (`cli.js`)
```
"Session expired. Please run /login to sign in again."
```

**差异分析：**
- ⚠️ **错误消息格式**：官方使用斜杠命令格式 `/login`
- 📝 **建议**：统一使用斜杠命令格式的错误提示

### 4.2 认证类型不匹配错误

**项目实现**
```
未找到
```

**官方实现** (`cli.js`)
```
"Claude.ai account. API key authentication is not sufficient. Please run /login to authenticate, or check your authentication status with /status."
```

**差异分析：**
- ❌ **项目缺失**：缺少详细的认证方式说明
- ✅ **官方功能**：明确告知用户需要使用 OAuth 而非 API key
- 📝 **建议**：添加更明确的认证方式错误提示

---

## 5. 认证流程提示词对比

### 5.1 Authorization Code Flow 提示

**项目实现** (`src/auth/index.ts` lines 545-565)
```typescript
console.log('\n╭─────────────────────────────────────────╮');
console.log(`│  OAuth Login - ${accountType.padEnd(25)}│`);
console.log('╰─────────────────────────────────────────╯\n');

console.log('Opening browser to sign in...');
console.log('✓ Browser opened. Please complete the authorization in your browser.\n');

console.log('After authorizing, you will see a success page with a code.');
console.log('Look for "Authorization code" on the page and copy the entire code.');
console.log('\n⚠️  Important: The code expires quickly, please paste it promptly!\n');
```

**官方实现**
```
未在压缩代码中找到明确的提示文本
```

**差异分析：**
- ✅ **项目优势**：项目提供了更详细的用户引导
- 📝 **改进建议**：保持当前的详细提示，这对用户体验有帮助

### 5.2 Token 交换失败提示

**项目实现** (`src/auth/index.ts` lines 833-845)
```typescript
'Authentication failed: Invalid authorization code.\n\n' +
'This can happen if:\n' +
'  1. The code was already used (codes can only be used once)\n' +
'  2. The code expired (codes expire within a few minutes)\n' +
'  3. The code was copied incorrectly\n\n' +
'Please try /login again to get a new code.'
```

**官方实现**
```
未找到明确的错误提示文本
```

**差异分析：**
- ✅ **项目优势**：提供了非常详细的错误排查指导
- ⚠️ **注意**：使用了 `/login` 命令，需确保此命令存在

---

## 6. API Key 设置提示对比

### 6.1 API Key 设置界面

**项目实现** (`src/auth/index.ts` lines 1198-1202)
```typescript
console.log('\n╭─────────────────────────────────────────╮');
console.log('│       Claude Code Token Setup           │');
console.log('╰─────────────────────────────────────────╯\n');
console.log('You can get your API key from:');
console.log('  https://console.anthropic.com/settings/keys\n');
```

**官方实现**
```
未在搜索结果中找到明确的提示文本
```

**差异分析：**
- ✅ **项目实现完整**：提供了清晰的 API key 获取指引
- 📝 **建议**：保持当前实现

### 6.2 API Key 验证提示

**项目实现** (`src/auth/index.ts` lines 1215-1216, 1223-1224, 1229-1230)
```typescript
console.log('\n⚠️  Warning: API key should start with "sk-ant-"');
console.log('\nValidating API key...');
console.log('\n✅ API key saved successfully!');
console.log('   Stored in: ~/.claude/credentials.json');
console.log('\n❌ API key validation failed.');
console.log('   Please check your key and try again.');
```

**官方实现**
```
未找到
```

**差异分析：**
- ✅ **项目优势**：提供了即时反馈和明确的存储位置信息

---

## 7. OAuth Scope 说明对比

### 7.1 Scope 定义注释

**项目实现** (`src/auth/index.ts` lines 114-118)
```typescript
// OAuth scope 定义（与官方一致）
// qB4 = ["org:create_api_key", "user:profile"]
// Aq1 = ["user:profile", "user:inference", "user:sessions:claude_code"]
// CBQ = 合并去重
const OAUTH_SCOPES = ['org:create_api_key', 'user:profile', 'user:inference', 'user:sessions:claude_code'];
```

**官方实现**
```
未在搜索结果中找到明确的 scope 说明
```

**差异分析：**
- ✅ **项目提供了详细的注释**：解释了 scope 的来源和组合逻辑
- ⚠️ **注意**：`qB4`、`Aq1`、`CBQ` 等符号应该是从官方混淆代码中反编译得到的变量名
- 📝 **建议**：使用更清晰的变量名注释

---

## 8. 认证优先级说明对比

### 8.1 认证优先级注释

**项目实现** (`src/auth/index.ts` lines 242-248)
```typescript
/**
 * 初始化认证系统
 *
 * 认证优先级（修复版本，与官方 Claude Code 逻辑一致）：
 * 1. 环境变量 API key
 * 2. OAuth token（如果有 user:inference scope）- 订阅用户优先使用
 * 3. primaryApiKey（如果 OAuth 没有 inference scope）
 * 4. 其他凭证文件
 */
```

**官方实现**
```
代码被混淆，无法直接对比
```

**差异分析：**
- ✅ **项目提供了清晰的逻辑说明**
- 📝 **建议**：通过实际测试验证此优先级是否与官方一致

---

## 9. MFA (多因素认证) 提示词对比

### 9.1 TOTP 设置流程

**项目实现** (`src/auth/mfa.ts`)
```typescript
// 完整的 TOTP、恢复代码、设备信任等功能
// 但未找到用户提示文本
```

**官方实现**
```
未在搜索结果中找到 MFA 相关提示
```

**差异分析：**
- ⚠️ **无法确认**：官方是否实现了 MFA 功能
- 📝 **建议**：如果官方未实现 MFA，项目的 MFA 功能可能是额外功能

---

## 10. 文件路径说明对比

### 10.1 配置文件路径

**项目实现** (`src/auth/index.ts` lines 99-106)
```typescript
// 认证配置文件路径
const AUTH_DIR = path.join(os.homedir(), '.claude');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const CREDENTIALS_FILE = path.join(AUTH_DIR, 'credentials.json');
// 官方 Claude Code 的配置文件（存储 primaryApiKey）
const CONFIG_FILE = path.join(AUTH_DIR, 'config.json');
// 官方 Claude Code 的 OAuth 凭据文件（存储 claudeAiOauth）
const OFFICIAL_CREDENTIALS_FILE = path.join(AUTH_DIR, '.credentials.json');
```

**官方实现**
```
官方使用：
- .claude/config.json (存储 primaryApiKey)
- .claude/.credentials.json (存储 OAuth token)
```

**差异分析：**
- ✅ **路径一致**：项目正确识别了官方的配置文件位置
- ✅ **兼容性好**：项目可以读取官方的配置文件
- 📝 **建议**：保持此兼容性设计

---

## 11. 重要发现和注释对比

### 11.1 Subscription Token 特殊处理

**项目实现** (`src/auth/index.ts` lines 264-269)
```typescript
// 重要发现（通过抓包和测试发现）：
// - OAuth subscription token 需要特殊的 system prompt 格式才能使用 sonnet/opus 模型
// - system prompt 的第一个 block 必须以 "You are Claude Code, Anthropic's official CLI for Claude." 开头
// - 配合 claude-code-20250219 beta header 可以解锁所有模型
```

**官方实现**
```
未找到相关注释（代码被混淆）
```

**差异分析：**
- ✅ **项目的重要发现**：这是通过逆向工程发现的关键信息
- 📝 **建议**：这个发现对于正确使用 OAuth token 非常重要，应保留

### 11.2 OAuth Token 使用限制说明

**项目实现** (`src/auth/index.ts` lines 319-320)
```typescript
// 注意：我们不再使用官方 Claude Code 的 OAuth token
// 因为 Anthropic 服务器会验证请求来源，只允许官方客户端使用
```

**官方实现**
```
无法确认（需要实际测试）
```

**差异分析：**
- ⚠️ **需要验证**：此限制是否真实存在
- 📝 **建议**：如果存在限制，应在文档中明确说明

---

## 12. 缺失的功能对比

### 12.1 项目中未实现的官方功能

1. **setup-token 命令**
   - 官方：`claude setup-token`
   - 项目：无

2. **认证状态警告**
   - 官方：检测并警告已有认证配置
   - 项目：无

3. **环境变量配置检查**
   - 官方：提示已通过环境变量或 API key helper 配置
   - 项目：基本实现，但提示不完整

### 12.2 项目中额外实现的功能

1. **MFA (多因素认证)**
   - 项目：完整的 TOTP、恢复代码、设备信任功能
   - 官方：未确认是否实现

2. **加密存储**
   - 项目：使用 AES-256-CBC 加密敏感字段
   - 官方：未确认

3. **详细的错误提示**
   - 项目：提供了详细的错误排查指导
   - 官方：提示相对简洁

---

## 13. 提示词风格对比

### 13.1 项目风格

```
✅ 使用 Unicode 字符（✓ ✗ ⚠️）
✅ 使用表格框线字符（╭ ╰ │）
✅ 详细的步骤说明
✅ 友好的错误提示
```

### 13.2 官方风格

```
✅ 简洁明了
✅ 技术性描述
✅ 使用斜杠命令格式（/login, /status）
```

### 差异分析

- 📝 **建议**：可以在保持详细提示的同时，采用官方的斜杠命令格式

---

## 14. 改进建议总结

### 14.1 高优先级改进

1. **添加 setup-token 命令**
   ```typescript
   .command('setup-token')
   .description('Set up a long-lived authentication token (requires Claude subscription)')
   .action(async () => {
     // 实现 OAuth 登录流程
   });
   ```

2. **添加认证状态警告**
   ```typescript
   if (envApiKey || existingAuth) {
     console.warn('Warning: You already have authentication configured via environment variable or API key helper.');
   }
   ```

3. **统一使用斜杠命令格式**
   ```typescript
   // 将所有错误提示中的 "claude login" 改为 "/login"
   // 将所有 "claude status" 改为 "/status"
   ```

### 14.2 中优先级改进

4. **添加账户类型描述**
   ```typescript
   {
     label: 'Claude.ai account · Subscription billing',
     value: 'claudeai'
   },
   {
     label: 'Anthropic Console account · API usage billing',
     value: 'console'
   }
   ```

5. **改进 OAuth Scope 注释**
   ```typescript
   // OAuth scopes:
   // - org:create_api_key: 允许创建 API key
   // - user:profile: 访问用户信息
   // - user:inference: 直接使用模型推理（订阅用户）
   // - user:sessions:claude_code: 访问 Claude Code 会话
   ```

### 14.3 低优先级改进

6. **验证 MFA 功能是否与官方一致**
   - 如果官方未实现，考虑将其作为可选功能
   - 如果官方已实现，对比提示词和流程

7. **统一错误消息格式**
   - 使用一致的错误消息结构
   - 提供明确的解决方案

---

## 15. 测试建议

### 15.1 功能测试

1. 测试 OAuth 登录流程是否与官方一致
2. 测试 API key 优先级是否正确
3. 测试 subscription token 是否能正确使用所有模型
4. 测试错误提示是否准确

### 15.2 兼容性测试

1. 测试是否能正确读取官方配置文件
2. 测试与官方 CLI 的配置是否冲突
3. 测试环境变量优先级是否一致

---

## 16. 总结

### 优势

✅ **项目的详细程度更高**：提供了更友好的用户引导和错误提示
✅ **实现了额外的安全功能**：MFA、加密存储等
✅ **良好的兼容性**：可以读取官方配置文件

### 需要改进

❌ **缺少 setup-token 命令**：这是官方的关键功能
⚠️ **提示词格式不统一**：应采用官方的斜杠命令格式
⚠️ **缺少认证状态警告**：可能导致用户困惑

### 整体评估

项目的认证系统实现**基本正确**，在某些方面甚至**优于官方**（如详细的错误提示）。但需要添加一些关键功能（如 setup-token 命令）并统一提示词格式以与官方保持一致。

---

## 附录：关键代码位置

### 项目代码

- 主认证模块：`/home/user/claude-code-open/src/auth/index.ts`
- MFA 模块：`/home/user/claude-code-open/src/auth/mfa.ts`
- 认证文档：`/home/user/claude-code-open/src/auth/README.md`

### 官方代码

- 压缩源码：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- setup-token 命令：line 5034
- 账户类型描述：line 1718

---

*报告生成时间：2025-12-30*
*基于项目版本：v2.0.76*
*官方 CLI 版本：v2.0.76*
