import { describe, it, expect } from 'vitest';
import { renderTree } from '../src/tree-render';

describe('树形结构基本渲染', () => {
  it('应该正确渲染单个根节点', () => {
    const tree = { id: '1', name: '根节点', children: [] };
    const result = renderTree(tree);
    expect(result).toBeDefined();
    expect(result).toContain('根节点');
  });

  it('应该正确渲染两层树结构', () => {
    const tree = {
      id: '1',
      name: '根节点',
      children: [
        { id: '1-1', name: '子节点1', children: [] },
        { id: '1-2', name: '子节点2', children: [] }
      ]
    };
    const result = renderTree(tree);
    expect(result).toContain('根节点');
    expect(result).toContain('子节点1');
    expect(result).toContain('子节点2');
  });

  it('应该正确渲染多层嵌套树结构', () => {
    const tree = {
      id: '1',
      name: '根节点',
      children: [
        {
          id: '1-1',
          name: '子节点1',
          children: [
            { id: '1-1-1', name: '孙节点1', children: [] }
          ]
        }
      ]
    };
    const result = renderTree(tree);
    expect(result).toContain('根节点');
    expect(result).toContain('子节点1');
    expect(result).toContain('孙节点1');
  });

  it('应该正确处理空树', () => {
    const result = renderTree(null);
    expect(result).toBeDefined();
  });
});