import React from 'react';
import { ProjectNavigator } from './index';

/**
 * ProjectNavigator 示例页面
 *
 * 用于快速预览和测试 ProjectNavigator 组件
 */
export const ProjectNavigatorExample: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ProjectNavigator />
    </div>
  );
};

export default ProjectNavigatorExample;
