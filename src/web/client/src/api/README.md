# Blueprint API 使用文档

## 概述

本目录包含所有蓝图系统相关的 API 封装，提供完整的类型定义和错误处理。

## API 模块

### 1. blueprintApi - 蓝图管理 API

负责蓝图的 CRUD 操作和状态管理。

#### 示例用法

```typescript
import { blueprintApi } from './api/blueprint';

// 获取所有蓝图
const blueprints = await blueprintApi.getBlueprints();

// 创建新蓝图
const newBlueprint = await blueprintApi.createBlueprint({
  name: '电商系统',
  description: '一个完整的电商解决方案'
});

// 获取详情
const blueprint = await blueprintApi.getBlueprint(id);

// 提交审核
await blueprintApi.submitForReview(id);

// 批准蓝图
await blueprintApi.approveBlueprint(id, 'admin');

// 拒绝蓝图
await blueprintApi.rejectBlueprint(id, '需求不明确');
```

### 2. taskTreeApi - 任务树管理 API

管理任务树的生命周期和状态。

#### 示例用法

```typescript
import { taskTreeApi } from './api/blueprint';

// 获取任务树
const tree = await taskTreeApi.getTaskTree(treeId);

// 获取可执行任务
const tasks = await taskTreeApi.getExecutableTasks(treeId);

// 更新任务状态
await taskTreeApi.updateTaskStatus(treeId, taskId, 'completed');

// 添加子任务
await taskTreeApi.addSubTask(treeId, parentId, {
  name: '实现用户登录',
  description: '使用 JWT 实现用户认证',
  priority: 'high'
});
```

### 3. codebaseApi - 代码库分析 API

分析现有代码库并自动生成蓝图。

#### 示例用法

```typescript
import { codebaseApi } from './api/blueprint';

// 分析代码库
const result = await codebaseApi.analyze({
  rootDir: './src',
  projectName: 'My Project',
  projectDescription: '项目描述',
  granularity: 'medium'
});

// 获取分析状态
const status = await codebaseApi.getAnalyzeStatus();
```

### 4. coordinatorApi - Agent 协调器 API

控制蜂群系统的执行。

#### 示例用法

```typescript
import { coordinatorApi } from './api/blueprint';

// 初始化蜂王
await coordinatorApi.initializeQueen(blueprintId);

// 启动主循环
await coordinatorApi.start();

// 获取仪表板数据
const dashboard = await coordinatorApi.getDashboard();

// 获取所有 Worker
const workers = await coordinatorApi.getWorkers();

// 停止执行
await coordinatorApi.stop();
```

### 5. timeTravelApi - 时光倒流 API

管理检查点和版本回滚。

#### 示例用法

```typescript
import { timeTravelApi } from './api/blueprint';

// 获取时间线
const timeline = await timeTravelApi.getTimeline(treeId);

// 创建检查点
const checkpoint = await timeTravelApi.createCheckpoint(treeId, {
  name: '完成用户模块',
  description: '用户认证和权限管理已完成',
  isGlobal: true
});

// 回滚到检查点
await timeTravelApi.rollback(treeId, checkpointId);

// 预览回滚效果
const preview = await timeTravelApi.previewRollback(treeId, checkpointId);

// 创建分支
const branch = await timeTravelApi.createBranch(treeId, checkpointId, 'feature-v2');

// 对比检查点
const diff = await timeTravelApi.compare(treeId, checkpoint1, checkpoint2);
```

### 6. requirementDialogApi - 需求对话 API

通过对话方式收集需求并生成蓝图。

#### 示例用法

```typescript
import { requirementDialogApi } from './api/blueprint';

// 开始对话
const session = await requirementDialogApi.start();

// 发送消息
const response = await requirementDialogApi.sendMessage(
  session.sessionId,
  '我想创建一个博客系统'
);

// 获取对话状态
const state = await requirementDialogApi.getState(session.sessionId);

// 结束对话
await requirementDialogApi.end(session.sessionId);
```

## 错误处理

所有 API 调用都应该使用 try-catch 进行错误处理：

```typescript
try {
  const blueprints = await blueprintApi.getBlueprints();
} catch (error) {
  console.error('获取蓝图失败:', error.message);
  // 显示错误提示给用户
}
```

## 类型定义

所有 API 都有完整的 TypeScript 类型定义：

```typescript
import type {
  Blueprint,
  BlueprintListItem,
  SystemModule,
  BusinessProcess,
  NFR
} from './api/blueprint';
```

## 后端 API 路由映射

| 前端 API | 后端路由 | 方法 |
|---------|---------|------|
| `blueprintApi.getBlueprints()` | `/api/blueprint/blueprints` | GET |
| `blueprintApi.getBlueprint(id)` | `/api/blueprint/blueprints/:id` | GET |
| `blueprintApi.createBlueprint(data)` | `/api/blueprint/blueprints` | POST |
| `blueprintApi.submitForReview(id)` | `/api/blueprint/blueprints/:id/submit` | POST |
| `blueprintApi.approveBlueprint(id)` | `/api/blueprint/blueprints/:id/approve` | POST |
| `blueprintApi.rejectBlueprint(id, reason)` | `/api/blueprint/blueprints/:id/reject` | POST |
| `taskTreeApi.getTaskTree(id)` | `/api/blueprint/task-trees/:id` | GET |
| `coordinatorApi.start()` | `/api/blueprint/coordinator/start` | POST |
| `timeTravelApi.rollback(treeId, checkpointId)` | `/api/blueprint/time-travel/:treeId/rollback` | POST |

## 注意事项

1. **未实现的 API**：
   - `startExecution()` - 后端暂未提供直接执行接口
   - `deleteBlueprint()` - 后端暂未提供删除接口

2. **API 版本**：
   - 当前版本基于 blueprint-api.ts v1.0
   - 所有 API 路径前缀：`/api/blueprint/`

3. **响应格式**：
   所有 API 响应都遵循统一格式：
   ```typescript
   {
     success: boolean;
     data?: T;
     error?: string;
   }
   ```

4. **错误码**：
   - 404: 资源不存在
   - 500: 服务器错误
   - 400: 请求参数错误

## 开发建议

1. 使用 TypeScript 类型检查确保类型安全
2. 所有异步调用都应该有错误处理
3. 考虑添加加载状态和重试逻辑
4. 对于长时间运行的操作（如代码库分析），使用轮询或 WebSocket
