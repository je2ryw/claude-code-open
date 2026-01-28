/**
 * WorkerPanel 组件使用示例 - v2.0
 *
 * v2.0 变化：
 * - Worker 状态简化为 idle/working/waiting/error
 * - 移除 tddPhase，Worker 自主决策
 * - 新增 currentAction 和 decisions 展示
 * - 新增 Git 分支信息
 */

import React, { useState, useEffect } from 'react';
import { WorkerPanel, QueenAgent, WorkerAgent } from './index';

/**
 * 示例 1: 基础静态数据 - v2.0
 */
export function StaticExample() {
  const queen: QueenAgent = {
    status: 'coordinating',
    decision: '分配任务给 Worker-1 处理订单更新功能，Worker-2 处理用户认证'
  };

  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: 'working',
      taskId: 'task-001',
      taskName: '更新订单状态',
      progress: 45,
      retryCount: 1,
      maxRetries: 3,
      duration: 155,
      // v2.0 新增字段
      branchName: 'worker-1/task-001',
      branchStatus: 'active',
      modelUsed: 'sonnet',
      currentAction: {
        type: 'write',
        description: '写入文件 src/orders/update.ts',
        startedAt: new Date().toISOString(),
      },
      decisions: [
        { type: 'strategy', description: '采用增量更新策略', timestamp: new Date().toISOString() }
      ]
    },
    {
      id: 'Worker-2',
      status: 'working',
      taskId: 'task-002',
      taskName: '用户认证功能',
      progress: 80,
      retryCount: 0,
      maxRetries: 3,
      duration: 320,
      branchName: 'worker-2/task-002',
      branchStatus: 'active',
      modelUsed: 'opus',
      currentAction: {
        type: 'run_test',
        description: '运行认证模块测试',
        startedAt: new Date().toISOString(),
      },
      decisions: [
        { type: 'add_test', description: '添加边界条件测试', timestamp: new Date().toISOString() }
      ]
    },
    {
      id: 'Worker-3',
      status: 'idle',
      taskName: undefined,
      progress: 0,
      retryCount: 0,
      maxRetries: 3
    }
  ];

  return <WorkerPanel queen={queen} workers={workers} />;
}

/**
 * 示例 2: 模拟动态更新 - v2.0
 */
export function DynamicExample() {
  const [queen, setQueen] = useState<QueenAgent>({
    status: 'planning',
    decision: '正在分析项目需求...'
  });

  const [workers, setWorkers] = useState<WorkerAgent[]>([
    {
      id: 'Worker-1',
      status: 'waiting',
      progress: 0,
      retryCount: 0,
      maxRetries: 3
    }
  ]);

  useEffect(() => {
    // 模拟 Queen 状态变化
    const queenTimer = setTimeout(() => {
      setQueen({
        status: 'coordinating',
        decision: '开始分配任务给 Worker-1'
      });
    }, 2000);

    // 模拟 Worker 开始工作
    const workerTimer = setTimeout(() => {
      setWorkers([
        {
          id: 'Worker-1',
          status: 'working',
          taskId: 'task-001',
          taskName: '实现用户注册功能',
          progress: 20,
          retryCount: 0,
          maxRetries: 3,
          duration: 30,
          branchName: 'worker-1/task-001',
          branchStatus: 'active',
          modelUsed: 'sonnet',
          currentAction: {
            type: 'read',
            description: '读取现有代码结构',
            startedAt: new Date().toISOString(),
          }
        }
      ]);
    }, 3000);

    // 模拟进度和动作更新
    const progressTimer = setInterval(() => {
      setWorkers(prev =>
        prev.map(worker => {
          const newProgress = Math.min(100, worker.progress + 5);
          const actionTypes = ['read', 'write', 'edit', 'think', 'run_test'] as const;
          const randomAction = actionTypes[Math.floor(Math.random() * actionTypes.length)];

          return {
            ...worker,
            progress: newProgress,
            duration: (worker.duration || 0) + 5,
            currentAction: worker.status === 'working' ? {
              type: randomAction,
              description: `正在执行 ${randomAction} 操作...`,
              startedAt: new Date().toISOString(),
            } : undefined,
          };
        })
      );
    }, 1000);

    return () => {
      clearTimeout(queenTimer);
      clearTimeout(workerTimer);
      clearInterval(progressTimer);
    };
  }, []);

  return <WorkerPanel queen={queen} workers={workers} />;
}

