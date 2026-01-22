# API 高级设置功能实现说明

## 概述

在 API Advanced（API 高级设置）页面添加了三个新的配置项，用于支持自定义 API 配置和第三方 Claude API 服务对接。

## 新增配置项

### 1. API Base URL（API 基础地址）
- **字段名**: `apiBaseUrl`
- **类型**: `string`
- **用途**: 自定义 API 端点地址
- **默认值**: 空字符串（使用官方 https://api.anthropic.com）
- **说明**: 用于对接第三方兼容 Claude API 的服务
- **验证**: URL 格式验证

### 2. API Key（API 密钥）
- **字段名**: `apiKey`
- **类型**: `string`
- **用途**: 自定义 API 密钥
- **默认值**: 空字符串
- **说明**: 设置后可以使用 API Key 而不是 OAuth 认证
- **安全**: 使用密码输入框（type="password"）
- **存储**: 后端会进行加密存储

### 3. 自定义模型名称
- **字段名**: `customModelName`
- **类型**: `string`
- **用途**: 覆盖内置模型选择
- **默认值**: 空字符串
- **说明**: 用于第三方 API，设置后将覆盖界面上选择的模型
- **示例**: `claude-3-opus-20240229`

### 4. 认证优先级（新增）
- **字段名**: `authPriority`
- **类型**: `'apiKey' | 'oauth' | 'auto'`
- **用途**: 控制认证方式的优先级
- **默认值**: `'auto'`
- **选项**:
  - **自动**: 如果设置了 API Key 则使用 Key，否则使用 OAuth
  - **API Key 优先**: 始终优先使用 API Key（如果设置了）
  - **OAuth 优先**: 始终优先使用 OAuth 认证

## 实现细节

### 前端实现

#### 1. 组件文件
- **路径**: `src/web/client/src/components/config/ApiConfigPanel.tsx`
- **更新内容**:
  - 扩展 `ApiConfig` 接口
  - 添加新的表单字段和验证
  - 添加认证优先级选择器

#### 2. UI 布局
```
API Advanced 设置页面
├── 基础配置区域
│   ├── Temperature (0-1)
│   ├── Max Output Tokens (1-200000)
│   ├── Max Retries (0-10)
│   ├── Request Timeout (ms)
│   └── API Provider
├── 分隔线
└── 自定义 API 配置区域
    ├── API Base URL
    ├── API Key (密码框)
    ├── 自定义模型名称
    ├── 认证优先级
    └── 操作按钮
        ├── 取消
        ├── 测试连接 ⭐
        └── 保存配置
```

### 测试连接功能

在保存配置前，可以点击"测试连接"按钮验证配置是否有效：

1. **测试过程**:
   - 使用配置的 API Key 和 Base URL
   - 发送一个简单的测试请求（使用 Haiku 模型，最多 10 tokens）
   - 验证 API 连接、认证和模型可用性

2. **测试结果**:
   - ✅ **成功**: 显示绿色消息，包含使用的模型和端点
   - ❌ **失败**: 显示红色错误消息，包含详细的失败原因

3. **使用建议**:
   - 在保存配置前先测试，确保配置有效
   - 测试失败时检查错误消息，调整配置
   - 常见错误：API Key 无效、Base URL 格式错误、模型不支持等

### 后端实现

#### 1. 配置服务
- **路径**: `src/web/server/services/config-service.ts`
- **更新内容**:
  - 扩展 `ApiConfig` 接口
  - 更新 `getApiConfig()` 方法返回新字段
  - `updateApiConfig()` 方法自动支持新字段

#### 2. API 路由
- **路径**: `src/web/server/routes/config-api.ts`
- **端点**: 
  - `GET /api/config/api` - 获取 API 配置
  - `PUT /api/config/api` - 更新 API 配置
- **说明**: 无需修改，自动支持新字段

## 使用场景

### 场景 1: 使用第三方 Claude API 代理
```json
{
  "apiBaseUrl": "https://api.example.com",
  "apiKey": "sk-custom-key-...",
  "customModelName": "claude-3-opus-20240229",
  "authPriority": "apiKey"
}
```

### 场景 2: 使用官方 API 但自定义 Key
```json
{
  "apiBaseUrl": "",
  "apiKey": "sk-ant-...",
  "authPriority": "auto"
}
```

### 场景 3: 仅使用 OAuth 认证
```json
{
  "apiBaseUrl": "",
  "apiKey": "",
  "authPriority": "oauth"
}
```

## 认证逻辑

根据 `authPriority` 的设置，系统会按以下逻辑选择认证方式：

1. **auto 模式**:
   - 如果设置了 `apiKey` → 使用 API Key
   - 如果未设置 `apiKey` → 使用 OAuth

2. **apiKey 模式**:
   - 如果设置了 `apiKey` → 使用 API Key
   - 如果未设置 `apiKey` → 抛出错误

3. **oauth 模式**:
   - 始终使用 OAuth 认证
   - 忽略 `apiKey` 配置

## 数据验证

### API Base URL 验证
- 必须是有效的 URL 格式
- 示例: `https://api.example.com`
- 如果留空则使用默认 API 端点

### API Key 验证
- 无特定格式验证
- 使用密码输入框隐藏显示
- 后端会进行安全存储

### 自定义模型名称验证
- 无特定格式验证
- 留空则使用界面选择的模型

## 配置存储

所有配置通过 `ConfigManager` 存储在:
- 用户级配置文件
- 项目级配置文件  
- 本地配置文件

新增字段会自动合并到现有配置系统中。

## 安全考虑

1. **API Key 保护**:
   - 前端使用密码输入框
   - 后端应加密存储（建议使用环境变量或密钥管理服务）
   - 导出配置时默认遮罩敏感信息

2. **URL 验证**:
   - 验证 URL 格式避免注入攻击
   - 建议仅连接信任的 API 端点

## 后续改进建议

1. **API Key 加密存储**: 在后端实现加密存储机制
2. **连接测试**: 添加"测试连接"按钮验证配置有效性
3. **预设模板**: 提供常见第三方 API 的配置模板
4. **使用统计**: 跟踪不同认证方式的使用情况

## 相关文件

### 前端
- `src/web/client/src/components/config/ApiConfigPanel.tsx` - API配置面板UI

### 后端
- `src/web/server/services/config-service.ts` - 配置服务
- `src/web/server/routes/config-api.ts` - 配置API路由（包含测试端点）
- `src/providers/index.ts` - **核心文件** - Anthropic客户端创建，实际使用配置

## 测试建议

1. **功能测试**:
   - 测试保存和加载配置
   - 测试 URL 验证
   - 测试不同认证优先级的行为

2. **集成测试**:
   - 测试与第三方 API 的连接
   - 测试认证切换

3. **安全测试**:
   - 验证 API Key 是否安全存储
   - 验证导出配置时敏感信息遮罩
