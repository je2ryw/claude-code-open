# WorkerPanel 组件

Worker 状态面板组件，用于展示蜂群系统中 Queen Agent 和 Worker Agents 的实时状态。

## 组件结构

```
WorkerPanel/
├── index.tsx                    # 主面板组件（导出入口）
├── QueenStatus.tsx             # Queen Agent 状态卡片
├── WorkerCard.tsx              # Worker Agent 状态卡片
├── WorkerPanel.module.css      # 组件样式
└── README.md                   # 使用文档
```

## 功能特性

### QueenStatus（Queen 状态卡片）
- ✅ 显示 Queen Agent 当前状态（空闲/规划/协调/审查/暂停）
- ✅ 状态图标和颜色标识
- ✅ 显示当前决策信息
- ✅ 状态动画效果（脉冲动画）

### WorkerCard（Worker 状态卡片）
- ✅ 显示 Worker ID 和当前状态
- ✅ 呼吸灯效果指示工作状态
- ✅ TDD 阶段进度指示器
  - 编写测试 → 运行测试(红) → 编写代码 → 运行测试(绿) → 重构优化 → 完成
- ✅ 实时进度条（带流光动画）
- ✅ 重试次数追踪（带警告颜色）
- ✅ 任务执行时长统计

## 使用示例

### 基础用法

```tsx
import { WorkerPanel, QueenAgent, WorkerAgent } from './components/swarm/WorkerPanel';

function App() {
  const queen: QueenAgent = {
    status: 'coordinating',
    decision: '分配任务给 Worker-1 处理订单更新功能'
  };

  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: 'coding',
      taskId: 'task-001',
      taskName: '更新订单状态',
      progress: 45,
      tddPhase: 'write_code',
      retryCount: 1,
      maxRetries: 3,
      duration: 155 // 2分35秒
    },
    {
      id: 'Worker-2',
      status: 'testing',
      taskId: 'task-002',
      taskName: '用户认证功能',
      progress: 80,
      tddPhase: 'run_test_green',
      retryCount: 0,
      maxRetries: 3,
      duration: 320 // 5分20秒
    }
  ];

  return <WorkerPanel queen={queen} workers={workers} />;
}
```

### 类型定义

```typescript
// Queen Agent 状态
interface QueenAgent {
  status: 'idle' | 'planning' | 'coordinating' | 'reviewing' | 'paused';
  decision?: string; // 可选的决策说明
}

// Worker Agent 状态
interface WorkerAgent {
  id: string;                    // Worker 标识
  status: 'idle' | 'test_writing' | 'coding' | 'testing' | 'waiting';
  taskId?: string;               // 任务 ID
  taskName?: string;             // 任务名称
  progress: number;              // 进度 0-100
  tddPhase: 'write_test' | 'run_test_red' | 'write_code' | 'run_test_green' | 'refactor' | 'done';
  retryCount: number;            // 当前重试次数
  maxRetries: number;            // 最大重试次数
  duration?: number;             // 执行时长（秒）
}
```

## 状态说明

### Queen 状态
- `idle` - 空闲中（灰色）
- `planning` - 规划中（蓝色，带脉冲动画）
- `coordinating` - 协调中（橙色，带脉冲动画）
- `reviewing` - 审查中（紫色，带脉冲动画）
- `paused` - 已暂停（灰色）

### Worker 状态
- `idle` - 空闲中
- `test_writing` - 编写测试中
- `coding` - 编码中
- `testing` - 测试中
- `waiting` - 等待中

### TDD 阶段
1. `write_test` - 📝 编写测试
2. `run_test_red` - 🔴 运行测试(红)
3. `write_code` - 💻 编写代码
4. `run_test_green` - 🟢 运行测试(绿)
5. `refactor` - ♻️ 重构优化
6. `done` - ✅ 完成

## 动画效果

### 呼吸灯动画
```css
@keyframes breathing {
  0%, 100% { box-shadow: 0 0 5px rgba(76, 175, 80, 0.5); }
  50% { box-shadow: 0 0 20px rgba(76, 175, 80, 0.8); }
}
```
- 工作状态（coding/testing/test_writing）显示绿色呼吸灯
- 等待状态显示橙色脉冲灯

### 进度条流光效果
- 进度条自动显示流光动画
- 平滑的进度过渡效果

### 状态脉冲动画
- Queen 工作状态显示脉冲动画
- 活跃的 TDD 阶段显示脉冲指示器

## 样式定制

组件使用 CSS Modules，可通过覆盖以下类名进行定制：

```css
/* 修改 Queen 卡片背景 */
.queenCard {
  background: linear-gradient(135deg, #custom-color 0%, #custom-color-2 100%);
}

/* 修改 Worker 卡片样式 */
.workerCard {
  border-color: #custom-border;
}

/* 修改进度条颜色 */
.progressFill {
  background: linear-gradient(90deg, #custom-start 0%, #custom-end 100%);
}
```

## 响应式设计

- 支持桌面端和移动端
- 移动端会自动调整字体大小和间距
- 自适应滚动条

## 注意事项

1. **性能优化**：当 Workers 数量较多时（>10），考虑使用虚拟滚动
2. **实时更新**：建议配合 WebSocket 或轮询机制实时更新状态
3. **错误处理**：组件内部无错误边界，需在外层添加 ErrorBoundary
4. **可访问性**：已添加 title 属性，建议补充完整的 ARIA 标签

## 集成建议

### 与 WebSocket 集成

```tsx
import { useEffect, useState } from 'react';
import { WorkerPanel } from './components/swarm/WorkerPanel';

function SwarmDashboard() {
  const [queen, setQueen] = useState<QueenAgent>({ status: 'idle' });
  const [workers, setWorkers] = useState<WorkerAgent[]>([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/swarm');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'queen_update') {
        setQueen(data.queen);
      } else if (data.type === 'workers_update') {
        setWorkers(data.workers);
      }
    };

    return () => ws.close();
  }, []);

  return <WorkerPanel queen={queen} workers={workers} />;
}
```

## 待优化项

- [ ] 添加 Worker 卡片的展开/收起功能
- [ ] 支持 Worker 卡片拖拽排序
- [ ] 添加性能监控面板
- [ ] 支持导出状态日志
- [ ] 添加更多自定义主题

## 版本历史

- v1.0.0 (2026-01-06) - 初始版本，支持基础状态展示和动画效果
