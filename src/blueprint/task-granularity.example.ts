/**
 * 任务粒度控制器使用示例
 *
 * 展示如何使用 TaskGranularityController 来：
 * 1. 评估任务复杂度
 * 2. 检查是否需要拆分/合并
 * 3. 自动调整任务树粒度
 */

import {
  TaskGranularityController,
  createTaskGranularityController,
  DEFAULT_GRANULARITY_CONFIG,
} from './task-granularity.js';
import type { TaskNode, TaskTree, SystemModule } from './types.js';

// ============================================================================
// 示例 1：评估单个任务的复杂度
// ============================================================================

export function example1_assessComplexity() {
  console.log('示例 1：评估任务复杂度\n');

  // 创建控制器
  const controller = createTaskGranularityController();

  // 模拟一个任务
  const task: TaskNode = {
    id: 'task-1',
    name: '实现用户认证模块',
    description: '实现完整的用户认证功能，包括登录、注册、密码重置、JWT 令牌管理和会话管理',
    priority: 80,
    depth: 2,
    status: 'pending',
    children: [],
    dependencies: ['task-database', 'task-email'],
    acceptanceTests: [
      {
        id: 'test-1',
        taskId: 'task-1',
        name: '登录测试',
        description: '验证登录功能',
        testCode: 'test code',
        testFilePath: '/tests/auth.test.ts',
        testCommand: 'npm test',
        criteria: [],
        generatedBy: 'queen',
        generatedAt: new Date(),
        runHistory: [],
      },
    ],
    codeArtifacts: [],
    createdAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    checkpoints: [],
  };

  // 评估复杂度
  const score = controller.assessComplexity(task);

  // 打印报告
  console.log(controller.printComplexityReport(score));
  console.log('\n' + '='.repeat(60) + '\n');
}

// ============================================================================
// 示例 2：检查任务是否需要拆分
// ============================================================================

export function example2_checkSplit() {
  console.log('示例 2：检查任务是否需要拆分\n');

  const controller = createTaskGranularityController();

  // 创建一个复杂的任务（应该被拆分）
  const complexTask: TaskNode = {
    id: 'task-complex',
    name: '实现完整的电商系统',
    description: '实现包括商品管理、购物车、订单处理、支付集成、库存管理、用户评价、推荐系统等所有功能',
    priority: 100,
    depth: 1,
    status: 'pending',
    children: [],
    dependencies: ['db', 'payment', 'shipping', 'email', 'sms'],
    acceptanceTests: Array(10).fill(null).map((_, i) => ({
      id: `test-${i}`,
      taskId: 'task-complex',
      name: `测试 ${i}`,
      description: `验证功能 ${i}`,
      testCode: 'test code',
      testFilePath: `/tests/test-${i}.ts`,
      testCommand: 'npm test',
      criteria: [],
      generatedBy: 'queen' as const,
      generatedAt: new Date(),
      runHistory: [],
    })),
    codeArtifacts: [],
    createdAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    checkpoints: [],
  };

  const module: SystemModule = {
    id: 'module-ecommerce',
    name: '电商系统',
    description: '完整的电商平台',
    type: 'backend',
    responsibilities: [
      '商品管理',
      '订单处理',
      '支付集成',
      '库存管理',
      '用户管理',
    ],
    dependencies: ['database', 'payment-gateway', 'shipping-service'],
    interfaces: [
      { id: 'api-1', name: 'REST API', type: 'api', direction: 'both', description: 'REST API' },
      { id: 'api-2', name: 'GraphQL', type: 'api', direction: 'both', description: 'GraphQL API' },
      { id: 'ws-1', name: 'WebSocket', type: 'message', direction: 'both', description: 'WebSocket' },
    ],
    techStack: ['Node.js', 'Express', 'PostgreSQL', 'Redis'],
  };

  // 检查是否需要拆分
  const result = controller.shouldSplit(complexTask, module);

  console.log('任务:', complexTask.name);
  console.log('复杂度:', result.complexity.toFixed(1));
  console.log('需要拆分:', result.shouldSplit ? '是' : '否');
  console.log('原因:', result.reason);
  console.log('\n' + '='.repeat(60) + '\n');
}

// ============================================================================
// 示例 3：检查任务是否需要合并
// ============================================================================

export function example3_checkMerge() {
  console.log('示例 3：检查任务是否需要合并\n');

  const controller = createTaskGranularityController();

  // 创建几个简单的任务（应该被合并）
  const simpleTasks: TaskNode[] = [
    {
      id: 'task-1',
      parentId: 'parent',
      name: '添加按钮样式',
      description: '为按钮添加 CSS 样式',
      priority: 50,
      depth: 3,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    },
    {
      id: 'task-2',
      parentId: 'parent',
      name: '添加输入框样式',
      description: '为输入框添加 CSS 样式',
      priority: 50,
      depth: 3,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    },
    {
      id: 'task-3',
      parentId: 'parent',
      name: '添加表单样式',
      description: '为表单添加 CSS 样式',
      priority: 50,
      depth: 3,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    },
  ];

  // 检查是否需要合并
  const result = controller.shouldMerge(simpleTasks);

  console.log('任务列表:');
  simpleTasks.forEach(t => console.log(`  - ${t.name}`));
  console.log('需要合并:', result.shouldMerge ? '是' : '否');
  console.log('原因:', result.reason);
  if (result.shouldMerge) {
    console.log('建议合并的任务 ID:', result.taskIds);
  }
  console.log('\n' + '='.repeat(60) + '\n');
}

