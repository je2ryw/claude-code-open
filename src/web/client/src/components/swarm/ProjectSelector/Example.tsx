/**
 * ProjectSelector 使用示例
 *
 * 这个文件展示如何使用 ProjectSelector 组件
 */

import { useState } from 'react';
import { ProjectSelector, Project } from './index';

/**
 * ProjectSelector 使用示例组件
 */
export function ProjectSelectorExample() {
  // 当前选中的项目
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // 处理项目切换
  const handleProjectChange = (project: Project) => {
    console.log('切换到项目:', project);
    setCurrentProject(project);
  };

  // 处理打开文件夹
  const handleOpenFolder = () => {
    // 在实际应用中，这里可以触发系统文件选择对话框
    // 或者打开自定义的目录浏览器
    console.log('打开文件夹对话框');

    // 示例：模拟选择一个文件夹
    const mockProject: Project = {
      id: 'new-project',
      name: '新项目',
      path: '/path/to/new-project',
      lastOpenedAt: new Date().toISOString(),
    };
    setCurrentProject(mockProject);
  };

  // 处理项目移除
  const handleProjectRemove = (project: Project) => {
    console.log('移除项目:', project);
    // 如果移除的是当前项目，清空选择
    if (currentProject?.id === project.id) {
      setCurrentProject(null);
    }
  };

  return (
    <div style={{ padding: 20, background: '#1e1e1e', minHeight: '100vh' }}>
      <h2 style={{ color: '#fff', marginBottom: 20 }}>ProjectSelector 示例</h2>

      <div style={{ maxWidth: 300 }}>
        <ProjectSelector
          currentProject={currentProject}
          onProjectChange={handleProjectChange}
          onOpenFolder={handleOpenFolder}
          onProjectRemove={handleProjectRemove}
        />
      </div>

      {currentProject && (
        <div style={{ marginTop: 20, color: '#ccc' }}>
          <h3>当前项目信息：</h3>
          <pre style={{ background: '#2d2d2d', padding: 10, borderRadius: 4 }}>
            {JSON.stringify(currentProject, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
