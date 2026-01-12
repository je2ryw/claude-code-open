# ProjectMapView 使用示例

## 基本使用

### 1. 导入组件

```tsx
import { ProjectMapView } from '@/components/swarm/ProjectNavigator';
```

### 2. 在页面中使用

```tsx
function ProjectMapPage() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ProjectMapView />
    </div>
  );
}

export default ProjectMapPage;
```

## 集成到现有路由

### 在 React Router 中使用

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProjectMapView } from '@/components/swarm/ProjectNavigator';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/project-map" element={<ProjectMapView />} />
        {/* 其他路由 */}
      </Routes>
    </BrowserRouter>
  );
}
```

## API 端点配置

确保后端 API 端点 `/api/blueprint/project-map` 已正确配置并返回以下格式的数据：

```json
{
  "success": true,
  "data": {
    "moduleStats": {
      "totalFiles": 342,
      "totalLines": 28956,
      "byDirectory": {
        "src/core": 45,
        "src/tools": 38,
        "src/ui": 25
      },
      "languages": {
        "typescript": 342
      }
    },
    "layers": {
      "total": 100,
      "distribution": {
        "presentation": 25,
        "business": 40,
        "data": 15,
        "infrastructure": 20
      }
    },
    "entryPoints": [
      {
        "id": "cli.ts",
        "name": "cli.ts",
        "moduleId": "src/cli.ts",
        "type": "cli"
      },
      {
        "id": "main.ts",
        "name": "main.ts",
        "moduleId": "src/main.ts",
        "type": "main"
      }
    ],
    "coreSymbols": {
      "classes": [
        { "name": "ClaudeClient", "refs": 45, "moduleId": "src/core/client.ts" },
        { "name": "ConversationLoop", "refs": 38, "moduleId": "src/core/loop.ts" }
      ],
      "functions": [
        { "name": "parseArgs", "refs": 32, "moduleId": "src/cli.ts" }
      ]
    }
  }
}
```

## 样式定制

如果需要定制样式，可以覆盖 CSS 变量或创建自定义样式：

```tsx
<div className="custom-project-map-wrapper">
  <ProjectMapView />
</div>
```

```css
.custom-project-map-wrapper {
  --card-bg: #252526;
  --card-border: #3c3c3c;
  --text-primary: #d4d4d4;
  --accent-color: #007acc;
}
```

## 注意事项

1. **高度设置**: 组件需要明确的高度容器才能正确显示滚动
2. **API 延迟**: 首次加载可能需要几秒钟进行代码分析
3. **浏览器兼容性**: 建议使用现代浏览器（Chrome、Firefox、Safari、Edge）