// ============================================================================
// 示例 4：自动调整整个任务树
// ============================================================================

export function example4_autoAdjust() {
  console.log('示例 4：自动调整任务树粒度\n');

  const controller = createTaskGranularityController();

  // 创建一个模拟的任务树
  const mockTree: TaskTree = {
    id: 'tree-1',
    blueprintId: 'blueprint-1',
    root: {
      id: 'root',
      name: '项目根节点',
      description: '整个项目',
      priority: 100,
      depth: 0,
      status: 'pending',
      children: [
        // 一个过于复杂的任务
        {
          id: 'complex-1',
          parentId: 'root',
          name: '实现所有功能',
          description: '实现系统的所有功能模块包括前端后端数据库部署运维监控等',
          priority: 90,
          depth: 1,
          status: 'pending',
          children: [],
          dependencies: ['dep1', 'dep2', 'dep3', 'dep4', 'dep5'],
          acceptanceTests: Array(8).fill(null).map((_, i) => ({
            id: `test-${i}`,
            taskId: 'complex-1',
            name: `Test ${i}`,
            description: `Test ${i}`,
            testCode: '',
            testFilePath: '',
            testCommand: '',
            criteria: [],
            generatedBy: 'queen' as const,
            generatedAt: new Date(),
            runHistory: [],
          })),
          codeArtifacts: [],
          createdAt: new Date(),
          retryCount: 0,
          maxRetries: 3,
          checkpoints: [],
        },
        // 几个过于简单的任务
        {
          id: 'simple-1',
          parentId: 'root',
          name: '添加注释',
          description: '添加代码注释',
          priority: 10,
          depth: 1,
          status: 'pending',
          children: [],
          dependencies: [],
          acceptanceTests: [],
          codeArtifacts: [],
          createdAt: new Date(),
          retryCount: 0,
          maxRetries: 3,
          checkpoints: [],
        },
        {
          id: 'simple-2',
          parentId: 'root',
          name: '修复拼写错误',
          description: '修复代码中的拼写错误',
          priority: 10,
          depth: 1,
          status: 'pending',
          children: [],
          dependencies: [],
          acceptanceTests: [],
          codeArtifacts: [],
          createdAt: new Date(),
          retryCount: 0,
          maxRetries: 3,
          checkpoints: [],
        },
        {
          id: 'simple-3',
          parentId: 'root',
          name: '更新 README',
          description: '更新项目文档',
          priority: 10,
          depth: 1,
          status: 'pending',
          children: [],
          dependencies: [],
          acceptanceTests: [],
          codeArtifacts: [],
          createdAt: new Date(),
          retryCount: 0,
          maxRetries: 3,
          checkpoints: [],
        },
      ],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    },
    stats: {
      totalTasks: 5,
      pendingTasks: 5,
      runningTasks: 0,
      passedTasks: 0,
      failedTasks: 0,
      blockedTasks: 0,
      totalTests: 8,
      passedTests: 0,
      failedTests: 0,
      maxDepth: 1,
      avgDepth: 0.8,
      progressPercentage: 0,
    },
    status: 'pending',
    createdAt: new Date(),
    globalCheckpoints: [],
  };

  // 自动调整
  const result = controller.autoAdjust(mockTree);

  // 打印报告
  console.log(controller.printAdjustmentReport(result));
}

// ============================================================================
// 示例 5：自定义配置
// ============================================================================

export function example5_customConfig() {
  console.log('示例 5：使用自定义配置\n');

  // 创建一个更严格的控制器（要求更细的粒度）
  const strictController = createTaskGranularityController({
    minTaskComplexity: 20,    // 提高最小复杂度
    maxTaskComplexity: 60,    // 降低最大复杂度
    idealTaskDuration: 20,    // 理想时间缩短到 20 分钟
    maxTaskDuration: 60,      // 最大时间缩短到 1 小时
    maxDepth: 6,              // 允许更深的树
    maxChildrenPerNode: 5,    // 减少单节点子任务数
  });

  console.log('严格模式配置:');
  console.log(JSON.stringify(strictController.getConfig(), null, 2));
  console.log('\n默认配置:');
  console.log(JSON.stringify(DEFAULT_GRANULARITY_CONFIG, null, 2));
  console.log('\n' + '='.repeat(60) + '\n');
}

// ============================================================================
// 运行所有示例
// ============================================================================

export function runAllExamples() {
  example1_assessComplexity();
  example2_checkSplit();
  example3_checkMerge();
  example4_autoAdjust();
  example5_customConfig();
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}
