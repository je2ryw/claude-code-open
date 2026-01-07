# Stage 2 文件索引

## 组件文件

### BlueprintCard（列表卡片）
- **组件**: `src/web/client/src/components/swarm/BlueprintCard/index.tsx`
- **样式**: `src/web/client/src/components/swarm/BlueprintCard/BlueprintCard.module.css`

### BlueprintDetailPanel（详情面板）
- **组件**: `src/web/client/src/components/swarm/BlueprintDetailPanel/index.tsx`
- **样式**: `src/web/client/src/components/swarm/BlueprintDetailPanel/BlueprintDetailPanel.module.css`

## 文档文件

- **使用指南**: `docs/BlueprintComponents-Usage.md`
- **实现总结**: `docs/Stage2-Implementation-Summary.md`
- **文件索引**: `docs/Stage2-Files-Index.md`（本文件）

## 依赖的通用组件

- **ProgressBar**: `src/web/client/src/components/swarm/common/ProgressBar.tsx`
- **FadeIn**: `src/web/client/src/components/swarm/common/FadeIn.tsx`
- **动画样式**: `src/web/client/src/components/swarm/common/animations.module.css`

## 类型定义参考

- **Blueprint 类型**: `src/blueprint/types.ts`
- **WebSocket 类型**: `src/web/client/src/pages/SwarmConsole/types.ts`

## API 路由

- **蓝图 API**: `src/web/server/routes/blueprint-api.ts`
  - GET `/api/blueprint/blueprints/:id` - 获取单个蓝图详情
  - GET `/api/blueprint/blueprints` - 获取所有蓝图
  - POST `/api/blueprint/blueprints/:id/approve` - 批准蓝图
  - POST `/api/blueprint/blueprints/:id/reject` - 拒绝蓝图

## 快速导入

```typescript
// BlueprintCard
import { BlueprintCard, BlueprintCardData } from '@/components/swarm/BlueprintCard';

// BlueprintDetailPanel
import { BlueprintDetailPanel } from '@/components/swarm/BlueprintDetailPanel';

// 通用组件
import { ProgressBar } from '@/components/swarm/common/ProgressBar';
import { FadeIn } from '@/components/swarm/common/FadeIn';
```

## 验证命令

```bash
# 检查 TypeScript 错误
npx tsc --noEmit --project src/web/client/tsconfig.json 2>&1 | grep -i "BlueprintCard\|BlueprintDetailPanel"

# 查看组件文件
ls -la src/web/client/src/components/swarm/BlueprintCard
ls -la src/web/client/src/components/swarm/BlueprintDetailPanel

# 查看文档
ls -la docs | grep -i blueprint
```
