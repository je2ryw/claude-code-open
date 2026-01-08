# OAuth 登录功能测试指南

## 测试前准备

1. **确保服务器正在运行**
   ```bash
   npm run web
   ```
   服务器默认运行在 `http://localhost:3456`

2. **准备测试账户**
   - Claude.ai 账户（需要 Pro/Max/Team 订阅）
   - 或 Anthropic Console 账户

## 测试步骤

### 方法 1：通过导航栏访问

1. 打开浏览器访问 `http://localhost:3456`
2. 点击顶部导航栏的 **"🔐 登录"** 按钮
3. 应该能看到 OAuth 登录页面

### 方法 2：直接访问 Auth 页面

1. 打开浏览器访问 `http://localhost:3456`
2. 通过应用内导航切换到 Auth 页面

## OAuth 登录测试流程

### 1. 选择账户类型

在登录页面上，你会看到两个登录选项：

- **Claude.ai Account** - 适用于 Claude Pro/Max/Team 订阅用户
- **Console Account** - 适用于 Anthropic Console 用户

### 2. 启动 OAuth 流程

1. 点击相应的登录按钮
2. 系统会打开一个新的授权窗口
3. 如果弹窗被浏览器拦截，需要在浏览器设置中允许弹窗

### 3. 完成授权

1. 在授权窗口中登录你的账户（如果未登录）
2. 授权 Claude Code 访问你的账户
3. 授权成功后窗口会自动关闭（或手动关闭）
4. 返回主页面，应该看到登录成功的提示

### 4. 验证登录状态

登录成功后，页面应该显示：
- ✅ 已认证状态
- 账户类型（Claude.ai 或 Console）
- 邮箱地址（如果可用）
- Token 过期时间
- 授权范围（scopes）

### 5. 测试登出功能

1. 点击 **"Logout"** 按钮
2. 页面应该返回到登录界面
3. 认证状态应该清除

## 验证测试结果

### 浏览器控制台检查

打开浏览器开发者工具（F12），检查：

1. **Network 标签**
   - 检查 `/api/auth/oauth/start` 请求是否成功
   - 检查 `/api/auth/oauth/callback` 请求是否成功
   - 检查 `/api/auth/oauth/status/:authId` 轮询请求

2. **Console 标签**
   - 不应该有错误信息
   - 可能有一些正常的日志输出

### 服务器日志检查

在服务器终端中，应该能看到：

```
[OAuth] Starting OAuth flow for claude.ai/console
[OAuth] Authorization URL generated
[OAuth] OAuth callback received
[OAuth] Token exchange successful
[OAuth] Auth config saved
```

### 文件系统检查

登录成功后，检查认证文件：

```bash
# Linux/macOS
cat ~/.claude/.credentials.json

# Windows
type %USERPROFILE%\.claude\.credentials.json
```

应该包含：
```json
{
  "type": "oauth",
  "accountType": "claude.ai",
  "authToken": "...",
  "refreshToken": "...",
  "expiresAt": 1234567890000,
  "scope": [...]
}
```

## 常见问题排查

### 问题 1：授权窗口被拦截

**现象**: 点击登录按钮后没有弹出窗口

**解决方案**:
- 在浏览器地址栏右侧查看是否有弹窗拦截图标
- 点击允许来自 localhost 的弹窗
- 重新点击登录按钮

### 问题 2：授权窗口没有自动关闭

**现象**: 授权成功后窗口仍然显示

**解决方案**:
- 手动关闭授权窗口
- 返回主页面检查登录状态
- 如果状态未更新，刷新页面

### 问题 3：Token 过期错误

**现象**: 显示 "OAuth token 已过期"

**解决方案**:
- 点击 Logout 重新登录
- 检查系统时间是否正确
- Token 会在过期前自动刷新（如果有 refresh token）

### 问题 4：CORS 错误

**现象**: 浏览器控制台显示 CORS 错误

**解决方案**:
- 确保前端和后端在同一个域名（localhost:3456）
- 检查服务器的 CORS 配置
- 清除浏览器缓存后重试

### 问题 5：回调 URL 不匹配

**现象**: OAuth 回调失败，显示 "Invalid redirect URI"

**解决方案**:
- 检查服务器运行的端口是否为 3456
- 确保使用 `http://localhost:3456` 而不是 `127.0.0.1`
- 系统会自动使用动态回调 URL，应该能自动适配

## API 端点测试

你也可以通过 API 端点直接测试：

### 1. 启动 OAuth 流程

```bash
curl -X POST http://localhost:3456/api/auth/oauth/start \
  -H "Content-Type: application/json" \
  -d '{"accountType": "claude.ai"}'
```

应该返回：
```json
{
  "authId": "uuid-here",
  "authUrl": "https://claude.ai/oauth/authorize?..."
}
```

### 2. 检查认证状态

```bash
curl http://localhost:3456/api/auth/oauth/status
```

应该返回：
```json
{
  "authenticated": true,
  "type": "oauth",
  "accountType": "claude.ai",
  "email": "your@email.com",
  "expiresAt": 1234567890000,
  "scopes": [...]
}
```

## 测试检查清单

- [ ] 能访问登录页面
- [ ] 能点击 Claude.ai Account 登录按钮
- [ ] 能打开授权窗口
- [ ] 能完成授权流程
- [ ] 授权窗口能自动关闭（或手动关闭）
- [ ] 登录状态正确显示
- [ ] 用户信息正确显示
- [ ] 能点击 Console Account 登录按钮
- [ ] Console 授权流程正常
- [ ] Logout 功能正常
- [ ] 重新登录功能正常
- [ ] Token 存储到正确位置
- [ ] 没有控制台错误
- [ ] 服务器日志正常

## 下一步

如果测试通过，可以继续：
- 测试 Token 自动刷新功能
- 测试多账户切换
- 添加更多错误处理
- 优化用户体验

## 报告问题

如果发现问题，请记录：
1. 问题描述
2. 复现步骤
3. 浏览器控制台错误
4. 服务器日志
5. 系统环境（OS、浏览器版本、Node 版本）
