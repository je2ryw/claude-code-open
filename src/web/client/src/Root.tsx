import { useState } from 'react';
import App from './App';
import SwarmConsole from './pages/SwarmConsole/index.tsx';
import TopNavBar from './components/swarm/TopNavBar';

type Page = 'chat' | 'swarm' | 'blueprint';

/**
 * 根组件 - 处理顶层导航和页面路由
 */
export default function Root() {
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [showSettings, setShowSettings] = useState(false);

  const handlePageChange = (page: Page) => {
    setCurrentPage(page);
  };

  const handleSettingsClick = () => {
    setShowSettings(true);
  };

  // 渲染当前页面内容
  const renderPage = () => {
    switch (currentPage) {
      case 'chat':
        return <App />;
      case 'swarm':
        return <SwarmConsole />;
      case 'blueprint':
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            fontSize: '14px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <p>蓝图管理功能开发中...</p>
            </div>
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
