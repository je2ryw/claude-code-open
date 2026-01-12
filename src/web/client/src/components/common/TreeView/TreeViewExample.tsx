import React from 'react';
import { TreeView, TreeNode } from './index';

// 示例数据：文件树
const fileTreeData: TreeNode[] = [
  {
    id: 'src',
    name: 'src',
    children: [
      {
        id: 'src/components',
        name: 'components',
        children: [
          {
            id: 'src/components/App.tsx',
            name: 'App.tsx'
          },
          {
            id: 'src/components/Header.tsx',
            name: 'Header.tsx'
          }
        ]
      },
      {
        id: 'src/utils',
        name: 'utils',
        children: [
          {
            id: 'src/utils/helpers.ts',
            name: 'helpers.ts'
          }
        ]
      }
    ]
  }
];

// 示例数据：符号树
const symbolTreeData: TreeNode[] = [
  {
    id: 'module:app',
    name: 'app.ts',
    type: 'module',
    children: [
      {
        id: 'symbol:App',
        name: 'App',
        type: 'class'
      },
      {
        id: 'symbol:render',
        name: 'render',
        type: 'function'
      }
    ]
  }
];

// 示例数据：任务树
const taskTreeData: TreeNode[] = [
  {
    id: 'task-1',
    name: '实现用户认证',
    status: 'in_progress',
    children: [
      {
        id: 'task-1-1',
        name: '创建登录页面',
        status: 'completed'
      },
      {
        id: 'task-1-2',
        name: '实现 JWT 验证',
        status: 'in_progress'
      }
    ]
  }
];

export const TreeViewExample: React.FC = () => {
  const [selectedId, setSelectedId] = React.useState<string | undefined>();

  return (
    <div style={{ padding: '20px', display: 'flex', gap: '20px' }}>
      <div style={{ flex: 1 }}>
        <h3>文件树</h3>
        <TreeView
          data={fileTreeData}
          dataType="file"
          selectedId={selectedId}
          onSelect={(node) => {
            console.log('Selected file:', node);
            setSelectedId(node.id);
          }}
        />
      </div>

      <div style={{ flex: 1 }}>
        <h3>符号树</h3>
        <TreeView
          data={symbolTreeData}
          dataType="symbol"
          selectedId={selectedId}
          onSelect={(node) => {
            console.log('Selected symbol:', node);
            setSelectedId(node.id);
          }}
        />
      </div>

      <div style={{ flex: 1 }}>
        <h3>任务树</h3>
        <TreeView
          data={taskTreeData}
          dataType="task"
          selectedId={selectedId}
          onSelect={(node) => {
            console.log('Selected task:', node);
            setSelectedId(node.id);
          }}
        />
      </div>
    </div>
  );
};
