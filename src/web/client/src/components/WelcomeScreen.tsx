import { useState, useEffect } from 'react';
import { CodebaseAnalysisDialog } from './CodebaseAnalysisDialog';
import { useProject } from '../contexts/ProjectContext';

interface WelcomeScreenProps {
  onBlueprintCreated?: (blueprintId: string) => void;
}

export function WelcomeScreen({ onBlueprintCreated }: WelcomeScreenProps) {
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [analysisTriggered, setAnalysisTriggered] = useState(false);
  const { state: projectState } = useProject();

  // 判断项目状态
  const hasProject = !!projectState.currentProject;
  const isEmptyProject = hasProject && projectState.currentProject?.isEmpty === true;
  const hasBlueprint = projectState.currentProject?.hasBlueprint === true;

  // 老仓库：有代码但无蓝图
  const isLegacyRepo = hasProject && !isEmptyProject && !hasBlueprint;

  // 自动触发老仓库分析对话框
  useEffect(() => {
    // 只触发一次，避免重复弹出
    if (isLegacyRepo && !analysisTriggered && !showAnalysisDialog) {
      setAnalysisTriggered(true);
      // 延迟一点触发，让用户先看到界面
      const timer = setTimeout(() => {
        setShowAnalysisDialog(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLegacyRepo, analysisTriggered, showAnalysisDialog]);

  // 当项目变化时重置触发状态
  useEffect(() => {
    setAnalysisTriggered(false);
  }, [projectState.currentProject?.id]);

  const handleAnalysisComplete = (blueprintId: string) => {
    setShowAnalysisDialog(false);
    onBlueprintCreated?.(blueprintId);
  };

  const handleAnalysisClose = () => {
    setShowAnalysisDialog(false);
  };

  return (
    <div className="welcome-screen">
      <img src="/logo.png" alt="Claude Code" className="welcome-logo" />
      <h2 className="welcome-title">Claude Code WebUI</h2>

      {/* 老仓库分析对话框 */}
      {showAnalysisDialog && (
        <CodebaseAnalysisDialog
          visible={showAnalysisDialog}
          onComplete={handleAnalysisComplete}
          onClose={handleAnalysisClose}
        />
      )}

      {isEmptyProject && !hasBlueprint ? (
        // 空项目且无蓝图：引导用户在聊天框输入需求
        <>
          <p className="welcome-subtitle">
            欢迎使用 Claude Code！描述你想要的项目，我帮你规划和实现。
          </p>

          {/* 快捷提示 */}
          <div className="welcome-hints">
            <div className="welcome-hint-item">
              <span className="hint-icon">💡</span>
              <span className="hint-text">在下方输入框描述你的项目需求，我会通过对话帮你梳理并生成项目蓝图</span>
            </div>
            <div className="welcome-hint-item">
              <span className="hint-icon">📋</span>
              <span className="hint-text">例如：「帮我做一个 Todo App，用 React + Express + SQLite」</span>
            </div>
            <div className="welcome-hint-item">
              <span className="hint-icon">🚀</span>
              <span className="hint-text">蓝图确认后，LeadAgent 会自动探索代码、规划任务、执行开发</span>
            </div>
          </div>
        </>
      ) : (
        // 非空项目或已有蓝图：显示 AI 对话提示
        <>
          <p className="welcome-subtitle">
            欢迎使用 Claude Code 的 Web 界面。在下方输入框中输入你的问题或指令，我会帮助你完成编程任务。
          </p>

          {/* 快捷提示 */}
          <div className="welcome-hints">
            <div className="welcome-hint-item">
              <span className="hint-icon">💡</span>
              <span className="hint-text">你可以问我关于代码的问题，或让我帮你修改、优化代码</span>
            </div>
            <div className="welcome-hint-item">
              <span className="hint-icon">🔍</span>
              <span className="hint-text">输入 "/" 可以查看可用的命令列表</span>
            </div>
            <div className="welcome-hint-item">
              <span className="hint-icon">📎</span>
              <span className="hint-text">点击左下角的附件按钮可以上传文件</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
