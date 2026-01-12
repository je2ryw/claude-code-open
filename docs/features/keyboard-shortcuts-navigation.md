# 键盘快捷键与导航历史功能

## 概述

为 ProjectNavigator 添加了键盘快捷键和浏览历史功能，提升用户体验。用户可以通过键盘快捷键快速操作，并像浏览器一样前进后退。

## 核心功能

### 1. 键盘快捷键

支持以下快捷键：

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Cmd+P` / `Ctrl+P` | 快速打开 | 打开文件/符号搜索（待实现） |
| `Cmd+[` / `Ctrl+[` | 后退 | 导航到上一个位置 |
| `Cmd+]` / `Ctrl+]` | 前进 | 导航到下一个位置 |
| `Cmd+M` / `Ctrl+M` | 切换到项目地图 | 快速切换到项目地图视图 |
| `Cmd+/` / `Ctrl+/` | 显示快捷键帮助 | 显示所有可用快捷键 |
| `Esc` | 关闭弹窗 | 关闭快捷键帮助弹窗 |

**跨平台支持**：
- macOS: 使用 `Cmd` 键（meta）
- Windows/Linux: 使用 `Ctrl` 键

### 2. 导航历史

类似浏览器的前进/后退功能：

- **自动记录**: 每次切换符号或视图时自动添加到历史
- **去重**: 相邻重复项不会重复记录
- **分支导航**: 在历史中间跳转时，会删除后续历史
- **大小限制**: 默认保留最近 50 条历史记录

### 3. 快捷键帮助弹窗

点击 `⌨️` 按钮或按 `Cmd+/` 显示快捷键帮助：

- 显示所有可用快捷键
- 格式化显示（如 `Cmd+Shift+P`）
- 点击遮罩层或按 `Esc` 关闭

## 技术实现

### 1. useKeyboardShortcuts Hook

**位置**: `src/web/client/src/hooks/useKeyboardShortcuts.ts`

```typescript
export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;  // Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]);
export function formatShortcut(config: ShortcutConfig): string;
```

**特性**：
- 支持修饰键组合（Ctrl/Cmd/Shift/Alt）
- 自动处理 `preventDefault`
- 精确匹配键盘事件

**实现原理**：
1. 监听全局 `keydown` 事件
2. 遍历快捷键配置，匹配按键和修饰键
3. 找到匹配项后调用处理函数并阻止默认行为
4. 组件卸载时自动清理事件监听

### 2. useNavigationHistory Hook

**位置**: `src/web/client/src/hooks/useNavigationHistory.ts`

```typescript
export interface NavigationItem {
  id: string;
  type: 'symbol' | 'file' | 'map';
  label: string;
  timestamp: number;
}

export function useNavigationHistory(maxSize?: number): {
  history: NavigationItem[];
  currentIndex: number;
  push: (item: NavigationItem) => void;
  back: () => NavigationItem | null;
  forward: () => NavigationItem | null;
  canGoBack: boolean;
  canGoForward: boolean;
  clear: () => void;
  current: NavigationItem | null;
};
```

**特性**：
- 支持前进/后退
- 自动去重相邻重复项
- 限制历史大小（默认 50）
- 分支导航（在历史中间跳转会删除后续历史）

**实现原理**：
1. 使用数组存储历史记录
2. `currentIndex` 跟踪当前位置
3. `push` 时删除当前位置之后的所有历史
4. `back/forward` 移动索引并返回对应项

### 3. ShortcutsModal 组件

**位置**: `src/web/client/src/components/swarm/ProjectNavigator/ShortcutsModal.tsx`

显示快捷键帮助弹窗：

- 遮罩层点击关闭
- 阻止事件冒泡
- 支持 Esc 键关闭
- 响应式设计

## 使用示例

### 基本使用

```typescript
import { useKeyboardShortcuts, ShortcutConfig } from '@/hooks/useKeyboardShortcuts';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';

const MyComponent = () => {
  const nav = useNavigationHistory();

  const shortcuts: ShortcutConfig[] = [
    {
      key: '[',
      meta: true,
      handler: () => {
        const item = nav.back();
        if (item) {
          // 处理后退
        }
      },
      description: '后退'
    }
  ];

  useKeyboardShortcuts(shortcuts);

  return (
    <div>
      <button onClick={() => nav.back()} disabled={!nav.canGoBack}>
        后退
      </button>
    </div>
  );
};
```

### 添加新快捷键

在 `ProjectNavigator` 的 `shortcuts` 数组中添加：

```typescript
const shortcuts: ShortcutConfig[] = [
  // ... 现有快捷键
  {
    key: 'f',
    meta: true,
    shift: true,
    handler: () => {
      // 你的处理逻辑
    },
    description: '你的功能描述'
  }
];
```

## 注意事项

### 1. 快捷键冲突

避免与浏览器默认快捷键冲突：

- ❌ `Cmd+R` (刷新页面)
- ❌ `Cmd+W` (关闭标签页)
- ❌ `Cmd+T` (新建标签页)
- ✅ `Cmd+[` / `Cmd+]` (自定义快捷键)

### 2. 历史记录大小

默认限制为 50 条，避免内存泄漏：

```typescript
const nav = useNavigationHistory(100); // 自定义大小
```

### 3. 跨平台支持

区分 Windows/Linux 和 macOS：

```typescript
{
  key: 'p',
  meta: true,  // macOS 使用 Cmd
  ctrl: false, // Windows/Linux 使用 Ctrl
  handler: myHandler,
  description: '快速打开'
}
```

### 4. 事件清理

Hooks 会自动清理事件监听器，无需手动清理：

```typescript
useEffect(() => {
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [shortcuts]);
```

## 未来改进

1. **快速搜索**: 实现 `Cmd+P` 快速打开文件/符号
2. **快捷键自定义**: 允许用户自定义快捷键
3. **历史记录持久化**: 将历史保存到 localStorage
4. **快捷键帮助优化**: 按分类显示快捷键

## 相关文件

- `src/web/client/src/hooks/useKeyboardShortcuts.ts` - 快捷键 Hook
- `src/web/client/src/hooks/useNavigationHistory.ts` - 导航历史 Hook
- `src/web/client/src/components/swarm/ProjectNavigator/index.tsx` - 主组件
- `src/web/client/src/components/swarm/ProjectNavigator/ShortcutsModal.tsx` - 快捷键帮助弹窗
- `src/web/client/src/components/swarm/ProjectNavigator/ShortcutsModal.module.css` - 弹窗样式
- `src/web/client/src/components/swarm/ProjectNavigator/ProjectNavigator.module.css` - 导航按钮样式

## 测试建议

### 单元测试

```typescript
describe('useKeyboardShortcuts', () => {
  it('should trigger handler on key press', () => {
    const handler = vi.fn();
    const shortcuts = [{ key: 'p', meta: true, handler, description: 'Test' }];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    fireEvent.keyDown(window, { key: 'p', metaKey: true });
    expect(handler).toHaveBeenCalledOnce();
  });
});
```

### 集成测试

1. 点击符号，验证历史记录增加
2. 点击后退按钮，验证视图恢复
3. 按 `Cmd+[`，验证快捷键触发
4. 按 `Cmd+/`，验证帮助弹窗显示

## 总结

通过键盘快捷键和导航历史功能，ProjectNavigator 的用户体验得到了显著提升：

- **效率提升**: 键盘快捷键减少鼠标操作
- **导航便利**: 前进/后退快速切换上下文
- **学习友好**: 快捷键帮助弹窗降低学习成本
- **跨平台**: 支持 Windows/Linux/macOS
