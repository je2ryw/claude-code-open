import { useState, useEffect } from 'react';
import { BlueprintRequirementDialog } from './BlueprintRequirementDialog';
import { CodebaseAnalysisDialog } from './CodebaseAnalysisDialog';
import { useProject } from '../contexts/ProjectContext';

interface WelcomeScreenProps {
  onBlueprintCreated?: (blueprintId: string) => void;
}

export function WelcomeScreen({ onBlueprintCreated }: WelcomeScreenProps) {
  const [showRequirementDialog, setShowRequirementDialog] = useState(false);
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

  const handleBlueprintComplete = (blueprintId: string) => {
    setShowRequirementDialog(false);
    onBlueprintCreated?.(blueprintId);
  };

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

      {isEmptyProject ? (
        // 空项目：显示创建蓝图流程
        <>
          <p className="welcome-subtitle">
            欢迎使用 Claude Code！这是一个新项目，让我们从创建项目蓝图开始。
          </p>

          {/* 创建蓝图按钮 */}
          <div className="welcome-actions">
            <button
              className="welcome-action-btn welcome-action-blueprint"
              onClick={() => setShowRequirementDialog(true)}
              title="通过对话收集需求，生成项目蓝图"
            >
              <span className="welcome-action-icon">📋</span>
              <span className="welcome-action-text">创建项目蓝图</span>
              <span className="welcome-action-desc">通过对话收集需求</span>
            </button>
          </div>

          {/* 蓝图需求收集对话框 */}
          {showRequirementDialog && (
            <BlueprintRequirementDialog
              visible={showRequirementDialog}
              onClose={() => setShowRequirementDialog(false)}
              onComplete={handleBlueprintComplete}
            />
          )}
        </>
      ) : (
        // 非空项目：显示 AI 对话提示
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
