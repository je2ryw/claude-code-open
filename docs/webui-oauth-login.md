# WebUI OAuth 登录功能

## 概述

WebUI现在支持图形化的OAuth登录，无需再通过CLI命令行登录。用户可以直接在浏览器中完成OAuth认证流程。

## 功能特点

✅ 支持两种认证方式：
- **Claude.ai账户** - 适用于Claude Pro/Max/Team订阅用户
- **Console账户** - 适用于Anthropic Console用户（API计费）

✅ 完整的OAuth 2.0 + PKCE流程
✅ 图形化登录界面
✅ 实时认证状态显示
✅ 安全的token存储

## 架构说明

### 前端组件

1. **OAuthLogin组件** (`src/web/client/src/components/auth/OAuthLogin.tsx`)
   - OAuth登录核心组件
   - 处理两种账户类型登录
   - OAuth流程启动和状态轮询

2. **AuthStatus组件** (`src/web/client/src/components/AuthStatus.tsx`)
   - 显示在侧边栏底部的登录状态指示器
   - 未登录：显示 ⚠️ 警告和"登录"按钮
   - 已登录：显示用户头像、邮箱和"登出"按钮
   - 每30秒自动检查登录状态

3. **AuthDialog组件** (`src/web/client/src/components/AuthDialog.tsx`)
   - 模态对话框，包含OAuthLogin组件
   - 点击侧边栏"登录"按钮时弹出
   - 点击背景或关闭按钮可关闭

4. **AuthPage页面** (`src/web/client/src/pages/AuthPage/index.tsx`)
   - 完整的认证页面（保留用于独立访问）
   - 显示详细登录状态
   - 登出功能

### 后端API

1. **POST `/api/auth/oauth/start`**
   - 启动OAuth登录流程
   - 生成授权URL和会话ID
   - 支持PKCE（Proof Key for Code Exchange）

2. **GET `/api/auth/oauth/callback`**
   - OAuth回调处理
   - 交换authorization code为access token
   - 保存认证信息

3. **GET `/api/auth/oauth/status/:authId`**
   - 检查OAuth登录状态
   - 前端轮询使用

4. **GET `/api/auth/oauth/status`**
   - 获取当前认证状态
   - 显示用户信息

5. **POST `/api/auth/oauth/logout`**
   - 登出功能
   - 清除认证信息

## 使用方法

### 1. 启动WebUI

```bash
npm run web
# 或编译后运行
npm run build && npm run web:start
```

### 2. 访问WebUI并登录

1. 打开浏览器访问：`http://localhost:3456`
2. 在聊天页面左侧边栏底部查看登录状态
3. 如果未登录，会显示 ⚠️ 未登录 和"登录"按钮
4. 点击"登录"按钮打开登录对话框

### 3. 选择认证方式

点击相应的登录按钮：

- **Claude.ai Account** - 如果你有Claude Pro/Max/Team订阅
- **Console Account** - 如果你使用Anthropic Console

### 4. 完成OAuth授权

1. 系统会打开新窗口到Claude.ai或Console授权页面
2. 登录你的账户（如果未登录）
3. 授权Claude Code访问你的账户
4. 授权完成后窗口自动关闭
5. 返回WebUI即可看到登录成功

### 5. 验证登录状态

登录成功后，页面会显示：
- 账户类型
- 邮箱地址（如果可用）
- Token过期时间
- 授权范围（scopes）

## OAuth流程详解

```
┌──────────────────────────────────────────────────────────────────┐
│                     WebUI OAuth登录流程                           │
└──────────────────────────────────────────────────────────────────┘

1. 用户点击登录按钮
   └─> POST /api/auth/oauth/start
       ├─> 生成state, codeVerifier, codeChallenge
       ├─> 创建OAuth会话（存储在内存）
       └─> 返回授权URL

2. 前端打开授权窗口
   └─> window.open(authUrl)
       └─> 用户在Claude.ai/Console授权

3. OAuth回调
   └─> GET /api/auth/oauth/callback?code=xxx&state=xxx
       ├─> 验证state
       ├─> 交换code为access_token
       ├─> 保存到 ~/.claude/.credentials.json
       └─> 显示成功页面

4. 前端轮询检查状态
   └─> GET /api/auth/oauth/status/:authId
       └─> 检测到completed后关闭授权窗口

5. 登录完成
   └─> 刷新页面显示用户信息
```

## 安全性

### PKCE (Proof Key for Code Exchange)

使用PKCE增强OAuth安全性：

