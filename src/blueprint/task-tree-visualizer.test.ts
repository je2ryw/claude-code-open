/**
 * 任务树展开/折叠可视化 - 测试
 *
 * 功能需求：
 * 1. 支持展开/折叠树节点
 * 2. 生成适合展示的树形文本表示
 * 3. 显示任务状态的视觉指示
 * 4. 支持通过ID或名称查找节点
 * 5. 计算树的展开状态
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import type { TaskNode } from './types.js';

// ============================================================================
// 展开/折叠可视化核心类型
// ============================================================================

/**
 * 节点展开状态
 */
interface NodeExpandState {
  nodeId: string;
  isExpanded: boolean;
  visibleChildren: number;  // 显示的子节点数
}

/**
 * 树形渲染行
 */
interface TreeLine {
  nodeId: string;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  prefix: string;           // 树形前缀（如 ├──、└──）
  content: string;          // 节点内容显示
  status: string;           // 任务状态
}

/**
 * 任务树可视化器
 */
class TaskTreeVisualizer {
  private expandedNodes: Set<string> = new Set();

  /**
   * 展开指定节点
   */
  expandNode(nodeId: string): void {
    this.expandedNodes.add(nodeId);
  }

  /**
   * 折叠指定节点
   */
  collapseNode(nodeId: string): void {
    this.expandedNodes.delete(nodeId);
  }

  /**
   * 切换节点展开/折叠状态
   */
  toggleNode(nodeId: string): void {
    if (this.expandedNodes.has(nodeId)) {
      this.collapseNode(nodeId);
    } else {
      this.expandNode(nodeId);
    }
  }

  /**
   * 检查节点是否展开
   */
  isNodeExpanded(nodeId: string): boolean {
    return this.expandedNodes.has(nodeId);
  }

  /**
   * 展开所有节点
   */
  expandAll(root: TaskNode): void {
    this.walkTree(root, (node) => {
      this.expandedNodes.add(node.id);
    });
  }

  /**
   * 折叠所有节点（保留根节点）
   */
  collapseAll(root: TaskNode): void {
    this.walkTree(root, node => {
      if (node.id !== root.id) {
        this.expandedNodes.delete(node.id);
      }
    });
  }

  /**
   * 获取节点展开状态
   */
  getNodeExpandState(node: TaskNode): NodeExpandState {
    const visibleChildren = node.children.length > 0
      ? node.children.filter(child =>
          this.isNodeExpanded(node.id) ||
          node.children.length === 0
        ).length
      : 0;

    return {
      nodeId: node.id,
      isExpanded: this.isNodeExpanded(node.id),
      visibleChildren,
    };
  }

  /**
   * 生成树形可视化文本
   */
  renderTree(root: TaskNode, maxDepth?: number): string {
    const lines = this.generateTreeLines(root, maxDepth);
    return lines.map(line => line.prefix + line.content).join('\n');
  }

  /**
   * 生成树形行数据（供进一步处理）
   */
  generateTreeLines(root: TaskNode, maxDepth?: number): TreeLine[] {
    const lines: TreeLine[] = [];
    this.walkVisibleTree(root, 0, maxDepth || Infinity, lines);
    return lines;
  }

  /**
   * 生成详细的树形可视化（包含状态指示）
   */
  renderDetailedTree(root: TaskNode, maxDepth?: number): string {
    const lines = this.generateDetailedTreeLines(root, maxDepth);
    return lines.map(line => this.formatTreeLine(line)).join('\n');
  }

  /**
   * 生成详细的树形行数据
   */
  generateDetailedTreeLines(root: TaskNode, maxDepth?: number): TreeLine[] {
    const lines: TreeLine[] = [];
    this.walkVisibleTree(root, 0, maxDepth || Infinity, lines);
    return lines;
  }

