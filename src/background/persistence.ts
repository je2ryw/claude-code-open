/**
 * 后台任务持久化模块
 * 负责保存和恢复后台任务状态
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PersistedTaskState {
  id: string;
  type: 'bash' | 'agent';
  command?: string;
  status: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  outputSize: number;
  cwd: string;
  metadata?: Record<string, any>;
}

export interface PersistedAgentState {
  id: string;
  agentType: string;
  status: string;
  startTime: number;
  endTime?: number;
  currentStep?: number;
  totalSteps?: number;
  workingDirectory: string;
  history: Array<{
    timestamp: number;
    type: string;
    message: string;
    data?: any;
  }>;
  intermediateResults: any[];
  metadata?: Record<string, any>;
}

export interface PersistenceOptions {
  /**
   * 存储目录
   * @default ~/.claude/background-tasks/
   */
  storageDir?: string;

  /**
   * 是否自动恢复任务
   * @default true
   */
  autoRestore?: boolean;

  /**
   * 任务过期时间（毫秒）
   * @default 86400000 (24 hours)
   */
  expiryTime?: number;

  /**
   * 是否压缩存储
   * @default false
   */
  compress?: boolean;
}

/**
 * 持久化管理器
 * 负责保存和恢复后台任务状态到磁盘
 */
export class PersistenceManager {
  private readonly storageDir: string;
  private readonly options: Required<PersistenceOptions>;

  // 默认配置
  static readonly DEFAULT_STORAGE_DIR = path.join(os.homedir(), '.claude', 'background-tasks');
  static readonly DEFAULT_EXPIRY_TIME = 86400000; // 24 hours

  constructor(options: PersistenceOptions = {}) {
    this.storageDir = options.storageDir || PersistenceManager.DEFAULT_STORAGE_DIR;

    this.options = {
      storageDir: this.storageDir,
      autoRestore: options.autoRestore !== false,
      expiryTime: options.expiryTime || PersistenceManager.DEFAULT_EXPIRY_TIME,
      compress: options.compress || false,
    };

    // 确保存储目录存在
    this.ensureStorageDir();
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDir(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create storage directory:', err);
    }
  }

  /**
   * 保存任务状态
   */
  saveTask(task: PersistedTaskState): boolean {
    try {
      const filePath = this.getTaskFilePath(task.id, task.type);
      const data = JSON.stringify(task, null, 2);

      fs.writeFileSync(filePath, data, 'utf8');

      return true;
    } catch (err) {
      console.error(`Failed to save task ${task.id}:`, err);
      return false;
    }
  }

  /**
   * 加载任务状态
   */
  loadTask(id: string, type: 'bash' | 'agent'): PersistedTaskState | null {
    try {
      const filePath = this.getTaskFilePath(id, type);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      const task = JSON.parse(data) as PersistedTaskState;

      // 检查是否过期
      if (this.isExpired(task)) {
        this.deleteTask(id, type);
        return null;
      }

      return task;
    } catch (err) {
      console.error(`Failed to load task ${id}:`, err);
      return null;
    }
  }

  /**
   * 删除任务状态
   */
  deleteTask(id: string, type: 'bash' | 'agent'): boolean {
    try {
      const filePath = this.getTaskFilePath(id, type);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return true;
    } catch (err) {
      console.error(`Failed to delete task ${id}:`, err);
      return false;
    }
  }

