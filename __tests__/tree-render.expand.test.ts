import { describe, it, expect } from 'vitest';
import { TreeNode, toggleNode, isNodeExpanded } from '../src/tree-render';

describe('树形结构展开折叠', () => {
  it('默认情况下节点应该是展开的', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: [{ id: '1-1', name: '子节点', children: [] }]
    };
    expect(isNodeExpanded(tree)).toBe(true);
  });

  it('应该能够折叠节点', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      expanded: true,
      children: [{ id: '1-1', name: '子节点', children: [] }]
    };
    const collapsed = toggleNode(tree, '1');
    expect(collapsed.expanded).toBe(false);
  });

  it('应该能够展开已折叠的节点', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      expanded: false,
      children: [{ id: '1-1', name: '子节点', children: [] }]
    };
    const expanded = toggleNode(tree, '1');
    expect(expanded.expanded).toBe(true);
  });

  it('折叠节点后子节点不应该被渲染', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      expanded: false,
      children: [{ id: '1-1', name: '子节点', children: [] }]
    };
    const result = renderTree(tree);
    expect(result).toContain('根节点');
    expect(result).not.toContain('子节点');
  });

  it('应该能够切换深层嵌套节点的状态', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: [
        {
          id: '1-1',
          name: '子节点',
          expanded: true,
          children: [{ id: '1-1-1', name: '孙节点', children: [] }]
        }
      ]
    };
    const toggled = toggleNode(tree, '1-1');
    const childNode = toggled.children[0];
    expect(childNode.expanded).toBe(false);
  });
});