/**
 * 示例 3: WebSocket 实时更新 - v2.0
 */
export function WebSocketExample() {
  const [queen, setQueen] = useState<QueenAgent>({ status: 'idle' });
  const [workers, setWorkers] = useState<WorkerAgent[]>([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/swarm');

    ws.onopen = () => {
      console.log('WebSocket 连接已建立');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'queen_update':
          setQueen(data.queen);
          break;

        case 'worker_update':
          setWorkers(prev =>
            prev.map(w => w.id === data.worker.id ? data.worker : w)
          );
          break;

        case 'workers_update':
          setWorkers(data.workers);
          break;

        case 'full_state':
          setQueen(data.queen);
          setWorkers(data.workers);
          break;

        default:
          console.warn('未知消息类型:', data.type);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket 错误:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket 连接已关闭');
    };

    return () => {
      ws.close();
    };
  }, []);

  return <WorkerPanel queen={queen} workers={workers} />;
}

/**
 * 示例 4: 自主决策流程演示 - v2.0
 * (替代旧的 TDD 流程演示)
 */
export function AutonomousDecisionExample() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // v2.0: Worker 自主决策的步骤
  const steps: Array<{
    status: WorkerAgent['status'];
    actionType: 'read' | 'write' | 'edit' | 'run_test' | 'think' | 'git';
    actionDesc: string;
    decision?: { type: string; description: string };
    progress: number;
  }> = [
    { status: 'working', actionType: 'read', actionDesc: '分析任务需求', progress: 10 },
    { status: 'working', actionType: 'think', actionDesc: '规划实现策略', decision: { type: 'strategy', description: '采用 TDD 方式开发' }, progress: 20 },
    { status: 'working', actionType: 'write', actionDesc: '编写测试用例', decision: { type: 'add_test', description: '添加单元测试' }, progress: 35 },
    { status: 'working', actionType: 'run_test', actionDesc: '运行测试（预期失败）', progress: 45 },
    { status: 'working', actionType: 'write', actionDesc: '编写功能代码', progress: 65 },
    { status: 'working', actionType: 'run_test', actionDesc: '运行测试（预期通过）', progress: 80 },
    { status: 'working', actionType: 'git', actionDesc: '提交代码到分支', progress: 95 },
    { status: 'idle', actionType: 'think', actionDesc: '任务完成', progress: 100 }
  ];

  const currentStep = steps[currentStepIndex];
  const decisions = steps
    .slice(0, currentStepIndex + 1)
    .filter(s => s.decision)
    .map(s => ({ ...s.decision!, timestamp: new Date().toISOString() }));

  const queen: QueenAgent = {
    status: currentStepIndex < steps.length - 1 ? 'coordinating' : 'reviewing',
    decision: currentStepIndex < steps.length - 1
      ? '监控 Worker-1 自主执行任务'
      : '审查完成的代码'
  };

  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: currentStep.status,
      taskId: 'task-demo',
      taskName: '自主决策演示',
      progress: currentStep.progress,
      retryCount: 0,
      maxRetries: 3,
      duration: currentStepIndex * 30,
      branchName: 'worker-1/task-demo',
      branchStatus: currentStepIndex < steps.length - 1 ? 'active' : 'merged',
      modelUsed: 'sonnet',
      currentAction: currentStep.status === 'working' ? {
        type: currentStep.actionType,
        description: currentStep.actionDesc,
        startedAt: new Date().toISOString(),
      } : undefined,
      decisions: decisions as any,
    }
  ];

  useEffect(() => {
    if (currentStepIndex < steps.length - 1) {
      const timer = setTimeout(() => {
        setCurrentStepIndex(prev => prev + 1);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentStepIndex, steps.length]);

  return (
    <div>
      <WorkerPanel queen={queen} workers={workers} />
      <div style={{ padding: '16px', color: '#fff' }}>
        <p>当前步骤: {currentStepIndex + 1} / {steps.length}</p>
        <p>当前操作: {currentStep.actionDesc}</p>
        <button
          onClick={() => setCurrentStepIndex(0)}
          style={{ padding: '8px 16px', marginTop: '8px' }}
        >
          重新开始演示
        </button>
      </div>
    </div>
  );
}

/**
 * 示例 5: 多个 Workers 并行工作 - v2.0
 */
export function MultiWorkerExample() {
  const queen: QueenAgent = {
    status: 'coordinating',
    decision: '协调 4 个 Worker 并行开发不同模块'
  };

  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: 'working',
      taskId: 'task-001',
      taskName: '用户模块',
      progress: 65,
      retryCount: 0,
      maxRetries: 3,
      duration: 240,
      branchName: 'worker-1/user-module',
      branchStatus: 'active',
      modelUsed: 'opus',
      currentAction: {
        type: 'write',
        description: '实现用户认证逻辑',
        startedAt: new Date().toISOString(),
      },
      decisions: [
        { type: 'strategy', description: 'JWT 认证方案', timestamp: new Date().toISOString() }
      ]
    },
    {
      id: 'Worker-2',
      status: 'working',
      taskId: 'task-002',
      taskName: '订单模块',
      progress: 85,
      retryCount: 1,
      maxRetries: 3,
      duration: 180,
      branchName: 'worker-2/order-module',
      branchStatus: 'active',
      modelUsed: 'sonnet',
      currentAction: {
        type: 'run_test',
        description: '运行订单流程测试',
        startedAt: new Date().toISOString(),
      },
      decisions: [
        { type: 'retry', description: '测试失败，重试中', timestamp: new Date().toISOString() }
      ]
    },
    {
      id: 'Worker-3',
      status: 'working',
      taskId: 'task-003',
      taskName: '支付模块',
      progress: 30,
      retryCount: 2,
      maxRetries: 3,
      duration: 420,
      branchName: 'worker-3/payment-module',
      branchStatus: 'conflict',
      modelUsed: 'haiku',
      currentAction: {
        type: 'git',
        description: '解决代码合并冲突',
        startedAt: new Date().toISOString(),
      },
      decisions: [
        { type: 'install_dep', description: '安装 stripe SDK', timestamp: new Date().toISOString() }
      ]
    },
    {
      id: 'Worker-4',
      status: 'error',
      taskId: 'task-004',
      taskName: '通知模块',
      progress: 45,
      retryCount: 3,
      maxRetries: 3,
      duration: 60,
      branchName: 'worker-4/notification-module',
      branchStatus: 'active',
      modelUsed: 'sonnet',
    }
  ];

  return <WorkerPanel queen={queen} workers={workers} />;
}

/**
 * 默认导出：所有示例的集合
 */
export default function WorkerPanelExamples() {
  const [activeExample, setActiveExample] = useState<string>('static');

  const examples = {
    static: { component: <StaticExample />, label: '静态数据' },
    dynamic: { component: <DynamicExample />, label: '动态更新' },
    websocket: { component: <WebSocketExample />, label: 'WebSocket' },
    autonomous: { component: <AutonomousDecisionExample />, label: '自主决策' },
    multi: { component: <MultiWorkerExample />, label: '多 Worker' }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#1e1e1e' }}>
      {/* 侧边栏：示例选择器 */}
      <div style={{
        width: '200px',
        padding: '16px',
        borderRight: '1px solid #3d3d3d',
        backgroundColor: '#2d2d2d'
      }}>
        <h3 style={{ color: '#fff', marginBottom: '16px' }}>示例选择 (v2.0)</h3>
        {Object.entries(examples).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setActiveExample(key)}
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: '8px',
              backgroundColor: activeExample === key ? '#4caf50' : '#3d3d3d',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 主内容区：显示选中的示例 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {examples[activeExample as keyof typeof examples].component}
      </div>
    </div>
  );
}
