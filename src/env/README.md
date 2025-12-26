# 环境变量模块 (T-015)

## 概述

环境变量模块提供了完整的环境变量验证、敏感信息检测和统一管理功能，基于官方 Claude Code v2.0.76 的实现。

## 模块结构

```
src/env/
├── validator.ts          # 验证器核心接口和注册表
├── validators/
│   └── builtin.ts       # 内置验证器
├── sensitive.ts          # 敏感变量检测和掩码
├── manager.ts            # 环境变量管理器
└── index.ts              # 模块导出
```

## 主要功能

### 1. 环境变量验证器

验证器系统确保环境变量值符合预期范围和类型：

```typescript
import { getValidatedEnv } from './env/index.js';

// 获取验证后的值（自动应用默认值和范围限制）
const maxOutputTokens = getValidatedEnv<number>('CLAUDE_CODE_MAX_OUTPUT_TOKENS');
// 如果未设置或无效：32000
// 如果设置为 70000：64000（被限制）
// 如果设置为 50000：50000（有效）

const bashMaxOutput = getValidatedEnv<number>('BASH_MAX_OUTPUT_LENGTH');
// 默认：30000，最大：150000
```

#### 内置验证器

- **BASH_MAX_OUTPUT_LENGTH**: 默认 30000，最大 150000
- **CLAUDE_CODE_MAX_OUTPUT_TOKENS**: 默认 32000，最大 64000
- **CLAUDE_CODE_MAX_RETRIES**: 默认 3，范围 0-10
- **CLAUDE_CODE_REQUEST_TIMEOUT**: 默认 300000ms，范围 1000-600000
- **CLAUDE_CODE_MAX_CONCURRENT_TASKS**: 默认 10，范围 1-100
- **布尔型环境变量**:
  - CLAUDE_CODE_ENABLE_TELEMETRY
  - CLAUDE_CODE_USE_BEDROCK
  - CLAUDE_CODE_USE_VERTEX
  - CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING

#### 验证状态

- `valid`: 值有效
- `invalid`: 值无效，使用默认值
- `capped`: 值超出范围，使用上限值

### 2. 敏感变量检测

自动检测和掩码敏感信息：

```typescript
import { isSensitiveVar, maskSensitive, maskSensitiveFields } from './env/index.js';

// 检测敏感变量
isSensitiveVar('API_KEY')      // true
isSensitiveVar('PASSWORD')     // true
isSensitiveVar('USERNAME')     // false

// 掩码单个值
maskSensitive('sk-ant-api03-xxx')           // 'sk-a***-xxx'
maskSensitive('short')                      // '***'
maskSensitive('my-secret-token-12345678')   // 'my-s***5678'

// 掩码对象中的敏感字段
maskSensitiveFields({
  API_KEY: 'sk-ant-api03-xxx',
  USERNAME: 'alice',
  config: {
    PASSWORD: 'secret123'
  }
})
// =>
// {
//   API_KEY: 'sk-a***-xxx',
//   USERNAME: 'alice',
//   config: {
//     PASSWORD: '***'
//   }
// }
```

#### 敏感关键词

- key, token, secret, password
- auth, credential, passphrase, private
- apikey, api_key, access_token, auth_token
- client_secret, private_key

### 3. 环境变量管理器

统一管理所有环境变量：

```typescript
import { envManager } from './env/index.js';

// 验证所有已注册的环境变量
envManager.validateAll(true);  // verbose = true 输出详细信息

// 获取验证后的值
const maxTokens = envManager.getValidated<number>('CLAUDE_CODE_MAX_OUTPUT_TOKENS');

// 获取原始值
const rawValue = envManager.get('SOME_VAR');

// 获取布尔值
const useBedrock = envManager.getBoolean('CLAUDE_CODE_USE_BEDROCK', false);

// 获取数字值
const maxRetries = envManager.getNumber('CLAUDE_CODE_MAX_RETRIES', 3);

// 导出安全的环境变量（敏感值已掩码）
const safeEnv = envManager.exportSafe();

// 获取验证统计
const stats = envManager.getValidationStats();
// => { total: 9, valid: 7, invalid: 1, capped: 1 }
```

## 使用示例

### 在配置管理器中

