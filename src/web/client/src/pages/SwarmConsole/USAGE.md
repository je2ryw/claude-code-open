# SwarmConsole Hooks 使用指南

本文档说明如何使用蜂群系统的 WebSocket 通信和状态管理 Hooks。

## 文件结构

```
SwarmConsole/
├── index.tsx                         # 主组件 (默认导出 SwarmConsole 组件)
├── types.ts                          # 类型定义
├── hooks/
│   ├── index.ts                      # Hooks 导出
│   ├── useSwarmWebSocket.ts          # WebSocket 连接和消息处理
│   └── useSwarmState.ts              # 蜂群状态管理
├── SwarmConsole.module.css           # 样式
└── USAGE.md                          # 使用文档
```

## 基础用法

### 1. 使用 useSwarmState（推荐）

最简单的方式是直接使用 `useSwarmState`，它内部集成了 WebSocket 连接：

```typescript
import { useSwarmState } from './pages/SwarmConsole/hooks';

function SwarmMonitor({ blueprintId }: { blueprintId: string }) {
  const { state, isLoading, error, refresh } = useSwarmState({
    url: 'ws://localhost:3000/ws/swarm',
    blueprintId,
  });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div>
      <h2>{state.blueprint?.name}</h2>
      <p>进度: {state.stats?.progressPercentage}%</p>
      <p>Workers: {state.workers.length}</p>
      <button onClick={refresh}>刷新</button>
    </div>
  );
}
```

### 2. 使用 useSwarmWebSocket（高级用法）

如果需要更精细的控制，可以直接使用 `useSwarmWebSocket`：

```typescript
import { useSwarmWebSocket } from './pages/SwarmConsole/hooks';

function SwarmController({ blueprintId }: { blueprintId: string }) {
  const {
    connected,
    status,
    subscribe,
    unsubscribe,
    pauseSwarm,
    resumeSwarm,
    stopSwarm,
  } = useSwarmWebSocket({
    url: 'ws://localhost:3000/ws/swarm',
    onMessage: (msg) => {
      console.log('收到消息:', msg);
    },
    onError: (err) => {
      console.error('WebSocket 错误:', err);
    },
  });

  useEffect(() => {
    if (connected) {
      subscribe(blueprintId);
      return () => unsubscribe(blueprintId);
    }
  }, [connected, blueprintId]);

  return (
    <div>
      <p>状态: {status}</p>
      <button onClick={() => pauseSwarm(blueprintId)}>暂停</button>
      <button onClick={() => resumeSwarm(blueprintId)}>继续</button>
      <button onClick={() => stopSwarm(blueprintId)}>停止</button>
    </div>
  );
}
```

## 辅助 Hooks

### useWorker - 获取特定 Worker 信息

```typescript
import { useSwarmState, useWorker } from './pages/SwarmConsole/hooks';

function WorkerDetail({ workerId }: { workerId: string }) {
  const { state } = useSwarmState({ url: 'ws://localhost:3000/ws/swarm' });
  const worker = useWorker(state, workerId);

  if (!worker) return <div>Worker 不存在</div>;

  return (
    <div>
      <h3>{worker.name}</h3>
      <p>状态: {worker.status}</p>
      <p>进度: {worker.progress}%</p>
      <p>当前任务: {worker.currentTaskTitle}</p>
    </div>
  );
}
```

### useTaskNode - 获取特定任务节点

```typescript
import { useSwarmState, useTaskNode } from './pages/SwarmConsole/hooks';

function TaskDetail({ taskId }: { taskId: string }) {
  const { state } = useSwarmState({ url: 'ws://localhost:3000/ws/swarm' });
  const task = useTaskNode(state, taskId);

  if (!task) return <div>任务不存在</div>;

  return (
    <div>
      <h3>{task.title}</h3>
      <p>状态: {task.status}</p>
      <p>描述: {task.description}</p>
      <p>负责人: {task.assignedTo || '未分配'}</p>
    </div>
  );
}
```

### useActiveWorkers - 获取活跃 Workers

```typescript
import { useSwarmState, useActiveWorkers } from './pages/SwarmConsole/hooks';

function ActiveWorkersList() {
  const { state } = useSwarmState({ url: 'ws://localhost:3000/ws/swarm' });
  const activeWorkers = useActiveWorkers(state);

  return (
    <div>
      <h3>活跃 Workers ({activeWorkers.length})</h3>
      <ul>
        {activeWorkers.map(worker => (
          <li key={worker.id}>
            {worker.name} - {worker.status} - {worker.progress}%
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### useFlatTaskList - 获取任务扁平化列表

```typescript
import { useSwarmState, useFlatTaskList } from './pages/SwarmConsole/hooks';

