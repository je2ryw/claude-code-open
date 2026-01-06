import { describe, it, expect } from 'vitest';
import { renderTree, getNodeIndent } from '../src/tree-render';

describe('树形结构层级缩进', () => {
  it('根节点应该没有缩进', () => {
    const indent = getNodeIndent(0);
    expect(indent).toBe('');
  });

  it('第一层子节点应该有正确的缩进', () => {
    const indent = getNodeIndent(1);
    expect(indent.length).toBeGreaterThan(0);
  });

  it('不同层级应该有不同的缩进长度', () => {
    const indent1 = getNodeIndent(1);
    const indent2 = getNodeIndent(2);
    const indent3 = getNodeIndent(3);
    expect(indent2.length).toBeGreaterThan(indent1.length);
    expect(indent3.length).toBeGreaterThan(indent2.length);
  });

  it('渲染结果应该包含层级标识符', () => {
    const tree = {
      id: '1',
      name: '根节点',
      children: [
        { id: '1-1', name: '子节点', children: [] }
      ]
    };
    const result = renderTree(tree);
    expect(result).toMatch(/[├└│─]/); // 包含树形线条字符
  });

  it('应该正确显示最后一个子节点的标识', () => {
    const tree = {
      id: '1',
      name: '根节点',
      children: [
        { id: '1-1', name: '子节点1', children: [] },
        { id: '1-2', name: '子节点2', children: [] }
      ]
    };
    const result = renderTree(tree);
    expect(result).toContain('└'); // 最后一个节点使用└
  });
});