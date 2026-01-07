# 配置面板组件

这个目录包含了 Claude Code WebUI 的所有配置面板组件。

## 组件列表

### 1. PermissionsConfigPanel

权限配置面板，用于配置完整的权限系统。

**功能特性：**
- 默认权限模式选择（default / acceptEdits / bypassPermissions / plan）
- 工具权限控制（白名单/黑名单）
- 路径权限控制（支持 glob 模式）
- 命令权限控制（支持 glob 模式）
- 网络权限控制（URL 模式）
- 审计日志配置

**使用示例：**

```tsx
import { PermissionsConfigPanel } from './components/config';

function MyComponent() {
  const handleSave = (config) => {
    console.log('保存权限配置:', config);
    // 发送配置到后端
  };

  return (
    <PermissionsConfigPanel
      onSave={handleSave}
      onClose={() => console.log('关闭')}
      initialConfig={{
        defaultMode: 'default',
        tools: {
          allow: ['Bash', 'Read', 'Write'],
          deny: ['WebFetch']
        }
      }}
    />
  );
}
```

**配置数据结构：**

```typescript
interface PermissionsConfig {
  defaultMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  tools?: {
    allow?: string[];
    deny?: string[];
  };
  paths?: {
    allow?: string[];
    deny?: string[];
  };
  commands?: {
    allow?: string[];
    deny?: string[];
  };
  network?: {
    allow?: string[];
    deny?: string[];
  };
  audit?: {
    enabled?: boolean;
    logFile?: string;
  };
}
```

---

### 2. HooksConfigPanel

Hooks 配置面板，用于配置 12 个事件钩子。

**功能特性：**
- 全局 Hooks 系统开关
- 全局超时时间配置
- 最大并发 Hook 数量限制
- 12 个事件钩子配置：
  - PreToolUse (工具使用前)
  - PostToolUse (工具使用后)
  - PostToolUseFailure (工具执行失败)
  - Notification (通知)
  - UserPromptSubmit (用户提交)
  - SessionStart (会话开始)
  - SessionEnd (会话结束)
  - Stop (停止)
  - SubagentStart (子代理启动)
  - SubagentStop (子代理停止)
  - PreCompact (压缩前)
  - PermissionRequest (权限请求)
- 支持两种 Hook 类型：
  - 命令（Shell Script）
  - URL（HTTP/HTTPS Webhook）

**使用示例：**

```tsx
import { HooksConfigPanel } from './components/config';

function MyComponent() {
  const handleSave = (config) => {
    console.log('保存 Hooks 配置:', config);
    // 发送配置到后端
  };

  return (
    <HooksConfigPanel
      onSave={handleSave}
      onClose={() => console.log('关闭')}
      initialConfig={{
        enabled: true,
        globalTimeout: 30000,
        maxConcurrent: 5,
        PreToolUse: {
          type: 'command',
          command: '/path/to/pre-hook.sh',
          timeout: 5000,
          blocking: true
        }
      }}
    />
  );
}
```

**配置数据结构：**

```typescript
interface HooksConfig {
  enabled?: boolean;
  globalTimeout?: number;
  maxConcurrent?: number;
  [eventName: string]: HookConfig; // 各个事件的配置
}

interface HookConfig {
  type?: 'command' | 'url';
  command?: string;          // 命令类型
  args?: string[];           // 命令参数
  url?: string;              // URL 类型
  method?: string;           // HTTP 方法
  timeout?: number;          // 超时时间
  blocking?: boolean;        // 是否阻塞
  matcher?: string;          // 正则匹配器
}
```

---

## 样式

组件的样式定义在 `src/web/client/src/styles/config-panels.css` 中。

主要样式类：
- `.permissions-config-panel` - 权限配置面板容器
- `.hooks-config-panel` - Hooks 配置面板容器
- `.config-section` - 配置区块
- `.setting-item` - 设置项
- `.hook-item` - Hook 项目
- `.hook-editor` - Hook 编辑器

## 集成到 SettingsPanel

要在设置面板中添加这些配置项，可以参考以下方式：

```tsx
// src/web/client/src/components/SettingsPanel.tsx

import { PermissionsConfigPanel, HooksConfigPanel } from './config';

const TAB_CONFIG = [
  // ... 其他 tabs
  { id: 'permissions', label: 'Permissions', icon: '🔒' },
  { id: 'hooks', label: 'Hooks', icon: '🪝' },
];

function renderTabContent() {
  switch (activeTab) {
    case 'permissions':
      return (
        <PermissionsConfigPanel
          onSave={handlePermissionsSave}
          initialConfig={permissionsConfig}
        />
      );

    case 'hooks':
      return (
        <HooksConfigPanel
          onSave={handleHooksSave}
          initialConfig={hooksConfig}
        />
      );

    // ... 其他 cases
  }
}
```

## 后端集成

这些配置需要与后端 WebSocket API 集成，建议添加以下消息类型：

```typescript
// 权限配置相关
| { type: 'permissions_get' }
| { type: 'permissions_update'; payload: PermissionsConfig }
| { type: 'permissions_response'; payload: PermissionsConfig }

// Hooks 配置相关
| { type: 'hooks_get' }
| { type: 'hooks_update'; payload: HooksConfig }
| { type: 'hooks_response'; payload: HooksConfig }
```

## 注意事项

1. **权限配置优先级**：deny 列表优先级高于 allow 列表
2. **Glob 模式**：路径和命令支持 `*` 和 `**` 通配符
3. **Hook 超时**：单个 Hook 的超时时间会覆盖全局超时时间
4. **阻塞模式**：启用阻塞模式的 Hook 会暂停主流程执行
5. **验证**：前端进行基础验证，复杂验证应在后端进行

## 开发调试

```bash
# 运行开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行测试
npm test
```
