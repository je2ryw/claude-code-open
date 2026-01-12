# 动画组件库使用指南

Worker-4 创建的通用动画效果库，包含 5 个可复用的 React 动画组件。

## 📦 安装与导入

```typescript
// 导入单个组件
import { ProgressBar } from '@/components/swarm/common';

// 导入多个组件
import {
  ProgressBar,
  StatusBadge,
  AnimatedCheckmark,
  BreathingLight,
  FadeIn,
} from '@/components/swarm/common';

// 导入类型
import type { ProgressBarProps, StatusBadgeProps } from '@/components/swarm/common';
```

## 🎨 组件列表

### 1. ProgressBar - 进度条

平滑的进度条组件，支持 4 种颜色主题和发光动画。

**Props:**
```typescript
interface ProgressBarProps {
  value: number;              // 0-100
  color?: 'blue' | 'green' | 'yellow' | 'red';  // 默认 'blue'
  animated?: boolean;         // 是否显示发光动画，默认 false
  showLabel?: boolean;        // 是否显示百分比标签，默认 false
  className?: string;
}
```

**示例:**
```tsx
<ProgressBar value={75} color="green" animated showLabel />
```

---

### 2. StatusBadge - 状态徽章

带颜色编码和可选脉动动画的状态指示器。

**Props:**
```typescript
interface StatusBadgeProps {
  status: 'pending' | 'running' | 'success' | 'error' | 'warning';
  label?: string;             // 自定义文本，不传则使用默认中文标签
  pulse?: boolean;            // 是否启用脉动动画，默认 false
  className?: string;
}
```

**默认标签:**
- `pending` → "等待中"
- `running` → "运行中" (带呼吸灯效果)
- `success` → "成功"
- `error` → "错误"
- `warning` → "警告"

**示例:**
```tsx
<StatusBadge status="running" pulse />
<StatusBadge status="success" label="任务完成" />
```

---

### 3. AnimatedCheckmark - 打勾动画

SVG 绘制的完成标记动画。

**Props:**
```typescript
interface AnimatedCheckmarkProps {
  size?: number;              // 像素大小，默认 32
  color?: string;             // CSS 颜色值，默认 '#10b981' (绿色)
  animate?: boolean;          // 是否播放动画，默认 true
  className?: string;
}
```

**示例:**
```tsx
<AnimatedCheckmark size={48} color="#3b82f6" animate />
```

---

### 4. BreathingLight - 呼吸灯

带呼吸效果的状态指示灯。

**Props:**
```typescript
interface BreathingLightProps {
  active: boolean;            // 是否激活（必填）
  color?: 'green' | 'blue' | 'yellow' | 'red';  // 默认 'green'
  size?: number;              // 像素大小，默认 10
  className?: string;
}
```

**示例:**
```tsx
<BreathingLight active={isRunning} color="blue" size={12} />
```

---

### 5. FadeIn - 淡入动画包装器

为任何子元素添加淡入效果的包装器组件。

**Props:**
```typescript
interface FadeInProps {
  children: React.ReactNode;  // 子元素（必填）
  duration?: number;          // 动画持续时间（毫秒），默认 400
  delay?: number;             // 动画延迟时间（毫秒），默认 0
  className?: string;
}
```

**示例:**
```tsx
<FadeIn duration={500} delay={200}>
  <div>这个内容会淡入显示</div>
</FadeIn>
```

---

## 🎬 动画规格

### CSS 关键帧动画

| 动画名称 | 持续时间 | 效果描述 |
|---------|---------|---------|
| `pulse` | 2s | 缩放 + 透明度脉动 (1 → 1.05 → 1) |
| `fadeIn` | 自定义 | 淡入 + 向上移动 (-10px → 0) |
| `checkmark` | 0.6s | SVG stroke 绘制动画 |
| `breathing` | 2s | box-shadow 呼吸效果 (5px → 20px) |
| `progressGlow` | 2s | 亮度变化 (1 → 1.2 → 1) |

### 过渡效果

