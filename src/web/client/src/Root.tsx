import { useState } from 'react';
import App from './App';
import SwarmConsole from './pages/SwarmConsole/index.tsx';
import BlueprintPage from './pages/BlueprintPage';
import TopNavBar from './components/swarm/TopNavBar';
import { ProjectProvider } from './contexts/ProjectContext';

type Page = 'chat' | 'swarm' | 'blueprint';

/**
 * 根组件 - 处理顶层导航和页面路由
 */
export default function Root() {
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  // 蜂群页面的初始蓝图 ID
  const [swarmBlueprintId, setSwarmBlueprintId] = useState<string | null>(null);

  const handlePageChange = (page: Page) => {
    setCurrentPage(page);
  };

  const handleSettingsClick = () => {
    setShowSettings(true);
  };

  // 跳转到蓝图页并选中指定蓝图
  const navigateToBlueprintPage = (blueprintId?: string) => {
    if (blueprintId) {
      setSelectedBlueprintId(blueprintId);
    }
    setCurrentPage('blueprint');
  };

  // 跳转到蜂群页（可选传递蓝图 ID）
  const navigateToSwarmPage = (blueprintId?: string) => {
    if (blueprintId) {
      setSwarmBlueprintId(blueprintId);
    }
    setCurrentPage('swarm');
  };

  // 渲染当前页面内容
  const renderPage = () => {
    switch (currentPage) {
      case 'chat':
        return (
          <App
            onNavigateToBlueprint={navigateToBlueprintPage}
            onNavigateToSwarm={navigateToSwarmPage}
          />
        );
      case 'swarm':
        return <SwarmConsole initialBlueprintId={swarmBlueprintId} />;
      case 'blueprint':
        return (
          <BlueprintPage
            initialBlueprintId={selectedBlueprintId}
            onNavigateToSwarm={navigateToSwarmPage}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ProjectProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
        <TopNavBar
          currentPage={currentPage}
          onPageChange={handlePageChange}
          onSettingsClick={handleSettingsClick}
        />
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex' }}>
          {renderPage()}
        </div>
      </div>
    </ProjectProvider>
  );
}
