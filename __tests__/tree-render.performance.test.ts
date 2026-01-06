import { describe, it, expect } from 'vitest';
import { renderTree, TreeNode } from '../src/tree-render';

function generateLargeTree(depth: number, childrenPerNode: number): TreeNode {
  if (depth === 0) {
    return { id: Math.random().toString(), name: 'Leaf', children: [] };
  }
  const children = Array.from({ length: childrenPerNode }, () =>
    generateLargeTree(depth - 1, childrenPerNode)
  );
  return {
    id: Math.random().toString(),
    name: `Node-${depth}`,
    children
  };
}

describe('树形结构性能', () => {
  it('应该能够在合理时间内渲染100个节点', () => {
    const tree = generateLargeTree(3, 4); // 约85个节点
    const start = performance.now();
    const result = renderTree(tree);
    const end = performance.now();
    expect(result).toBeDefined();
    expect(end - start).toBeLessThan(100); // 应该在100ms内完成
  });

  it('应该能够在合理时间内渲染1000个节点', () => {
    const tree = generateLargeTree(4, 9); // 约1000个节点
    const start = performance.now();
    const result = renderTree(tree);
    const end = performance.now();
    expect(result).toBeDefined();
    expect(end - start).toBeLessThan(500); // 应该在500ms内完成
  });

  it('应该能够处理深层嵌套的树', () => {
    const tree = generateLargeTree(10, 2); // 深度10层
    const start = performance.now();
    const result = renderTree(tree);
    const end = performance.now();
    expect(result).toBeDefined();
    expect(end - start).toBeLessThan(200);
  });

  it('切换节点状态应该是快速的', () => {
    const tree = generateLargeTree(4, 5);
    const start = performance.now();
    const toggled = toggleNode(tree, tree.children[0].id);
    const end = performance.now();
    expect(toggled).toBeDefined();
    expect(end - start).toBeLessThan(50); // 应该在50ms内完成
  });
});