- **进度条填充**: `width 0.5s ease-out`
- **呼吸灯**: `all 0.3s ease`

---

## 🎯 使用场景

### 任务执行流程
```tsx
function TaskRunner() {
  const [status, setStatus] = useState<'pending' | 'running' | 'success'>('pending');
  const [progress, setProgress] = useState(0);

  return (
    <FadeIn>
      <div>
        <StatusBadge status={status} pulse={status === 'running'} />
        <ProgressBar value={progress} color="blue" animated showLabel />
        {status === 'success' && <AnimatedCheckmark />}
      </div>
    </FadeIn>
  );
}
```

### 在线状态指示
```tsx
function UserStatus({ isOnline }: { isOnline: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <BreathingLight active={isOnline} color="green" size={10} />
      <span>{isOnline ? '在线' : '离线'}</span>
    </div>
  );
}
```

### 列表项渐进显示
```tsx
function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div>
      {tasks.map((task, index) => (
        <FadeIn key={task.id} delay={index * 100}>
          <TaskItem task={task} />
        </FadeIn>
      ))}
    </div>
  );
}
```

---

## ♿ 可访问性

所有组件都包含适当的 ARIA 属性：

- `role="progressbar"` - 进度条
- `role="status"` - 状态徽章和呼吸灯
- `role="img"` - 打勾图标
- `aria-label` - 所有组件都有描述性标签
- `aria-live="polite"` - 状态更新通知

### Reduced Motion 支持

CSS 包含 `prefers-reduced-motion` 媒体查询，尊重用户的减少动画偏好：

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 📁 文件结构

```
src/web/client/src/components/swarm/common/
├── animations.module.css      # CSS 动画定义 (288 行)
├── ProgressBar.tsx            # 进度条组件 (64 行)
├── StatusBadge.tsx            # 状态徽章组件 (64 行)
├── AnimatedCheckmark.tsx      # 打勾动画组件 (76 行)
├── BreathingLight.tsx         # 呼吸灯组件 (57 行)
├── FadeIn.tsx                 # 淡入包装器 (60 行)
├── index.ts                   # 统一导出 (25 行)
├── Example.tsx                # 使用示例 (185 行)
└── USAGE.md                   # 本文档
```

---

## 🎨 颜色主题

### ProgressBar 颜色
- **blue** (默认): `#3b82f6` → `#60a5fa` (渐变)
- **green**: `#10b981` → `#34d399`
- **yellow**: `#f59e0b` → `#fbbf24`
- **red**: `#ef4444` → `#f87171`

### StatusBadge 状态颜色
- **pending**: 灰色 (`#6b7280`)
- **running**: 蓝色 (`#1e40af`)
- **success**: 绿色 (`#065f46`)
- **error**: 红色 (`#991b1b`)
- **warning**: 黄色 (`#92400e`)

### BreathingLight 颜色
- **green**: `#10b981`
- **blue**: `#3b82f6`
- **yellow**: `#f59e0b`
- **red**: `#ef4444`

---

## 🔧 技术栈

- **React 18** - 组件框架
- **TypeScript** - 类型安全
- **CSS Modules** - 样式隔离
- **@keyframes** - 原生 CSS 动画
- **Vite** - 构建工具

---

## 📝 开发建议

1. **性能优化**: 所有动画使用 `transform` 和 `opacity`，充分利用 GPU 加速
2. **样式隔离**: 使用 CSS Modules 避免全局样式污染
3. **类型安全**: 所有 Props 都有完整的 TypeScript 类型定义
4. **可定制**: 支持 `className` prop，可以添加自定义样式
5. **响应式**: 动画时长和效果适合各种设备

---

## 🐛 故障排查

### CSS Modules 导入失败
确保项目有 `vite-env.d.ts` 文件，包含：
```typescript
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

### 动画不播放
检查是否满足动画触发条件（如 `animate={true}`、`active={true}` 等）

### 类型错误
确保从 `index.ts` 导入，而不是直接从组件文件导入

---

**Created by Worker-4** | 2026-01-06