```typescript
import { ConfigManager } from './config/index.js';

const config = new ConfigManager();

// 自动验证环境变量（在构造函数中）
// 如果有无效或被限制的值，会输出警告

// 获取验证后的环境变量
const maxTokens = config.getValidatedEnv<number>('CLAUDE_CODE_MAX_OUTPUT_TOKENS');

// 访问环境变量管理器
const envMgr = config.getEnvManager();
const stats = envMgr.getValidationStats();
```

### 在工具中使用

```typescript
import { getValidatedEnv } from '../env/index.js';

export class BashTool extends BaseTool {
  async execute(input: BashInput): Promise<ToolResult> {
    // 使用验证后的环境变量值
    const maxOutputLength = getValidatedEnv<number>('BASH_MAX_OUTPUT_LENGTH') || 30000;

    // 执行命令...
    let output = await runCommand(input.command);

    // 应用限制
    if (output.length > maxOutputLength) {
      output = output.slice(0, maxOutputLength) + '\n... (output truncated)';
    }

    return { success: true, output };
  }
}
```

### 自定义验证器

```typescript
import { envManager, createNumberRangeValidator } from './env/index.js';

// 创建自定义数值范围验证器
const customValidator = createNumberRangeValidator(
  'MY_CUSTOM_LIMIT',
  100,     // 默认值
  10,      // 最小值
  1000,    // 最大值
  'Custom limit for my feature'
);

// 注册验证器
envManager.registerValidator(customValidator);

// 使用
const limit = envManager.getValidated<number>('MY_CUSTOM_LIMIT');
```

### 自定义敏感关键词

```typescript
import { registerSensitiveKeyword, isSensitiveVarExtended } from './env/index.js';

// 注册自定义敏感关键词
registerSensitiveKeyword('oauth');
registerSensitiveKeyword('webhook');

// 检测（包括自定义关键词）
isSensitiveVarExtended('OAUTH_CLIENT_ID');  // true
isSensitiveVarExtended('WEBHOOK_SECRET');   // true
```

## 验证流程

1. **初始化**: ConfigManager 构造时自动注册内置验证器
2. **验证**: 调用 `validateAll()` 验证所有已注册的环境变量
3. **警告**: 无效或被限制的值会输出警告信息
4. **获取**: 通过 `getValidated()` 获取验证后的有效值

## 与官方实现的差异

### 已实现（80%）

- ✅ 完整的验证器系统（ValidationResult, EnvVarValidator）
- ✅ 内置验证器（BASH_MAX_OUTPUT_LENGTH, CLAUDE_CODE_MAX_OUTPUT_TOKENS 等）
- ✅ 验证器注册表和管理
- ✅ 敏感变量检测（基于关键词）
- ✅ 掩码算法（≤8 字符全掩码，>8 字符保留前后各 4 位）
- ✅ 递归掩码对象中的敏感字段
- ✅ 环境变量管理器
- ✅ 验证统计和报告
- ✅ 集成到 ConfigManager

### 未实现（20%）

- ❌ 命令行环境变量注入（-e KEY=VALUE）
- ❌ Vertex AI 区域配置（模型特定环境变量）
- ❌ 完整的 AWS 区域配置
- ❌ 调试日志相关环境变量处理
- ❌ OpenTelemetry 环境变量处理

## 文件清单

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/env/validator.ts` | 165 | 验证器接口、注册表、便捷函数 |
| `src/env/validators/builtin.ts` | 352 | 内置验证器和工厂函数 |
| `src/env/sensitive.ts` | 295 | 敏感变量检测和掩码 |
| `src/env/manager.ts` | 315 | 环境变量管理器 |
| `src/env/index.ts` | 57 | 模块导出 |
| **总计** | **1184** | |

## 测试建议

```bash
# 设置环境变量并测试
export BASH_MAX_OUTPUT_LENGTH=200000
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=70000
export ANTHROPIC_API_KEY=sk-ant-api03-test123456789

# 运行应用
npm run dev

# 应该看到警告：
# [ENV] BASH_MAX_OUTPUT_LENGTH: Capped from 200000 to 150000
# [ENV] CLAUDE_CODE_MAX_OUTPUT_TOKENS: Capped from 70000 to 64000
```

## 参考文档

- 详细分析: `/home/user/claude-code-open/docs/comparison/analysis/env-analysis.md`
- 官方源码: 基于 Claude Code v2.0.76 反编译分析