function TaskList() {
  const { state } = useSwarmState({ url: 'ws://localhost:3000/ws/swarm' });
  const tasks = useFlatTaskList(state);

  return (
    <div>
      <h3>所有任务 ({tasks.length})</h3>
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            {task.title} - {task.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### useRecentTimelineEvents - 获取最近的时间线事件

```typescript
import { useSwarmState, useRecentTimelineEvents } from './pages/SwarmConsole/hooks';

function Timeline() {
  const { state } = useSwarmState({ url: 'ws://localhost:3000/ws/swarm' });
  const events = useRecentTimelineEvents(state, 20);

  return (
    <div>
      <h3>最近事件</h3>
      <ul>
        {events.map(event => (
          <li key={event.id}>
            [{event.timestamp}] {event.actor}: {event.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## 完整示例

```typescript
import { useSwarmState, useActiveWorkers, useFlatTaskList } from './pages/SwarmConsole/hooks';

function SwarmDashboard({ blueprintId }: { blueprintId: string }) {
  const { state, isLoading, error, refresh } = useSwarmState({
    url: 'ws://localhost:3000/ws/swarm',
    blueprintId,
    maxTimelineEvents: 50,
  });

  const activeWorkers = useActiveWorkers(state);
  const allTasks = useFlatTaskList(state);

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error} <button onClick={refresh}>重试</button></div>;
  if (!state.blueprint) return <div>蓝图不存在</div>;

  return (
    <div>
      {/* 蓝图信息 */}
      <section>
        <h1>{state.blueprint.name}</h1>
        <p>{state.blueprint.description}</p>
        <p>状态: {state.blueprint.status}</p>
      </section>

      {/* 统计信息 */}
      {state.stats && (
        <section>
          <h2>进度统计</h2>
          <p>总任务: {state.stats.totalTasks}</p>
          <p>已完成: {state.stats.passedTasks}</p>
          <p>进行中: {state.stats.runningTasks}</p>
          <p>失败: {state.stats.failedTasks}</p>
          <p>进度: {state.stats.progressPercentage}%</p>
        </section>
      )}

      {/* Workers 列表 */}
      <section>
        <h2>活跃 Workers ({activeWorkers.length})</h2>
        {activeWorkers.map(worker => (
          <div key={worker.id}>
            <h3>{worker.name}</h3>
            <p>状态: {worker.status}</p>
            <p>进度: {worker.progress}%</p>
            <p>任务: {worker.currentTaskTitle || '空闲'}</p>
          </div>
        ))}
      </section>

      {/* 任务列表 */}
      <section>
        <h2>任务列表 ({allTasks.length})</h2>
        {allTasks.map(task => (
          <div key={task.id}>
            <h4>{task.title}</h4>
            <p>状态: {task.status}</p>
            <p>负责人: {task.assignedTo || '未分配'}</p>
          </div>
        ))}
      </section>

      {/* 时间线 */}
      <section>
        <h2>时间线</h2>
        {state.timeline.map(event => (
          <div key={event.id}>
            <span>[{new Date(event.timestamp).toLocaleTimeString()}]</span>
            <span>{event.actor}: {event.message}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
```

## WebSocket 配置选项

### useSwarmWebSocket 选项

```typescript
interface UseSwarmWebSocketOptions {
  url: string;                    // WebSocket 服务器地址
  onMessage?: (msg) => void;      // 消息处理回调
  onError?: (err) => void;        // 错误处理回调
  autoReconnect?: boolean;        // 自动重连（默认: true）
  reconnectInterval?: number;     // 重连间隔（默认: 3000ms）
  pingInterval?: number;          // 心跳间隔（默认: 25000ms）
}
```

### useSwarmState 选项

```typescript
interface UseSwarmStateOptions {
  url: string;                    // WebSocket 服务器地址
  blueprintId?: string;           // 自动订阅的蓝图 ID
  maxTimelineEvents?: number;     // 最大时间线事件数（默认: 100）
  autoReconnect?: boolean;        // 自动重连（默认: true）
  reconnectInterval?: number;     // 重连间隔（默认: 3000ms）
  pingInterval?: number;          // 心跳间隔（默认: 25000ms）
}
```

## 类型定义

所有类型定义都在 `types.ts` 中，包括：

- `Blueprint` - 蓝图
- `TaskNode` - 任务节点
- `TaskTree` - 任务树
- `Stats` - 统计信息
- `QueenAgent` - Queen 代理
- `WorkerAgent` - Worker 代理
- `TimelineEvent` - 时间线事件
- `SwarmState` - 蜂群状态
- `SwarmClientMessage` - 客户端消息类型
- `SwarmServerMessage` - 服务端消息类型

## 注意事项

1. **连接管理**: Hooks 会自动管理 WebSocket 连接的生命周期，包括连接、重连、关闭。
2. **组件卸载**: 组件卸载时会自动清理连接和定时器，无需手动清理。
3. **React 18 Strict Mode**: Hooks 已处理 Strict Mode 下的重复渲染问题。
4. **消息处理**: 所有消息都会通过消息处理器分发，支持多个处理器同时工作。
5. **错误处理**: WebSocket 错误和蜂群错误都会被捕获并通过回调函数传递。
6. **状态更新**: 状态更新是增量的，不会丢失之前的数据。

## 调试

开启 WebSocket 日志查看连接状态：

```typescript
// 所有 WebSocket 操作都会在控制台输出日志
// 格式: [SwarmWebSocket] 消息内容
// 格式: [SwarmState] 消息内容
```

## 性能优化

1. **时间线事件限制**: 使用 `maxTimelineEvents` 限制内存中的事件数量
2. **选择性订阅**: 只订阅需要的蓝图，避免不必要的数据传输
3. **辅助 Hooks**: 使用 `useMemo` 优化的辅助 Hooks 避免重复计算
4. **消息过滤**: 在 `onMessage` 回调中过滤不需要的消息

## 故障排查

### 连接失败

检查 WebSocket 服务器地址是否正确：

```typescript
const { status } = useSwarmWebSocket({ url: 'ws://localhost:3000/ws/swarm' });
console.log('连接状态:', status);
```

### 消息未收到

确认已订阅蓝图：

```typescript
const { connected, subscribe } = useSwarmWebSocket({ url: '...' });

useEffect(() => {
  if (connected) {
    subscribe(blueprintId);
  }
}, [connected, blueprintId]);
```

### 状态未更新

检查是否正确处理消息：

```typescript
const { state } = useSwarmState({
  url: '...',
  blueprintId,
});

useEffect(() => {
  console.log('状态更新:', state);
}, [state]);
```
