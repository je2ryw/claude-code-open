import { useState, useCallback } from 'react';
import App from './App';
import SwarmConsole from './pages/SwarmConsole/index.tsx';
import BlueprintPage from './pages/BlueprintPage';
import CodeBrowserPage from './pages/CodeBrowserPage';
import TopNavBar from './components/swarm/TopNavBar';
import { ProjectProvider } from './contexts/ProjectContext';
import type { ArchitectureGraphData } from './components/swarm/ArchitectureFlowGraph';

type Page = 'chat' | 'swarm' | 'blueprint' | 'code';

/** 代码页面传递的上下文数据 */
export interface CodePageContext {
  /** 从聊天传递的架构图数据 */
  architectureData?: ArchitectureGraphData;
  /** 来源蓝图 ID */
  blueprintId?: string;
  /** 聊天会话 ID（用于迷你聊天保持上下文） */
  chatSessionId?: string;
}

/**
 * 根组件 - 处理顶层导航和页面路由
 */
export default function Root() {
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  // 蜂群页面的初始蓝图 ID
  const [swarmBlueprintId, setSwarmBlueprintId] = useState<string | null>(null);
  // 代码页面上下文
  const [codePageContext, setCodePageContext] = useState<CodePageContext | null>(null);

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

  // 跳转到代码页（可选传递上下文数据）
  const navigateToCodePage = useCallback((context?: CodePageContext) => {
    if (context) {
      setCodePageContext(context);
    }
    setCurrentPage('code');
  }, []);

  // 从代码页返回聊天页
  const navigateToChatPage = useCallback(() => {
    setCurrentPage('chat');
  }, []);

  // 渲染当前页面内容
  const renderPage = () => {
    switch (currentPage) {
      case 'chat':
        return (
          <App
            onNavigateToBlueprint={navigateToBlueprintPage}
            onNavigateToSwarm={navigateToSwarmPage}
            onNavigateToCode={navigateToCodePage}
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
      case 'code':
        return (
          <CodeBrowserPage
            context={codePageContext}
            onNavigateToChat={navigateToChatPage}
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
