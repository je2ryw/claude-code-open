#!/usr/bin/env npx tsx
/**
 * 简化版蜂群执行脚本
 * 只创建 8 个模块级任务，不细分职责
 */

import { v4 as uuidv4 } from 'uuid';
import {
  blueprintManager,
  agentCoordinator,
  taskTreeManager,
  type Blueprint,
  type TaskNode,
  type TaskTree,
} from '../src/blueprint/index.js';

// ============================================================================
// 简化蓝图：只有 3 个核心模块
// ============================================================================

const SIMPLE_BLUEPRINT = {
  name: '蜂群控制台 UI (简化版)',
  description: '蜂群控制台的核心组件',
  businessProcesses: [
    {
      name: '蜂群监控',
      description: '监控蜂群执行',
      type: 'to-be' as const,
      steps: [
        { order: 1, name: '查看任务', description: '查看任务树', actor: 'user', outcomes: ['任务列表'] },
      ],
      actors: ['user'],
      inputs: ['蓝图'],
      outputs: ['状态'],
    },
  ],
  modules: [
    {
      name: '任务树组件',
      type: 'frontend' as const,
      description: '实现任务树的展开/折叠可视化',
      responsibilities: ['树形结构渲染'], // 只保留 1 个职责
      dependencies: [],
      interfaces: [],
      techStack: ['React'],
    },
    {
      name: 'Worker 卡片',
      type: 'frontend' as const,
      description: '实现 Worker 状态卡片显示',
      responsibilities: ['Worker 状态展示'], // 只保留 1 个职责
      dependencies: [],
      interfaces: [],
      techStack: ['React'],
    },
    {
      name: '动画效果',
      type: 'frontend' as const,
      description: '实现进度条和呼吸灯动画',
      responsibilities: ['CSS 动画'], // 只保留 1 个职责
      dependencies: [],
      interfaces: [],
      techStack: ['CSS'],
    },
  ],
};

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('🐝 蜂群控制台 UI - 简化版实验\n');
  console.log('='.repeat(60));

  try {
    // 清理旧数据
    console.log('\n🧹 清理旧蓝图数据...');

    // Step 1: 创建蓝图
    console.log('\n📋 Step 1: 创建蓝图...');
    const blueprint = blueprintManager.createBlueprint(
      SIMPLE_BLUEPRINT.name,
      SIMPLE_BLUEPRINT.description
    );
    console.log(`   蓝图 ID: ${blueprint.id}`);

    // 添加业务流程
    for (const process of SIMPLE_BLUEPRINT.businessProcesses) {
      blueprintManager.addBusinessProcess(blueprint.id, process);
    }
    console.log('   ✅ 业务流程已添加');

    // 添加模块
    for (const module of SIMPLE_BLUEPRINT.modules) {
      blueprintManager.addModule(blueprint.id, module);
      console.log(`   ✅ ${module.name}`);
    }

    // Step 2: 审核和批准
    console.log('\n📝 Step 2: 提交审核并批准...');
    blueprintManager.submitForReview(blueprint.id);
    blueprintManager.approveBlueprint(blueprint.id, 'experiment');
    console.log('   ✅ 蓝图已批准');

    // Step 3: 初始化蜂王
    console.log('\n👑 Step 3: 初始化蜂王...');
    const queen = await agentCoordinator.initializeQueen(blueprint.id);
    console.log(`   蜂王 ID: ${queen.id}`);

    // 显示任务树
    const taskTree = taskTreeManager.getTaskTree(queen.taskTreeId);
    if (taskTree) {
      console.log(`\n📊 任务树统计:`);
      console.log(`   总任务数: ${taskTree.stats.totalTasks}`);
      console.log(`   待执行: ${taskTree.stats.pendingTasks}`);
      console.log(`   最大深度: ${taskTree.stats.maxDepth}`);

      // 显示任务树结构
      console.log('\n📋 任务树结构:');
      printTaskTree(taskTree.root, 0);
    }

    // Step 4: 设置事件监听
    console.log('\n🔔 设置事件监听...');

    agentCoordinator.on('worker:created', (worker) => {
      console.log(`\n🐝 Worker 创建: ${worker.id.slice(0, 8)}...`);
    });

    agentCoordinator.on('task:assigned', ({ workerId, taskId }) => {
      const tree = taskTreeManager.getTaskTree(queen.taskTreeId);
      const task = tree ? findTaskById(tree.root, taskId) : null;
      console.log(`📋 任务分配: "${task?.name || taskId}" -> Worker ${workerId.slice(0, 8)}...`);
    });

    agentCoordinator.on('worker:task-completed', ({ workerId, taskId }) => {
      console.log(`✅ 任务完成: ${taskId.slice(0, 8)}...`);
    });

    agentCoordinator.on('worker:task-failed', ({ workerId, taskId, error }) => {
      console.log(`❌ 任务失败: ${taskId.slice(0, 8)}... - ${error.slice(0, 50)}...`);
    });

    agentCoordinator.on('execution:completed', () => {
      console.log('\n🎉 所有任务执行完成！');
      showFinalStats();
      process.exit(0);
    });

    // Step 5: 启动蜂群
    console.log('\n🚀 Step 4: 启动蜂群主循环...');
    console.log('   5 个 Worker 并发执行');
    console.log('   按 Ctrl+C 停止\n');
    console.log('='.repeat(60));

    agentCoordinator.startMainLoop();

    // 显示最终统计
    function showFinalStats() {
      const dashboard = agentCoordinator.getDashboardData();
      if (dashboard?.taskTree) {
        console.log('\n📊 最终统计:');
        console.log(`   完成: ${dashboard.taskTree.stats.passedTasks}/${dashboard.taskTree.stats.totalTasks}`);
        console.log(`   失败: ${dashboard.taskTree.stats.failedTasks}`);
        console.log(`   进度: ${dashboard.taskTree.stats.progressPercentage.toFixed(1)}%`);
      }
    }

    // 信号处理
    process.on('SIGINT', () => {
      console.log('\n\n⏹️  停止蜂群...');
      agentCoordinator.stopMainLoop();
      showFinalStats();
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ 错误:', error);
    process.exit(1);
  }
}

// 打印任务树
function printTaskTree(node: TaskNode, indent: number) {
  const prefix = '  '.repeat(indent);
  const icon = node.children.length > 0 ? '📁' : '📄';
  console.log(`${prefix}${icon} ${node.name} [${node.status}]`);
  for (const child of node.children) {
    printTaskTree(child, indent + 1);
  }
}

// 查找任务
function findTaskById(node: TaskNode, id: string): TaskNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findTaskById(child, id);
    if (found) return found;
  }
  return null;
}

main();
