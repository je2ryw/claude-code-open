# BlueprintCard 和 BlueprintDetailPanel 组件使用指南

## 概述

Stage 2 实现了两个核心组件：
- **BlueprintCard**: 蓝图列表卡片组件
- **BlueprintDetailPanel**: 蓝图详情面板组件

## BlueprintCard 组件

### 功能特性

1. **状态可视化**
   - 通过图标和徽章显示蓝图状态（待审核、执行中、已暂停、已完成、失败）
   - 左侧彩色边框标识状态
   - 选中时高亮显示

2. **统计信息**
   - 模块数量、流程数量、NFR 数量统计
   - 创建时间智能显示（相对时间）

3. **执行进度**（仅 running 状态）
   - 进度条显示执行进度
   - Worker 状态统计（总计、工作中、空闲）

4. **操作按钮**
   - 根据不同状态显示对应操作：
     - `pending`: 批准、拒绝
     - `running`: 暂停、查看蜂群
     - `paused`: 恢复、停止
     - `completed/failed`: 查看详情

### 使用示例

```tsx
import { BlueprintCard, BlueprintCardData } from '@/components/swarm/BlueprintCard';

const blueprint: BlueprintCardData = {
  id: 'blueprint-001',
  name: '电商系统蓝图',
  description: '基于微服务架构的电商平台',
  status: 'running',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-01-15T12:00:00Z',
  moduleCount: 8,
  processCount: 12,
  nfrCount: 15,
  progress: 65,
  workerStats: {
    total: 5,
    working: 3,
    idle: 2,
  },
};

function BlueprintList() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div>
      <BlueprintCard
        blueprint={blueprint}
        isSelected={selectedId === blueprint.id}
        onClick={(id) => setSelectedId(id)}
      />
    </div>
  );
}
```

### Props 接口

```typescript
interface BlueprintCardProps {
  blueprint: BlueprintCardData;  // 蓝图数据
  isSelected: boolean;            // 是否选中
  onClick: (blueprintId: string) => void;  // 点击回调
}

interface BlueprintCardData {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  moduleCount?: number;
  processCount?: number;
  nfrCount?: number;
  progress?: number;  // 0-100
  workerStats?: {
    total: number;
    working: number;
    idle: number;
  };
}
```

## BlueprintDetailPanel 组件

### 功能特性

1. **滑入动画**
   - 从右侧滑入的固定宽度面板（500px）
   - 平滑的进入动画

2. **完整信息展示**
   - 基本信息：名称、版本、状态、创建时间、批准人
   - As-Is 业务流程（可展开/折叠）
   - To-Be 业务流程（可展开/折叠）
   - 系统模块（可展开/折叠）
   - 非功能性要求（可展开/折叠）

3. **智能加载**
   - 自动通过 API 获取详细数据
   - 加载状态和错误状态处理

4. **操作按钮**
   - 根据状态显示操作：
     - `review`: 批准、拒绝、删除
     - `approved`: 启动执行
     - `draft`: 删除

### 使用示例

```tsx
import { BlueprintDetailPanel } from '@/components/swarm/BlueprintDetailPanel';

function BlueprintManager() {
  const [detailBlueprintId, setDetailBlueprintId] = useState<string | null>(null);

  return (
    <div>
      {/* 主内容区 */}
      <button onClick={() => setDetailBlueprintId('blueprint-001')}>
        查看蓝图详情
      </button>

      {/* 详情面板（覆盖层） */}
      {detailBlueprintId && (
        <BlueprintDetailPanel
          blueprintId={detailBlueprintId}
          onClose={() => setDetailBlueprintId(null)}
        />
      )}
    </div>
  );
}
```

### Props 接口

```typescript
interface BlueprintDetailPanelProps {
  blueprintId: string;        // 蓝图 ID
  onClose: () => void;         // 关闭回调
}
```

### API 调用

组件会自动调用以下 API：
```
GET /api/blueprint/blueprints/:id
```

