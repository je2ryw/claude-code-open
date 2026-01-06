/**
 * WorkerPanel 组件使用示例
 *
 * 这个文件展示了如何使用 WorkerPanel 组件显示蜂群系统的状态
 */

import React, { useState, useEffect } from 'react';
import { WorkerPanel, QueenAgent, WorkerAgent } from './index';

/**
 * 示例 1: 基础静态数据
 */
export function StaticExample() {
  const queen: QueenAgent = {
    status: 'coordinating',
    decision: '分配任务给 Worker-1 处理订单更新功能，Worker-2 处理用户认证'
  };

  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: 'coding',
      taskId: 'task-001',
      taskName: '更新订单状态',
      progress: 45,
      tddPhase: 'write_code',
      retryCount: 1,
      maxRetries: 3,
      duration: 155 // 2分35秒
    },
    {
      id: 'Worker-2',
      status: 'testing',
      taskId: 'task-002',
      taskName: '用户认证功能',
      progress: 80,
      tddPhase: 'run_test_green',
      retryCount: 0,
      maxRetries: 3,
      duration: 320 // 5分20秒
    },
    {
      id: 'Worker-3',
      status: 'idle',
      taskName: undefined,
      progress: 0,
      tddPhase: 'write_test',
      retryCount: 0,
      maxRetries: 3
    }
  ];

  return <WorkerPanel queen={queen} workers={workers} />;
}

/**
 * 示例 2: 模拟动态更新（定时器）
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
      tddPhase: 'write_test',
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

    // 模拟 Worker 状态变化
    const workerTimer = setTimeout(() => {
      setWorkers([
        {
          id: 'Worker-1',
          status: 'test_writing',
          taskId: 'task-001',
          taskName: '实现用户注册功能',
          progress: 20,
          tddPhase: 'write_test',
          retryCount: 0,
          maxRetries: 3,
          duration: 30
        }
      ]);
    }, 3000);

    // 模拟进度更新
    const progressTimer = setInterval(() => {
      setWorkers(prev =>
        prev.map(worker => ({
          ...worker,
          progress: Math.min(100, worker.progress + 5),
          duration: (worker.duration || 0) + 5
        }))
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
 * 示例 3: WebSocket 实时更新
 */
export function WebSocketExample() {
  const [queen, setQueen] = useState<QueenAgent>({ status: 'idle' });
  const [workers, setWorkers] = useState<WorkerAgent[]>([]);

  useEffect(() => {
    // 连接 WebSocket
    const ws = new WebSocket('ws://localhost:3000/swarm');

    ws.onopen = () => {
      console.log('WebSocket 连接已建立');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // 处理不同类型的消息
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

    // 清理连接
    return () => {
      ws.close();
    };
  }, []);

  return <WorkerPanel queen={queen} workers={workers} />;
}

/**
 * 示例 4: 完整的 TDD 流程演示
 */
export function TDDFlowExample() {
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);

  const phases: Array<{
    phase: WorkerAgent['tddPhase'];
    status: WorkerAgent['status'];
    progress: number;
  }> = [
    { phase: 'write_test', status: 'test_writing', progress: 20 },
    { phase: 'run_test_red', status: 'testing', progress: 35 },
    { phase: 'write_code', status: 'coding', progress: 60 },
    { phase: 'run_test_green', status: 'testing', progress: 80 },
    { phase: 'refactor', status: 'coding', progress: 95 },
    { phase: 'done', status: 'idle', progress: 100 }
  ];

  const queen: QueenAgent = {
    status: currentPhaseIndex < phases.length - 1 ? 'coordinating' : 'reviewing',
    decision: currentPhaseIndex < phases.length - 1
      ? '监控 Worker-1 执行 TDD 流程'
      : '审查完成的代码'
  };

  const currentPhase = phases[currentPhaseIndex];
  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: currentPhase.status,
      taskId: 'task-tdd-demo',
      taskName: 'TDD 流程演示',
      progress: currentPhase.progress,
      tddPhase: currentPhase.phase,
      retryCount: 0,
      maxRetries: 3,
      duration: currentPhaseIndex * 30
    }
  ];

  useEffect(() => {
    if (currentPhaseIndex < phases.length - 1) {
      const timer = setTimeout(() => {
        setCurrentPhaseIndex(prev => prev + 1);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [currentPhaseIndex]);

  return (
    <div>
      <WorkerPanel queen={queen} workers={workers} />
      <div style={{ padding: '16px', color: '#fff' }}>
        <p>当前阶段: {currentPhaseIndex + 1} / {phases.length}</p>
        <button
          onClick={() => setCurrentPhaseIndex(0)}
          style={{ padding: '8px 16px', marginTop: '8px' }}
        >
          重新开始演示
        </button>
      </div>
    </div>
  );
}

/**
 * 示例 5: 多个 Workers 并行工作
 */
export function MultiWorkerExample() {
  const queen: QueenAgent = {
    status: 'coordinating',
    decision: '协调 3 个 Worker 并行开发不同模块'
  };

  const workers: WorkerAgent[] = [
    {
      id: 'Worker-1',
      status: 'coding',
      taskId: 'task-001',
      taskName: '用户模块',
      progress: 65,
      tddPhase: 'write_code',
      retryCount: 0,
      maxRetries: 3,
      duration: 240
    },
    {
      id: 'Worker-2',
      status: 'testing',
      taskId: 'task-002',
      taskName: '订单模块',
      progress: 85,
      tddPhase: 'run_test_green',
      retryCount: 1,
      maxRetries: 3,
      duration: 180
    },
    {
      id: 'Worker-3',
      status: 'test_writing',
      taskId: 'task-003',
      taskName: '支付模块',
      progress: 30,
      tddPhase: 'write_test',
      retryCount: 2,
      maxRetries: 3,
      duration: 420
    },
    {
      id: 'Worker-4',
      status: 'waiting',
      taskId: 'task-004',
      taskName: '等待依赖完成',
      progress: 0,
      tddPhase: 'write_test',
      retryCount: 0,
      maxRetries: 3,
      duration: 60
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
    tdd: { component: <TDDFlowExample />, label: 'TDD 流程' },
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
        <h3 style={{ color: '#fff', marginBottom: '16px' }}>示例选择</h3>
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
