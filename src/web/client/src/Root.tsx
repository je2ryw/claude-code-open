import { useState } from 'react';
import App from './App';
import SwarmConsole from './pages/SwarmConsole/index.tsx';
import BlueprintPage from './pages/BlueprintPage';
import TopNavBar from './components/swarm/TopNavBar';
import { OnionView } from './components/swarm/ProjectNavigator/views/OnionView';

type Page = 'chat' | 'swarm' | 'blueprint' | 'onion';

/**
 * 根组件 - 处理顶层导航和页面路由
 */
export default function Root() {
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);

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

  // 跳转到蜂群页
  const navigateToSwarmPage = () => {
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
        return <SwarmConsole />;
      case 'blueprint':
        return (
          <BlueprintPage
            initialBlueprintId={selectedBlueprintId}
            onNavigateToSwarm={navigateToSwarmPage}
          />
        );
      case 'onion':
        return (
          <div style={{ height: '100%', overflow: 'auto', background: '#0f172a' }}>
            <OnionView
              onNavigateToBlueprint={(filePath) => {
                console.log('[OnionView] 跳转到蓝图页面查看文件:', filePath);
                // 跳转到蓝图页面
                setCurrentPage('blueprint');
              }}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNavBar
        currentPage={currentPage}
        onPageChange={handlePageChange}
        onSettingsClick={handleSettingsClick}
      />
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {renderPage()}
      </div>
    </div>
  );
}
