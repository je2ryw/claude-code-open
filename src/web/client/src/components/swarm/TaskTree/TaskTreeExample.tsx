import React, { useState } from 'react';
import { TaskTree, TaskNode } from './index';

/**
 * 任务树使用示例
 */
export const TaskTreeExample: React.FC = () => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();

  // 示例数据
  const sampleTaskTree: TaskNode = {
    id: 'root',
    name: '电商系统开发',
    status: 'coding',
    progress: 45,
    children: [
      {
        id: 'user-module',
        name: '用户模块',
        status: 'passed',
        children: [
          {
            id: 'user-register',
            name: '用户注册接口',
            status: 'passed',
            children: [],
          },
          {
            id: 'user-login',
            name: '用户登录接口',
            status: 'passed',
            children: [],
          },
          {
            id: 'user-info',
            name: '用户信息查询',
            status: 'passed',
            children: [],
          },
        ],
      },
      {
        id: 'order-module',
        name: '订单模块',
        status: 'coding',
        children: [
          {
            id: 'order-create',
            name: '创建订单',
            status: 'passed',
            children: [],
          },
          {
            id: 'order-query',
            name: '查询订单',
            status: 'passed',
            children: [],
          },
          {
            id: 'order-update',
            name: '更新订单状态',
            status: 'coding',
            progress: 65,
            children: [],
          },
          {
            id: 'order-cancel',
            name: '取消订单',
            status: 'pending',
            children: [],
          },
          {
            id: 'order-stats',
            name: '订单统计',
            status: 'pending',
            children: [],
          },
        ],
      },
      {
        id: 'payment-module',
        name: '支付模块',
        status: 'pending',
        children: [
          {
            id: 'payment-alipay',
            name: '支付宝支付',
            status: 'pending',
            children: [],
          },
          {
            id: 'payment-wechat',
            name: '微信支付',
            status: 'pending',
            children: [],
          },
          {
            id: 'payment-refund',
            name: '退款接口',
            status: 'pending',
            children: [],
          },
          {
            id: 'payment-callback',
            name: '支付回调处理',
            status: 'pending',
            children: [],
          },
        ],
      },
      {
        id: 'test-module',
        name: '测试中的模块',
        status: 'testing',
        children: [
          {
            id: 'test-unit',
            name: '单元测试',
            status: 'testing',
            progress: 80,
            children: [],
          },
          {
            id: 'test-integration',
            name: '集成测试',
            status: 'test_writing',
            progress: 30,
            children: [],
          },
        ],
      },
      {
        id: 'failed-module',
        name: '失败的模块示例',
        status: 'test_failed',
        children: [
          {
            id: 'failed-task',
            name: '测试失败的任务',
            status: 'test_failed',
            children: [],
          },
        ],
      },
    ],
  };

  const handleTaskSelect = (taskId: string) => {
    console.log('选中任务:', taskId);
    setSelectedTaskId(taskId);
  };

  return (
    <div style={{ padding: '20px', background: '#0a0a0a', minHeight: '100vh' }}>
      <h1 style={{ color: '#fff', marginBottom: '20px' }}>任务树示例</h1>
      <TaskTree
        root={sampleTaskTree}
        selectedTaskId={selectedTaskId}
        onTaskSelect={handleTaskSelect}
      />
      {selectedTaskId && (
        <div style={{ color: '#9ca3af', marginTop: '20px', fontSize: '14px' }}>
          当前选中任务 ID: {selectedTaskId}
        </div>
      )}
    </div>
  );
};