  /**
   * 格式化树形行（添加状态指示符）
   */
  private formatTreeLine(line: TreeLine): string {
    const statusIcon = this.getStatusIcon(line.status);
    const expandIcon = line.hasChildren
      ? (line.isExpanded ? '[−]' : '[+]')
      : '[ ]';

    return `${line.prefix}${expandIcon} ${statusIcon} ${line.content}`;
  }

  /**
   * 根据状态获取图标
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'pending': '◯',      // 空心圆 - 待处理
      'blocked': '◯',      // 空心圆 - 被阻塞
      'test_writing': '◷',  // 部分填充 - 编写测试
      'coding': '◷',        // 部分填充 - 编码中
      'testing': '◐',       // 部分填充 - 测试中
      'test_failed': '✕',   // 叉号 - 测试失败
      'passed': '✓',        // 勾号 - 已通过
      'approved': '✓✓',     // 双勾号 - 已批准
      'rejected': '✕✕',     // 双叉号 - 被拒绝
      'cancelled': '−',      // 减号 - 已取消
    };

    return icons[status] || '?';
  }

  /**
   * 遍历可见的树（仅包含展开的节点）
   */
  private walkVisibleTree(
    node: TaskNode,
    currentDepth: number,
    maxDepth: number,
    lines: TreeLine[]
  ): void {
    if (currentDepth > maxDepth) return;

    const isRoot = currentDepth === 0;
    const hasChildren = node.children.length > 0;
    const isExpanded = isRoot || this.isNodeExpanded(node.id);

    // 生成前缀
    const prefix = this.generatePrefix(currentDepth);

    // 添加当前节点
    lines.push({
      nodeId: node.id,
      depth: currentDepth,
      isExpanded,
      hasChildren,
      prefix,
      content: node.name,
      status: node.status,
    });

    // 如果展开，递归添加子节点
    if (isExpanded && hasChildren) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLast = i === node.children.length - 1;
        const childLines: TreeLine[] = [];
        this.walkVisibleTree(child, currentDepth + 1, maxDepth, childLines);

        // 调整前缀以显示树形结构
        for (let j = 0; j < childLines.length; j++) {
          const line = childLines[j];
          if (j === 0) {
            line.prefix = (isLast ? '└── ' : '├── ');
          } else {
            const basePrefix = isLast ? '    ' : '│   ';
            line.prefix = basePrefix + line.prefix;
          }
          lines.push(line);
        }
      }
    }
  }

  /**
   * 生成树形前缀（深度缩进）
   */
  private generatePrefix(depth: number): string {
    return '';  // 在walkVisibleTree中会正确生成
  }

  /**
   * 遍历整棵树
   */
  private walkTree(node: TaskNode, callback: (node: TaskNode) => void): void {
    callback(node);
    for (const child of node.children) {
      this.walkTree(child, callback);
    }
  }

  /**
   * 在树中查找节点
   */
  findNodeById(root: TaskNode, nodeId: string): TaskNode | null {
    if (root.id === nodeId) return root;

    for (const child of root.children) {
      const found = this.findNodeById(child, nodeId);
      if (found) return found;
    }

    return null;
  }

  /**
   * 在树中查找所有匹配名称的节点
   */
  findNodesByName(root: TaskNode, name: string): TaskNode[] {
    const results: TaskNode[] = [];
    this.walkTree(root, node => {
      if (node.name.includes(name)) {
        results.push(node);
      }
    });
    return results;
  }

  /**
   * 获取节点的路径（从根到该节点）
   */
  getNodePath(root: TaskNode, nodeId: string): TaskNode[] {
    const path: TaskNode[] = [];
    this.findPath(root, nodeId, path);
    return path;
  }

  /**
   * 递归查找路径
   */
  private findPath(node: TaskNode, targetId: string, path: TaskNode[]): boolean {
    path.push(node);

    if (node.id === targetId) {
      return true;
    }

    for (const child of node.children) {
      if (this.findPath(child, targetId, path)) {
        return true;
      }
    }

    path.pop();
    return false;
  }

  /**
   * 获取展开状态统计
   */
  getExpandStats(root: TaskNode): {
    totalNodes: number;
    expandedNodes: number;
    collapsedNodes: number;
    nodesWithChildren: number;
  } {
    let totalNodes = 0;
    let nodesWithChildren = 0;

    this.walkTree(root, node => {
      totalNodes++;
      if (node.children.length > 0) {
        nodesWithChildren++;
      }
    });

    const expandedNodes = this.expandedNodes.size;
    const collapsedNodes = nodesWithChildren - expandedNodes;

    return {
      totalNodes,
      expandedNodes,
      collapsedNodes,
      nodesWithChildren,
    };
  }

  /**
   * 清除所有展开状态（重置）
   */
  reset(): void {
    this.expandedNodes.clear();
  }
}

