/**
 * 后台任务计数一致性测试
 * 验证 Status bar 和 Tasks dialog 显示的任务数量一致
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createBackgroundTask,
  completeTask,
  getTaskSummaries,
  getTaskStats,
  deleteTask,
  getAllTasks,
} from '../../src/core/backgroundTasks.js';

describe('Background Task Count Consistency', () => {
  // 清理所有任务
  beforeEach(() => {
    const tasks = getAllTasks();
    tasks.forEach((task) => deleteTask(task.id));
  });

  afterEach(() => {
    const tasks = getAllTasks();
    tasks.forEach((task) => deleteTask(task.id));
  });

  it('should show zero tasks initially', () => {
    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    expect(summaries.length).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.running).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it('should increment task count when creating a task', () => {
    const task1 = createBackgroundTask('Test task 1');

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    expect(summaries.length).toBe(1);
    expect(stats.total).toBe(1);
    expect(stats.running).toBe(1);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);

    // 清理
    if (task1) deleteTask(task1.id);
  });

  it('should maintain consistent count across multiple tasks', () => {
    const task1 = createBackgroundTask('Test task 1');
    const task2 = createBackgroundTask('Test task 2');
    const task3 = createBackgroundTask('Test task 3');

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    // Status bar 和 tasks dialog 应显示相同的总数
    expect(summaries.length).toBe(stats.total);
    expect(stats.total).toBe(3);
    expect(stats.running).toBe(3);

    // 清理
    if (task1) deleteTask(task1.id);
    if (task2) deleteTask(task2.id);
    if (task3) deleteTask(task3.id);
  });

  it('should update running count when task completes', () => {
    const task1 = createBackgroundTask('Test task 1');
    const task2 = createBackgroundTask('Test task 2');

    // 完成第一个任务
    if (task1) {
      completeTask(task1.id, true);
    }

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    // 总数保持不变，但运行中的任务减少
    expect(summaries.length).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.running).toBe(1);
    expect(stats.completed).toBe(1);

    // 验证 summaries 中的状态与 stats 一致
    const runningSummaries = summaries.filter((t) => t.status === 'running');
    const completedSummaries = summaries.filter((t) => t.status === 'completed');

    expect(runningSummaries.length).toBe(stats.running);
    expect(completedSummaries.length).toBe(stats.completed);

    // 清理
    if (task1) deleteTask(task1.id);
    if (task2) deleteTask(task2.id);
  });

  it('should update failed count when task fails', () => {
    const task1 = createBackgroundTask('Test task 1');
    const task2 = createBackgroundTask('Test task 2');

    // 标记第一个任务失败
    if (task1) {
      completeTask(task1.id, false, 'Test error');
    }

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    expect(summaries.length).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.running).toBe(1);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(1);

    // 验证 summaries 中的状态与 stats 一致
    const failedSummaries = summaries.filter((t) => t.status === 'failed');
    expect(failedSummaries.length).toBe(stats.failed);

    // 清理
    if (task1) deleteTask(task1.id);
    if (task2) deleteTask(task2.id);
  });

  it('should decrement count when deleting a task', () => {
    const task1 = createBackgroundTask('Test task 1');
    const task2 = createBackgroundTask('Test task 2');
    const task3 = createBackgroundTask('Test task 3');

    // 删除一个任务
    if (task2) {
      deleteTask(task2.id);
    }

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    expect(summaries.length).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.running).toBe(2);

    // 清理
    if (task1) deleteTask(task1.id);
    if (task3) deleteTask(task3.id);
  });

  it('should handle concurrent task operations', () => {
    const tasks = [
      createBackgroundTask('Task 1'),
      createBackgroundTask('Task 2'),
      createBackgroundTask('Task 3'),
      createBackgroundTask('Task 4'),
      createBackgroundTask('Task 5'),
    ];

    // 完成一些任务
    if (tasks[0]) completeTask(tasks[0].id, true);
    if (tasks[1]) completeTask(tasks[1].id, false, 'Error');
    if (tasks[2]) completeTask(tasks[2].id, true);

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    // 验证总数一致
    expect(summaries.length).toBe(stats.total);
    expect(stats.total).toBe(5);

    // 验证各状态计数一致
    expect(stats.running).toBe(2);
    expect(stats.completed).toBe(2);
    expect(stats.failed).toBe(1);

    const runningSummaries = summaries.filter((t) => t.status === 'running');
    const completedSummaries = summaries.filter((t) => t.status === 'completed');
    const failedSummaries = summaries.filter((t) => t.status === 'failed');

    expect(runningSummaries.length).toBe(stats.running);
    expect(completedSummaries.length).toBe(stats.completed);
    expect(failedSummaries.length).toBe(stats.failed);

    // 清理
    tasks.forEach((task) => {
      if (task) deleteTask(task.id);
    });
  });

  it('should maintain consistency when environment variable disables tasks', () => {
    // 注意：这个测试假设环境变量未设置
    // 如果环境变量禁用了后台任务，createBackgroundTask 将返回 null

    const task = createBackgroundTask('Test task');

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    if (task === null) {
      // 后台任务被禁用
      expect(summaries.length).toBe(0);
      expect(stats.total).toBe(0);
    } else {
      // 后台任务启用
      expect(summaries.length).toBe(1);
      expect(stats.total).toBe(1);
      deleteTask(task.id);
    }
  });

  it('should provide consistent data structure between summaries and stats', () => {
    const task1 = createBackgroundTask('Running task');
    const task2 = createBackgroundTask('Completed task');
    const task3 = createBackgroundTask('Failed task');

    if (task2) completeTask(task2.id, true);
    if (task3) completeTask(task3.id, false, 'Test error');

    const summaries = getTaskSummaries();
    const stats = getTaskStats();

    // 验证数据结构一致性
    expect(summaries).toHaveLength(stats.total);

    // 验证每个状态的计数
    const statusCounts = {
      running: summaries.filter((t) => t.status === 'running').length,
      completed: summaries.filter((t) => t.status === 'completed').length,
      failed: summaries.filter((t) => t.status === 'failed').length,
    };

    expect(statusCounts.running).toBe(stats.running);
    expect(statusCounts.completed).toBe(stats.completed);
    expect(statusCounts.failed).toBe(stats.failed);
    expect(statusCounts.running + statusCounts.completed + statusCounts.failed).toBe(
      stats.total
    );

    // 清理
    if (task1) deleteTask(task1.id);
    if (task2) deleteTask(task2.id);
    if (task3) deleteTask(task3.id);
  });
});