  /**
   * 保存 Agent 状态
   */
  saveAgent(agent: PersistedAgentState): boolean {
    try {
      const agentDir = path.join(os.homedir(), '.claude', 'agents');

      // 确保目录存在
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }

      const filePath = path.join(agentDir, `${agent.id}.json`);
      const data = JSON.stringify(agent, null, 2);

      fs.writeFileSync(filePath, data, 'utf8');

      return true;
    } catch (err) {
      console.error(`Failed to save agent ${agent.id}:`, err);
      return false;
    }
  }

  /**
   * 加载 Agent 状态
   */
  loadAgent(id: string): PersistedAgentState | null {
    try {
      const agentDir = path.join(os.homedir(), '.claude', 'agents');
      const filePath = path.join(agentDir, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      const agent = JSON.parse(data) as PersistedAgentState;

      return agent;
    } catch (err) {
      console.error(`Failed to load agent ${id}:`, err);
      return null;
    }
  }

  /**
   * 列出所有保存的任务
   */
  listTasks(type?: 'bash' | 'agent'): PersistedTaskState[] {
    try {
      const tasks: PersistedTaskState[] = [];

      const files = fs.readdirSync(this.storageDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        // 根据文件名判断类型
        const fileType = file.startsWith('bash_') ? 'bash' : file.startsWith('agent_') ? 'agent' : null;

        if (type && fileType !== type) continue;
        if (!fileType) continue;

        const id = file.replace(/^(bash_|agent_)/, '').replace(/\.json$/, '');
        const task = this.loadTask(id, fileType);

        if (task) {
          tasks.push(task);
        }
      }

      return tasks;
    } catch (err) {
      console.error('Failed to list tasks:', err);
      return [];
    }
  }

  /**
   * 列出所有保存的 Agent
   */
  listAgents(): PersistedAgentState[] {
    try {
      const agents: PersistedAgentState[] = [];
      const agentDir = path.join(os.homedir(), '.claude', 'agents');

      if (!fs.existsSync(agentDir)) {
        return agents;
      }

      const files = fs.readdirSync(agentDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const id = file.replace(/\.json$/, '');
        const agent = this.loadAgent(id);

        if (agent) {
          agents.push(agent);
        }
      }

      return agents;
    } catch (err) {
      console.error('Failed to list agents:', err);
      return [];
    }
  }

  /**
   * 清理过期的任务
   */
  cleanupExpired(): number {
    try {
      let cleaned = 0;
      const tasks = this.listTasks();

      for (const task of tasks) {
        if (this.isExpired(task)) {
          if (this.deleteTask(task.id, task.type)) {
            cleaned++;
          }
        }
      }

      return cleaned;
    } catch (err) {
      console.error('Failed to cleanup expired tasks:', err);
      return 0;
    }
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompleted(): number {
    try {
      let cleaned = 0;
      const tasks = this.listTasks();

      for (const task of tasks) {
        if (task.status === 'completed' || task.status === 'failed') {
          if (this.deleteTask(task.id, task.type)) {
            cleaned++;
          }
        }
      }

      return cleaned;
    } catch (err) {
      console.error('Failed to cleanup completed tasks:', err);
      return 0;
    }
  }

  /**
   * 清除所有任务
   */
  clearAll(): number {
    try {
      let cleared = 0;
      const files = fs.readdirSync(this.storageDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.storageDir, file));
          cleared++;
        }
      }

      return cleared;
    } catch (err) {
      console.error('Failed to clear all tasks:', err);
      return 0;
    }
  }

  /**
   * 获取任务文件路径
   */
  private getTaskFilePath(id: string, type: 'bash' | 'agent'): string {
    return path.join(this.storageDir, `${type}_${id}.json`);
  }

  /**
   * 检查任务是否过期
   */
  private isExpired(task: PersistedTaskState): boolean {
    const now = Date.now();
    const age = now - task.startTime;

    return age > this.options.expiryTime;
  }

  /**
   * 导出任务到文件
   */
  exportTasks(filePath: string): boolean {
    try {
      const tasks = this.listTasks();
      const agents = this.listAgents();

      const data = {
        tasks,
        agents,
        exportTime: Date.now(),
        version: '1.0',
      };

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

      return true;
    } catch (err) {
      console.error('Failed to export tasks:', err);
      return false;
    }
  }

  /**
   * 从文件导入任务
   */
  importTasks(filePath: string): { tasks: number; agents: number } {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      let tasksImported = 0;
      let agentsImported = 0;

      // 导入任务
      if (data.tasks && Array.isArray(data.tasks)) {
        for (const task of data.tasks) {
          if (this.saveTask(task)) {
            tasksImported++;
          }
        }
      }

      // 导入 Agent
      if (data.agents && Array.isArray(data.agents)) {
        for (const agent of data.agents) {
          if (this.saveAgent(agent)) {
            agentsImported++;
          }
        }
      }

      return { tasks: tasksImported, agents: agentsImported };
    } catch (err) {
      console.error('Failed to import tasks:', err);
      return { tasks: 0, agents: 0 };
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const tasks = this.listTasks();
    const agents = this.listAgents();

    const tasksByStatus = tasks.reduce(
      (acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const agentsByStatus = agents.reduce(
      (acc, agent) => {
        acc[agent.status] = (acc[agent.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      tasks: {
        total: tasks.length,
        byStatus: tasksByStatus,
      },
      agents: {
        total: agents.length,
        byStatus: agentsByStatus,
      },
      storageDir: this.storageDir,
      expiryTime: this.options.expiryTime,
    };
  }
}