1. **Code Verifier** - 随机生成的密钥
2. **Code Challenge** - Code Verifier的SHA256哈希
3. **交换Token时验证** - 确保token请求来自同一客户端

### State参数

- 防止CSRF攻击
- 每次请求生成唯一的state值
- 回调时验证state匹配

### Token存储

- Access token存储在 `~/.claude/.credentials.json`
- 文件权限设置为仅当前用户可读（0600）
- Refresh token安全保存用于自动刷新

## 集成到现有页面

如果你想在其他页面中使用OAuth登录组件：

```tsx
import { OAuthLogin } from '../components/auth/OAuthLogin';

function MyPage() {
  const handleSuccess = () => {
    console.log('Login successful!');
    // 执行登录后的操作
  };

  const handleError = (error: string) => {
    console.error('Login failed:', error);
  };

  return (
    <div>
      <OAuthLogin
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  );
}
```

## 环境变量

无需额外配置！OAuth登录会自动使用动态的回调URL，支持：

- `localhost`开发环境
- 自定义端口
- 生产环境域名

## 故障排查

### 问题：OAuth窗口被浏览器拦截

**解决方案：**
- 允许浏览器弹出窗口
- 在浏览器设置中允许来自localhost的弹窗

### 问题：授权后窗口没有自动关闭

**解决方案：**
- 手动关闭授权窗口
- 刷新页面重新检查登录状态

### 问题：Token过期

**解决方案：**
- 点击Logout重新登录
- Token会自动刷新（如果有refresh token）

## 文件清单

### 前端文件
- `src/web/client/src/components/auth/OAuthLogin.tsx` - OAuth登录核心组件
- `src/web/client/src/components/auth/OAuthLogin.css` - 登录组件样式
- `src/web/client/src/components/AuthStatus.tsx` - 侧边栏登录状态组件
- `src/web/client/src/components/AuthStatus.css` - 登录状态样式
- `src/web/client/src/components/AuthDialog.tsx` - 登录对话框组件
- `src/web/client/src/components/AuthDialog.css` - 对话框样式
- `src/web/client/src/pages/AuthPage/index.tsx` - 认证页面（独立访问）
- `src/web/client/src/pages/AuthPage/index.css` - 认证页面样式
- `src/web/client/src/App.tsx` - 集成了登录状态和对话框

### 后端文件
- `src/web/server/routes/auth.ts` - OAuth API路由
- `src/web/server/index.ts` - 路由集成（已修改）
- `src/auth/index.ts` - 核心认证逻辑（已导出必要函数）

## UI 设计说明

### 侧边栏集成设计

OAuth 登录功能采用**侧边栏集成**设计，而非独立页面 tab：

**设计理由**：
- ✅ 登录状态始终可见，无需切换页面
- ✅ 未登录时有明显的视觉警告（⚠️）
- ✅ 不占用顶部导航栏的宝贵空间
- ✅ 符合用户对登录功能的预期位置（右上角或侧边栏）
- ✅ 登录操作轻量化，使用弹窗而非整页

**实现方式**：
1. **AuthStatus** 组件显示在侧边栏底部
2. 未登录时显示：⚠️ 未登录 + "登录"按钮（橙色高亮）
3. 已登录时显示：用户头像 + 邮箱 + "登出"按钮
4. 点击"登录"按钮弹出 **AuthDialog** 对话框
5. 对话框包含完整的 OAuth 登录流程

### 视觉区分

**未登录状态**：
- 橙色背景警告条
- ⚠️ 警告图标
- 醒目的"登录"按钮

**已登录状态**：
- 用户头像图标（🎨 Claude.ai / ⚡ Console）
- 显示邮箱地址
- 小型"登出"按钮

## 下一步

- [x] 移除独立的登录 tab
- [x] 创建侧边栏登录状态组件
- [x] 创建登录对话框
- [x] 优化视觉区分
- [ ] 测试完整OAuth流程
- [ ] 添加错误处理和重试机制
- [ ] 实现Token自动刷新UI提示
- [ ] 添加多账户支持

## API Key vs OAuth

| 特性 | API Key | OAuth |
|------|---------|-------|
| 认证方式 | 手动配置 | 浏览器授权 |
| 适用场景 | 开发测试 | 订阅用户 |
| 计费方式 | 按使用量 | 订阅+超额 |
| 配置难度 | 简单 | 中等 |
| 安全性 | 高 | 高 |
| Token刷新 | 不需要 | 自动 |

## 贡献

欢迎提交Issue和PR来改进OAuth登录功能！

## License

MIT
