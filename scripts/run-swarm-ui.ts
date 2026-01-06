#!/usr/bin/env npx tsx
/**
 * 用蜂群架构开发蜂群控制台 UI
 *
 * Dogfooding: 用蜂群开发蜂群
 */

import {
  blueprintManager,
  agentCoordinator,
  taskTreeManager,
  type Blueprint,
  type SystemModule,
} from '../src/blueprint/index.js';

// ============================================================================
// 蓝图定义：蜂群控制台 UI
// ============================================================================

const SWARM_UI_BLUEPRINT = {
  name: '蜂群控制台 UI',
  description: `
开发一个独立的蜂群控制台页面，用于可视化和管理蜂群架构的执行过程。

核心功能：
1. 顶部导航栏（聊天/蜂群/蓝图切换）
2. 蓝图列表（左侧栏）
3. 任务树可视化（中央，展开/折叠）
4. Worker 卡片面板（右侧栏）
5. 时间线日志（底部）
6. 实时 WebSocket 状态同步
7. 丰富的动画效果

技术栈：
- React 18 + TypeScript
- CSS Modules
- WebSocket
`,
  // 业务流程
  businessProcesses: [
    {
      name: '蜂群执行监控',
      description: '用户通过蜂群控制台监控和管理蜂群执行过程',
      type: 'to-be' as const,
      steps: [
        {
          order: 1,
          name: '查看蓝图列表',
          description: '用户查看所有蓝图及其执行状态',
          actor: 'user',
          userAction: '在左侧栏浏览蓝图列表',
          outcomes: ['显示蓝图名称、状态、进度'],
        },
        {
          order: 2,
          name: '选择蓝图',
          description: '用户选择一个蓝图查看详情',
          actor: 'user',
          userAction: '点击蓝图项',
          outcomes: ['中央显示任务树', '右侧显示 Worker 状态'],
        },
        {
          order: 3,
          name: '监控任务执行',
          description: '实时查看任务执行进度',
          actor: 'user',
          userAction: '展开/折叠任务树节点',
          outcomes: ['显示任务状态', '显示进度条', '显示动画'],
        },
        {
          order: 4,
          name: '查看 Worker 状态',
          description: '查看每个 Worker 的工作状态',
          actor: 'user',
          userAction: '查看右侧 Worker 卡片',
          outcomes: ['显示 TDD 阶段', '显示进度', '呼吸灯效果'],
        },
        {
          order: 5,
          name: '控制执行',
          description: '暂停、恢复或终止执行',
          actor: 'user',
          userAction: '点击控制按钮',
          outcomes: ['执行暂停/恢复/终止'],
        },
      ],
      actors: ['user'],
      inputs: ['蓝图 ID'],
      outputs: ['执行状态', '任务进度', 'Worker 状态'],
    },
  ],
  // 模块（不设依赖，让它们可以并行）
  modules: [
    {
      name: '页面框架和路由',
      type: 'frontend' as const,
      description: '实现蜂群控制台的页面框架和路由配置',
      responsibilities: [
        '创建 /swarm 路由',
        '实现三栏布局（左/中/右）',
        '实现底部可折叠面板',
        '顶部导航栏组件',
      ],
      dependencies: [],
      interfaces: [],
      techStack: ['React', 'React Router'],
    },
    {
      name: '蓝图列表组件',
      type: 'frontend' as const,
      description: '左侧蓝图列表，显示所有蓝图及其状态',
      responsibilities: [
        '蓝图项卡片展示',
        '状态图标（执行中/已完成/待执行）',
        '进度条显示',
        '搜索过滤功能',
        '新建蓝图按钮',
      ],
      dependencies: [],  // 无依赖，可并行
      interfaces: [],
      techStack: ['React'],
    },
    {
      name: '任务树组件',
      type: 'frontend' as const,
      description: '中央任务树可视化，树形缩进列表风格',
      responsibilities: [
        '树形结构渲染',
        '展开/折叠交互',
        '任务状态图标和颜色',
        '进度条显示',
        '任务选中高亮',
        '连线流动动画',
      ],
      dependencies: [],  // 无依赖，可并行
      interfaces: [],
      techStack: ['React'],
    },
    {
      name: 'Worker 面板组件',
      type: 'frontend' as const,
      description: '右侧 Worker 状态面板，包含 Queen 状态和 Worker 卡片',
      responsibilities: [
        'Queen 状态显示',
        'Worker 卡片组件',
        'TDD 阶段进度',
        '进度条平滑动画',
        '呼吸灯效果',
        'Worker 控制按钮（暂停/终止）',
      ],
      dependencies: [],  // 无依赖，可并行
      interfaces: [],
      techStack: ['React'],
    },
    {
      name: '时间线组件',
      type: 'frontend' as const,
      description: '底部时间线日志，显示执行事件流',
      responsibilities: [
        '事件列表展示',
        '事件类型图标和颜色',
        '淡入动画',
        '过滤和搜索',
        '可折叠面板',
      ],
      dependencies: [],  // 无依赖，可并行
      interfaces: [],
      techStack: ['React'],
    },
    {
      name: '动画效果库',
      type: 'frontend' as const,
      description: '通用动画组件和 CSS 动画',
      responsibilities: [
        '进度条平滑增长动画',
        '节点脉动动画',
        '淡入动画',
        '打勾完成动画',
        '呼吸灯效果',
        '连线流动效果',
      ],
      dependencies: [],
      interfaces: [],
      techStack: ['CSS', 'Framer Motion'],
    },
    {
      name: 'WebSocket 状态同步',
      type: 'frontend' as const,
      description: '实时 WebSocket 连接，同步蜂群状态',
      responsibilities: [
        'WebSocket 连接管理',
        '状态订阅/取消订阅',
        '增量状态更新',
        '断线重连',
        '状态缓存',
      ],
      dependencies: [],
      interfaces: [],
      techStack: ['WebSocket', 'React Hooks'],
    },
    {
      name: '后端 WebSocket 事件',
      type: 'backend' as const,
      description: '服务端蜂群状态 WebSocket 事件推送',
      responsibilities: [
        '蜂群状态广播',
        '任务更新事件',
        'Worker 状态事件',
        '时间线事件推送',
        '控制命令处理（暂停/恢复/终止）',
      ],
      dependencies: [],
      interfaces: [],
      techStack: ['WebSocket', 'Express'],
    },
  ],
};

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('🐝 蜂群控制台 UI 开发 - Dogfooding 实验\n');
  console.log('='.repeat(60));

  try {
    // Step 1: 创建蓝图
    console.log('\n📋 Step 1: 创建蓝图...');

    let blueprint: Blueprint;
    const existingBlueprint = blueprintManager.getCurrentBlueprint();

    if (existingBlueprint && existingBlueprint.name === SWARM_UI_BLUEPRINT.name) {
      console.log(`   使用现有蓝图: ${existingBlueprint.id}`);
      blueprint = existingBlueprint;
    } else {
      blueprint = blueprintManager.createBlueprint(
        SWARM_UI_BLUEPRINT.name,
        SWARM_UI_BLUEPRINT.description
      );
      console.log(`   创建新蓝图: ${blueprint.id}`);

      // 添加业务流程
      console.log('\n📊 添加业务流程...');
      for (const process of SWARM_UI_BLUEPRINT.businessProcesses) {
        blueprintManager.addBusinessProcess(blueprint.id, process);
        console.log(`   ✅ ${process.name}`);
      }

      // 添加模块
      console.log('\n📦 添加系统模块...');
      for (const module of SWARM_UI_BLUEPRINT.modules) {
        blueprintManager.addModule(blueprint.id, module);
        console.log(`   ✅ ${module.name}`);
      }
    }

    // Step 2: 提交审核并批准
    console.log('\n📝 Step 2: 提交审核...');
    if (blueprint.status === 'draft') {
      blueprintManager.submitForReview(blueprint.id);
      console.log('   蓝图已提交审核');
    }

    console.log('\n✍️  Step 3: 批准蓝图...');
    if (blueprint.status === 'review') {
      blueprintManager.approveBlueprint(blueprint.id, 'dogfooding-experiment');
      console.log('   蓝图已批准');
    }

    // Step 4: 初始化蜂王
    console.log('\n👑 Step 4: 初始化蜂王...');
    const queen = await agentCoordinator.initializeQueen(blueprint.id);
    console.log(`   蜂王 ID: ${queen.id}`);
    console.log(`   任务树 ID: ${queen.taskTreeId}`);

    // 显示任务树
    const taskTree = taskTreeManager.getTaskTree(queen.taskTreeId);
    if (taskTree) {
      console.log(`\n📊 任务树统计:`);
      console.log(`   总任务数: ${taskTree.stats.totalTasks}`);
      console.log(`   待执行: ${taskTree.stats.pendingTasks}`);
      console.log(`   最大深度: ${taskTree.stats.maxDepth}`);
    }

    // Step 5: 监听事件
    console.log('\n🔔 设置事件监听...');

    agentCoordinator.on('worker:created', (worker) => {
      console.log(`\n🐝 Worker 创建: ${worker.id}`);
    });

    agentCoordinator.on('task:assigned', ({ workerId, taskId }) => {
      console.log(`📋 任务分配: ${taskId} -> Worker ${workerId.slice(0, 8)}...`);
    });

    agentCoordinator.on('worker:task-completed', ({ workerId, taskId }) => {
      console.log(`✅ 任务完成: ${taskId}`);
    });

    agentCoordinator.on('worker:task-failed', ({ workerId, taskId, error }) => {
      console.log(`❌ 任务失败: ${taskId} - ${error}`);
    });

    agentCoordinator.on('timeline:event', (event) => {
      const time = event.timestamp.toLocaleTimeString();
      console.log(`[${time}] ${event.type}: ${event.description}`);
    });

    agentCoordinator.on('execution:completed', () => {
      console.log('\n🎉 所有任务执行完成！');
      process.exit(0);
    });

    // Step 6: 启动蜂群
    console.log('\n🚀 Step 5: 启动蜂群主循环...');
    console.log('   按 Ctrl+C 停止\n');
    console.log('='.repeat(60));

    agentCoordinator.startMainLoop();

    // 保持进程运行
    process.on('SIGINT', () => {
      console.log('\n\n⏹️  停止蜂群...');
      agentCoordinator.stopMainLoop();

      // 显示最终状态
      const dashboard = agentCoordinator.getDashboardData();
      if (dashboard?.taskTree) {
        console.log('\n📊 最终统计:');
        console.log(`   完成: ${dashboard.taskTree.stats.passedTasks}/${dashboard.taskTree.stats.totalTasks}`);
        console.log(`   进度: ${dashboard.taskTree.stats.progressPercentage.toFixed(1)}%`);
      }

      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ 错误:', error);
    process.exit(1);
  }
}

// 运行
main();
