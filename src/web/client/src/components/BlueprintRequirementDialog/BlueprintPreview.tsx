/**
 * 蓝图预览组件
 *
 * 在汇总阶段显示用户输入的所有信息
 */

import React from 'react';
import styles from './BlueprintRequirementDialog.module.css';
import type { DialogState, BusinessProcess, SystemModule, NFR } from './index';

interface BlueprintPreviewProps {
  dialogState: DialogState;
}

export function BlueprintPreview({ dialogState }: BlueprintPreviewProps) {
  const {
    projectName,
    projectDescription,
    targetUsers,
    problemsToSolve,
    businessProcesses,
    modules,
    nfrs,
  } = dialogState;

  return (
    <div className={styles.previewContainer}>
      {/* 项目基本信息 */}
      <div className={styles.previewSection}>
        <h4 className={styles.previewSectionTitle}>项目名称</h4>
        <p className={styles.previewSectionContent}>{projectName || '未命名'}</p>
      </div>

      <div className={styles.previewSection}>
        <h4 className={styles.previewSectionTitle}>项目描述</h4>
        <p className={styles.previewSectionContent}>{projectDescription || '暂无描述'}</p>
      </div>

      {/* 目标用户 */}
      {targetUsers && targetUsers.length > 0 && (
        <div className={styles.previewSection}>
          <h4 className={styles.previewSectionTitle}>目标用户</h4>
          <ul className={styles.previewList}>
            {targetUsers.map((user, i) => (
              <li key={i} className={styles.previewListItem}>
                {user}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 要解决的问题 */}
      {problemsToSolve && problemsToSolve.length > 0 && (
        <div className={styles.previewSection}>
          <h4 className={styles.previewSectionTitle}>要解决的问题</h4>
          <ul className={styles.previewList}>
            {problemsToSolve.map((problem, i) => (
              <li key={i} className={styles.previewListItem}>
                {problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 业务流程 */}
      {businessProcesses && businessProcesses.length > 0 && (
        <div className={styles.previewSection}>
          <h4 className={styles.previewSectionTitle}>
            业务流程
            <span className={styles.previewCount}>({businessProcesses.length})</span>
          </h4>
          <div className={styles.previewCards}>
            {businessProcesses.map((process, index) => (
              <ProcessCard key={process.id || `process-${index}`} process={process} />
            ))}
          </div>
        </div>
      )}

      {/* 系统模块 */}
      {modules && modules.length > 0 && (
        <div className={styles.previewSection}>
          <h4 className={styles.previewSectionTitle}>
            系统模块
            <span className={styles.previewCount}>({modules.length})</span>
          </h4>
          <div className={styles.previewCards}>
            {modules.map((module, index) => (
              <ModuleCard key={module.id || `module-${index}`} module={module} />
            ))}
          </div>
        </div>
      )}

      {/* 非功能性要求 */}
      {nfrs && nfrs.length > 0 && (
        <div className={styles.previewSection}>
          <h4 className={styles.previewSectionTitle}>
            非功能性要求
            <span className={styles.previewCount}>({nfrs.length})</span>
          </h4>
          <div className={styles.previewNfrs}>
            {nfrs.map((nfr, index) => (
              <NFRCard key={nfr.id || `nfr-${index}`} nfr={nfr} />
            ))}
          </div>
        </div>
      )}

      {/* 操作提示 */}
      <div className={styles.previewActions}>
        <p>输入 <strong>"确认"</strong> 创建蓝图，或 <strong>"修改 [内容]"</strong> 进行调整</p>
      </div>
    </div>
  );
}

/**
 * 业务流程卡片
 */
function ProcessCard({ process }: { process: BusinessProcess }) {
  const typeLabels: Record<string, string> = {
    core: '核心流程',
    support: '支撑流程',
    management: '管理流程',
  };

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewCardHeader}>
        <span className={styles.previewCardName}>{process.name || '未命名流程'}</span>
        <span className={styles.previewCardType}>{typeLabels[process.type] || process.type || '未知'}</span>
      </div>
      {process.description && (
        <p className={styles.previewCardDesc}>{process.description}</p>
      )}
      {process.steps && process.steps.length > 0 && (
        <div className={styles.previewCardSteps}>
          <span className={styles.previewCardStepsLabel}>步骤：</span>
          <span className={styles.previewCardStepsValue}>
            {process.steps.join(' → ')}
          </span>
        </div>
      )}
      {process.actors && process.actors.length > 0 && (
        <div className={styles.previewCardActors}>
          <span className={styles.previewCardActorsLabel}>参与者：</span>
          <span className={styles.previewCardActorsValue}>
            {process.actors.join('、')}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 系统模块卡片
 */
function ModuleCard({ module }: { module: SystemModule }) {
  const typeLabels: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    service: '服务',
    data: '数据',
    integration: '集成',
  };

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewCardHeader}>
        <span className={styles.previewCardName}>{module.name || '未命名模块'}</span>
        <span className={styles.previewCardType}>{typeLabels[module.type] || module.type || '未知'}</span>
      </div>
      {module.responsibilities && module.responsibilities.length > 0 && (
        <div className={styles.previewCardResponsibilities}>
          <span className={styles.previewCardLabel}>职责：</span>
          <span>{module.responsibilities.join('、')}</span>
        </div>
      )}
      {module.dependencies && module.dependencies.length > 0 && (
        <div className={styles.previewCardDependencies}>
          <span className={styles.previewCardLabel}>依赖：</span>
          <span>{module.dependencies.join('、')}</span>
        </div>
      )}
    </div>
  );
}

/**
 * 非功能性要求卡片
 */
function NFRCard({ nfr }: { nfr: NFR }) {
  const categoryLabels: Record<string, string> = {
    performance: '性能',
    security: '安全',
    scalability: '可扩展性',
    usability: '易用性',
    reliability: '可靠性',
    other: '其他',
  };

  const priorityColors: Record<string, string> = {
    high: '#f44336',
    medium: '#ff9800',
    low: '#4caf50',
  };

  return (
    <div className={styles.previewNfrItem}>
      <span
        className={styles.previewNfrPriority}
        style={{ backgroundColor: priorityColors[nfr.priority] || '#999' }}
      >
        {nfr.priority?.toUpperCase() || 'N/A'}
      </span>
      <span className={styles.previewNfrName}>{nfr.name || '未命名'}</span>
      <span className={styles.previewNfrCategory}>
        ({categoryLabels[nfr.category] || nfr.category || '其他'})
      </span>
      <span className={styles.previewNfrDesc}>{nfr.description}</span>
      {nfr.metrics && (
        <span className={styles.previewNfrMetrics}>指标：{nfr.metrics}</span>
      )}
    </div>
  );
}
