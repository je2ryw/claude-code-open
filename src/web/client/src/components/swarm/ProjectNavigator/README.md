# ProjectNavigator 组件

项目导航器组件套件，用于展示和浏览项目结构、架构分层、核心符号等信息。

## 组件列表

### ProjectMapView

项目地图视图，展示项目概览信息，包括：

- **模块统计**: 总文件数、总行数、主要目录分布
- **架构分层**: 展示 Presentation、Business、Data、Infrastructure 层的分布
- **入口点**: 检测到的项目入口点（CLI、Main、Index等）
- **核心符号**: 按引用数排序的核心类和函数

#### 使用方式

```tsx
import { ProjectMapView } from '@/components/swarm/ProjectNavigator';

function MyPage() {
  return <ProjectMapView />;
}
```

#### 数据源

组件从 `/api/blueprint/project-map` API 获取数据。

## 子组件

- **ModuleStatsCard**: 模块统计卡片
- **ArchitectureLayersView**: 架构分层视图
- **EntryPointsList**: 入口点列表
- **CoreSymbolsList**: 核心符号列表

## 样式

组件使用 CSS Modules，采用 VS Code 深色主题风格。

## 响应式设计

- 大屏幕（>1200px）: 2列卡片布局
- 中等屏幕（768px-1200px）: 1列布局
- 小屏幕（<768px）: 紧凑布局

## 状态处理

- **加载中**: 显示旋转动画
- **错误**: 显示错误信息
- **空数据**: 相应的空状态提示