返回的数据结构应包含完整的蓝图信息（参见 `src/blueprint/types.ts` 中的 `Blueprint` 接口）。

## 样式定制

两个组件都使用 CSS Modules，可以通过以下方式定制样式：

```tsx
// 自定义类名
<BlueprintCard
  blueprint={blueprint}
  isSelected={false}
  onClick={handleClick}
  className="custom-card"  // 如果需要扩展支持
/>
```

## 复用的组件

- **ProgressBar**: 来自 `@/components/swarm/common/ProgressBar`
  - 用于显示执行进度
  - 支持动画效果

- **FadeIn**: 来自 `@/components/swarm/common/FadeIn`
  - 用于淡入动画
  - 支持延迟和持续时间配置

## 状态映射

### 蓝图状态

| 状态 | 显示文本 | 图标 | 颜色 |
|------|---------|------|------|
| pending | 待审核 | 🟡 | 橙色 |
| running | 执行中 | 🟢 | 绿色 |
| paused | 已暂停 | ⏸️ | 灰色 |
| completed | 已完成 | ✅ | 蓝色 |
| failed | 失败 | ❌ | 红色 |

### NFR 优先级

| 优先级 | 显示文本 | 颜色 |
|--------|---------|------|
| must | 必须 | 红色 |
| should | 应该 | 橙色 |
| could | 可以 | 蓝色 |
| wont | 不会 | 灰色 |

## 后续集成

目前操作按钮使用 `console.log` 输出，后续需要连接以下 API：

### BlueprintCard 操作
- `approve`: POST `/api/blueprint/blueprints/:id/approve`
- `reject`: POST `/api/blueprint/blueprints/:id/reject`
- `pause`: POST `/api/coordinator/stop` (暂停蜂群)
- `resume`: POST `/api/coordinator/start` (恢复蜂群)
- `stop`: POST `/api/coordinator/stop` (停止蜂群)
- `view-swarm`: 导航到蜂群控制台页面
- `view-detail`: 打开详情面板

### BlueprintDetailPanel 操作
- `approve`: POST `/api/blueprint/blueprints/:id/approve`
- `reject`: POST `/api/blueprint/blueprints/:id/reject`
- `start-execution`: POST `/api/coordinator/queen` + `/api/coordinator/start`
- `delete`: DELETE `/api/blueprint/blueprints/:id` (需要实现)

## 响应式设计

两个组件都支持响应式布局：
- 桌面端：完整显示所有信息
- 移动端（< 768px）：
  - BlueprintCard: 垂直布局，操作按钮占满宽度
  - BlueprintDetailPanel: 全屏显示

## 文件结构

```
src/web/client/src/components/swarm/
├── BlueprintCard/
│   ├── index.tsx
│   └── BlueprintCard.module.css
├── BlueprintDetailPanel/
│   ├── index.tsx
│   └── BlueprintDetailPanel.module.css
└── common/
    ├── ProgressBar.tsx
    ├── FadeIn.tsx
    └── animations.module.css
```

## 注意事项

1. **类型安全**: 组件使用 TypeScript，确保传入的数据符合接口定义
2. **错误处理**: BlueprintDetailPanel 包含加载失败的错误处理
3. **性能优化**: 使用 CSS 动画代替 JS 动画，性能更好
4. **可访问性**: 按钮包含 `title` 属性提供提示信息

## 测试建议

```typescript
// 单元测试示例
describe('BlueprintCard', () => {
  it('应该根据状态显示正确的图标', () => {
    // 测试代码
  });

  it('应该在点击时调用 onClick 回调', () => {
    // 测试代码
  });

  it('执行中状态应该显示进度条', () => {
    // 测试代码
  });
});

describe('BlueprintDetailPanel', () => {
  it('应该在加载时显示 spinner', () => {
    // 测试代码
  });

  it('应该成功获取并显示蓝图详情', async () => {
    // 测试代码
  });

  it('应该处理 API 错误', async () => {
    // 测试代码
  });
});
```