// ============================================================================
// 单元测试
// ============================================================================

describe('TaskTreeVisualizer', () => {
  let visualizer: TaskTreeVisualizer;
  let rootTask: TaskNode;
  let childTask1: TaskNode;
  let childTask2: TaskNode;
  let grandchildTask: TaskNode;

  beforeEach(() => {
    visualizer = new TaskTreeVisualizer();

    // 构建测试树
    //     root
    //     ├── child1
    //     │   └── grandchild
    //     └── child2

    grandchildTask = {
      id: uuidv4(),
      name: '孙任务',
      description: '孙任务描述',
      priority: 10,
      depth: 2,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    };

    childTask1 = {
      id: uuidv4(),
      name: '子任务1',
      description: '子任务1描述',
      priority: 20,
      depth: 1,
      status: 'coding',
      children: [grandchildTask],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
      parentId: 'root',
    };

    grandchildTask.parentId = childTask1.id;

    childTask2 = {
      id: uuidv4(),
      name: '子任务2',
      description: '子任务2描述',
      priority: 15,
      depth: 1,
      status: 'passed',
      children: [],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
      parentId: 'root',
    };

    rootTask = {
      id: 'root',
      name: '根任务',
      description: '根任务描述',
      priority: 100,
      depth: 0,
      status: 'pending',
      children: [childTask1, childTask2],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    };
  });

  describe('展开/折叠操作', () => {
    it('should expand a node', () => {
      visualizer.expandNode(childTask1.id);
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(true);
    });

    it('should collapse a node', () => {
      visualizer.expandNode(childTask1.id);
      visualizer.collapseNode(childTask1.id);
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(false);
    });

    it('should toggle node expand state', () => {
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(false);
      visualizer.toggleNode(childTask1.id);
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(true);
      visualizer.toggleNode(childTask1.id);
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(false);
    });

    it('should expand all nodes', () => {
      visualizer.expandAll(rootTask);
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(true);
      expect(visualizer.isNodeExpanded(childTask2.id)).toBe(true);
      expect(visualizer.isNodeExpanded(grandchildTask.id)).toBe(true);
    });

    it('should collapse all nodes except root', () => {
      visualizer.expandAll(rootTask);
      visualizer.collapseAll(rootTask);
      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(false);
      expect(visualizer.isNodeExpanded(childTask2.id)).toBe(false);
      expect(visualizer.isNodeExpanded(grandchildTask.id)).toBe(false);
    });
  });

  describe('树形可视化', () => {
    it('should render tree with all nodes collapsed', () => {
      const output = visualizer.renderTree(rootTask);
      expect(output).toContain('根任务');
      expect(output).not.toContain('子任务1');
      expect(output).not.toContain('子任务2');
    });

    it('should render tree with some nodes expanded', () => {
      visualizer.expandNode(rootTask.id);
      const output = visualizer.renderTree(rootTask);
      expect(output).toContain('根任务');
      expect(output).toContain('子任务1');
      expect(output).toContain('子任务2');
    });

    it('should render tree with all nodes expanded', () => {
      visualizer.expandAll(rootTask);
      const output = visualizer.renderTree(rootTask);
      expect(output).toContain('根任务');
      expect(output).toContain('子任务1');
      expect(output).toContain('子任务2');
      expect(output).toContain('孙任务');
    });

    it('should generate tree lines with correct depth', () => {
      visualizer.expandAll(rootTask);
      const lines = visualizer.generateTreeLines(rootTask);

      expect(lines).toHaveLength(4);
      expect(lines[0].depth).toBe(0);
      expect(lines[0].nodeId).toBe(rootTask.id);
      expect(lines[1].depth).toBe(1);
      expect(lines[2].depth).toBe(1);
      expect(lines[3].depth).toBe(2);
    });

    it('should respect maxDepth parameter', () => {
      visualizer.expandAll(rootTask);
      const lines = visualizer.generateTreeLines(rootTask, 1);

      // 应该只有根节点和第一层子节点
      const maxDepthFound = Math.max(...lines.map(l => l.depth));
      expect(maxDepthFound).toBeLessThanOrEqual(1);
    });
  });

  describe('详细树形可视化', () => {
    it('should render detailed tree with status icons', () => {
      visualizer.expandAll(rootTask);
      const output = visualizer.renderDetailedTree(rootTask);

      expect(output).toContain('根任务');
      expect(output).toContain('子任务1');
      expect(output).toContain('子任务2');
      // 应该包含状态符号
      expect(output).toContain('◯'); // pending 的图标
      expect(output).toContain('◷'); // coding 的图标
      expect(output).toContain('✓'); // passed 的图标
    });

    it('should show expand/collapse indicators', () => {
      visualizer.expandNode(childTask1.id);
      const lines = visualizer.generateDetailedTreeLines(rootTask);

      const childLine = lines.find(l => l.nodeId === childTask1.id);
      expect(childLine).toBeDefined();
      expect(childLine?.hasChildren).toBe(true);
      expect(childLine?.isExpanded).toBe(true);
    });
  });

  describe('节点查询', () => {
    it('should find node by id', () => {
      const found = visualizer.findNodeById(rootTask, childTask1.id);
      expect(found).toBe(childTask1);
    });

    it('should return null when node not found', () => {
      const found = visualizer.findNodeById(rootTask, 'nonexistent');
      expect(found).toBeNull();
    });

    it('should find nodes by partial name match', () => {
      const found = visualizer.findNodesByName(rootTask, '子任务');
      expect(found).toHaveLength(2);
      expect(found).toContain(childTask1);
      expect(found).toContain(childTask2);
    });

    it('should get node path from root', () => {
      const path = visualizer.getNodePath(rootTask, grandchildTask.id);
      expect(path).toHaveLength(3);
      expect(path[0]).toBe(rootTask);
      expect(path[1]).toBe(childTask1);
      expect(path[2]).toBe(grandchildTask);
    });
  });

  describe('展开状态统计', () => {
    it('should calculate expand statistics', () => {
      visualizer.expandNode(childTask1.id);
      const stats = visualizer.getExpandStats(rootTask);

      expect(stats.totalNodes).toBe(4);
      expect(stats.nodesWithChildren).toBe(2);
      expect(stats.expandedNodes).toBe(1);
      expect(stats.collapsedNodes).toBe(1);
    });

    it('should update stats after expanding all', () => {
      visualizer.expandAll(rootTask);
      const stats = visualizer.getExpandStats(rootTask);

      expect(stats.expandedNodes).toBe(2);
      expect(stats.collapsedNodes).toBe(0);
    });
  });

  describe('状态重置', () => {
    it('should reset all expand states', () => {
      visualizer.expandAll(rootTask);
      visualizer.reset();

      expect(visualizer.isNodeExpanded(childTask1.id)).toBe(false);
      expect(visualizer.isNodeExpanded(childTask2.id)).toBe(false);
      expect(visualizer.isNodeExpanded(grandchildTask.id)).toBe(false);
    });
  });
});
