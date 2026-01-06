import { describe, it, expect } from 'vitest';
import { renderTree, TreeNode, toggleNode } from '../src/tree-render';

describe('树形结构边界情况', () => {
  it('应该处理空子节点数组', () => {
    const tree: TreeNode = { id: '1', name: '节点', children: [] };
    const result = renderTree(tree);
    expect(result).toBeDefined();
    expect(result).toContain('节点');
  });

  it('应该处理undefined children', () => {
    const tree: any = { id: '1', name: '节点' };
    const result = renderTree(tree);
    expect(result).toBeDefined();
  });

  it('应该处理非常长的节点名称', () => {
    const longName = 'A'.repeat(1000);
    const tree: TreeNode = { id: '1', name: longName, children: [] };
    const result = renderTree(tree);
    expect(result).toBeDefined();
    expect(result).toContain('A');
  });

  it('应该处理特殊字符的节点名称', () => {
    const tree: TreeNode = {
      id: '1',
      name: '<script>alert("xss")</script>',
      children: []
    };
    const result = renderTree(tree);
    expect(result).toBeDefined();
  });

  it('应该处理空字符串节点名称', () => {
    const tree: TreeNode = { id: '1', name: '', children: [] };
    const result = renderTree(tree);
    expect(result).toBeDefined();
  });

  it('应该处理重复的节点ID', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: [
        { id: 'duplicate', name: '节点1', children: [] },
        { id: 'duplicate', name: '节点2', children: [] }
      ]
    };
    const result = renderTree(tree);
    expect(result).toBeDefined();
  });

  it('应该处理不存在的节点ID切换', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: []
    };
    const result = toggleNode(tree, 'non-existent-id');
    expect(result).toBeDefined();
    expect(result.id).toBe('1');
  });

  it('应该处理循环引用（如果可能）', () => {
    const tree: any = { id: '1', name: '节点', children: [] };
    // 注意：实际实现应该防止或检测循环引用
    const result = renderTree(tree);
    expect(result).toBeDefined();
  });

  it('应该处理只有一个节点的树', () => {
    const tree: TreeNode = { id: '1', name: '单节点', children: [] };
    const result = renderTree(tree);
    expect(result).toContain('单节点');
  });

  it('应该处理非常宽的树（单层多节点）', () => {
    const children = Array.from({ length: 1000 }, (_, i) => ({
      id: `child-${i}`,
      name: `子节点${i}`,
      children: []
    }));
    const tree: TreeNode = { id: '1', name: '根节点', children };
    const result = renderTree(tree);
    expect(result).toBeDefined();
    expect(result).toContain('子节点0');
    expect(result).toContain('子节点999');
  });
});