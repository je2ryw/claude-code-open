# 快捷键支持和导航历史功能

## 概述

本文档描述了项目导航器(ProjectNavigator)中实现的快捷键支持和导航历史功能。

## 组件架构

### 1. `useKeyboardShortcuts` Hook

**位置**: `src/web/client/src/hooks/useKeyboardShortcuts.ts`

**功能**: 统一管理键盘快捷键

**特性**:
- 支持修饰键组合 (Ctrl/Cmd/Shift/Alt)
- 自动处理 preventDefault
- 跨平台支持 (Windows Ctrl / Mac Cmd)
- 严格匹配模式（避免额外修饰键误触发）

**用法示例**:
```typescript
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const shortcuts = [
  {
    key: 'p',
    meta: true,  // Cmd on Mac, Ctrl on Windows
    handler: () => console.log('Cmd+P pressed'),
    description: '快速打开'
  },
  {
    key: '[',
    meta: true,
    handler: () => navigateBack(),
    description: '后退'
  }
];

useKeyboardShortcuts(shortcuts);
```

**修饰键匹配逻辑**:
- 如果定义为 `true`，要求该修饰键必须按下
- 如果定义为 `false` 或 `undefined`，要求该修饰键必须未按下
- 这避免了额外修饰键导致的误触发

例如：
- 定义 `{ key: 'p', meta: true }` 只匹配 `Cmd+P`
- 不匹配 `Cmd+Ctrl+P` (因为 ctrl 未定义，要求未按下)

### 2. `useNavigationHistory` Hook

**位置**: `src/web/client/src/hooks/useNavigationHistory.ts`

**功能**: 管理导航历史（类似浏览器前进/后退）

**特性**:
- 支持前进/后退
- 自动限制历史大小 (默认50)
- 去重相邻重复项
- 分支导航（在历史中间跳转会删除后续历史）
- 使用 ref 避免闭包问题

**数据结构**:
```typescript
interface NavigationItem {
  id: string;
  type: 'symbol' | 'file' | 'map';
  label: string;
  timestamp: number;
}
```

**API**:
```typescript
const nav = useNavigationHistory(maxSize?: number);

// 添加历史记录
nav.push({
  id: 'MyClass::myMethod',
  type: 'symbol',
  label: 'myMethod',
  timestamp: Date.now()
});

// 后退
const previousItem = nav.back();  // 返回 NavigationItem | null

// 前进
const nextItem = nav.forward();  // 返回 NavigationItem | null

// 清空历史
nav.clear();

// 状态查询
nav.canGoBack    // boolean
nav.canGoForward // boolean
nav.current      // NavigationItem | null
nav.history      // NavigationItem[]
nav.currentIndex // number
```

**实现细节**:
- 使用组合状态对象 `{ history, currentIndex }` 避免状态不一致
- 使用 `useRef` 跟踪最新状态，避免闭包问题
- 在 `setState` 回调中同步更新 ref，确保批处理更新时的正确性

### 3. `ShortcutsModal` 组件

**位置**: `src/web/client/src/components/swarm/ProjectNavigator/ShortcutsModal.tsx`

**功能**: 快捷键帮助弹窗

**特性**:
- 显示所有可用快捷键
- 点击遮罩层或关闭按钮关闭
- 支持 ESC 键关闭
- 使用 `formatShortcut()` 函数格式化快捷键显示

## ProjectNavigator 集成

**位置**: `src/web/client/src/components/swarm/ProjectNavigator/index.tsx`

**默认快捷键**:
- `Cmd+P` - 快速打开文件/符号 (待实现)
- `Cmd+[` - 后退
- `Cmd+]` - 前进
- `Cmd+M` - 切换到项目地图
- `Cmd+/` - 显示快捷键帮助
- `Escape` - 关闭弹窗

**UI 元素**:
- 导航按钮：显示在header左侧，支持前进/后退
- 快捷键按钮：显示在header右侧，打开帮助弹窗
- 视图切换器：快速切换项目地图/符号详情视图

**历史记录管理**:
```typescript
// 符号选择时添加历史
const handleSymbolSelect = (symbolId: string | null) => {
  if (!symbolId) {
    setSelectedSymbol(null);
    return;
  }

  setSelectedSymbol(symbolId);
  setViewMode('symbol');

  // 添加到历史
  nav.push({
    id: symbolId,
    type: 'symbol',
    label: symbolId.split('::').pop() || symbolId,
    timestamp: Date.now()
  });
};

// 后退处理
const handleBack = () => {
  const item = nav.back();
  if (item) {
    if (item.type === 'map') {
      setViewMode('map');
      setSelectedSymbol(null);
    } else {
      setSelectedSymbol(item.id);
      setViewMode(item.type as ViewMode);
    }
  }
};
```

## 测试

**测试文件**:
- `src/web/client/src/hooks/__tests__/useKeyboardShortcuts.test.ts`
- `src/web/client/src/hooks/__tests__/useNavigationHistory.test.ts`

**测试覆盖**:
- ✅ 简单按键触发
- ✅ 修饰键组合 (Ctrl, Cmd, Shift, Alt)
- ✅ 严格匹配（额外修饰键不匹配）
- ✅ 多个快捷键管理
- ✅ 大小写不敏感
- ✅ 快捷键格式化
- ✅ 历史添加/前进/后退
- ✅ 去重相邻重复项
- ✅ 分支导航
- ✅ 历史大小限制

**运行测试**:
```bash
npm test -- src/web/client/src/hooks/__tests__/useKeyboardShortcuts.test.ts --run
npm test -- src/web/client/src/hooks/__tests__/useNavigationHistory.test.ts --run
```

## 注意事项

1. **测试环境**: React Hooks 测试需要 jsdom 环境，在测试文件顶部添加：
   ```typescript
   /**
    * @vitest-environment jsdom
    */
   ```

2. **act() 批处理**: 在测试中，同一个 `act()` 块中的多次状态更新会被批处理，`result.current` 不会立即反映最新状态。需要将操作分开到不同的 `act()` 调用。

3. **快捷键冲突**: 定义快捷键时注意避免与浏览器默认快捷键冲突。

4. **历史记录去重**: `useNavigationHistory` 会自动去重连续相同的项，避免重复点击同一项产生冗余历史。

## 未来改进

- [ ] 实现快速打开文件/符号搜索 (Cmd+P)
- [ ] 添加更多快捷键（聚焦面板、搜索等）
- [ ] 支持自定义快捷键配置
- [ ] 历史记录持久化到 localStorage
- [ ] 添加面包屑导航显示
- [ ] 支持快捷键帮助搜索/过滤
