import { useState } from 'react';
import { BlueprintRequirementDialog } from './BlueprintRequirementDialog';

interface WelcomeScreenProps {
  onBlueprintCreated?: (blueprintId: string) => void;
}

export function WelcomeScreen({ onBlueprintCreated }: WelcomeScreenProps) {
  const [showRequirementDialog, setShowRequirementDialog] = useState(false);

  const handleBlueprintComplete = (blueprintId: string) => {
    setShowRequirementDialog(false);
    onBlueprintCreated?.(blueprintId);
  };

  return (
    <div className="welcome-screen">
      <img src="/logo.png" alt="Claude Code" className="welcome-logo" />
      <h2 className="welcome-title">Claude Code WebUI</h2>
      <p className="welcome-subtitle">
        欢迎使用 Claude Code 的 Web 界面。在下方输入框中输入你的问题或指令，我会帮助你完成编程任务。
      </p>

      {/* 快捷操作区域 */}
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
    </div>
  );
}
