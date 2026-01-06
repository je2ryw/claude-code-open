import { describe, it, expect } from 'vitest';
import { renderTree, TreeNode, RenderOptions } from '../src/tree-render';

describe('树形结构自定义渲染', () => {
  it('应该支持自定义节点渲染函数', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: []
    };
    const options: RenderOptions = {
      renderNode: (node) => `[${node.id}] ${node.name}`
    };
    const result = renderTree(tree, options);
    expect(result).toContain('[1]');
    expect(result).toContain('根节点');
  });

  it('应该支持自定义缩进字符', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: [{ id: '1-1', name: '子节点', children: [] }]
    };
    const options: RenderOptions = {
      indentChar: '  ' // 使用两个空格
    };
    const result = renderTree(tree, options);
    expect(result).toBeDefined();
  });

  it('应该支持自定义树形线条样式', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      children: [{ id: '1-1', name: '子节点', children: [] }]
    };
    const options: RenderOptions = {
      lineStyle: {
        vertical: '|',
        horizontal: '-',
        branch: '+',
        lastBranch: '`'
      }
    };
    const result = renderTree(tree, options);
    expect(result).toMatch(/[|\-+`]/);
  });

  it('应该支持添加节点图标', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      icon: '📁',
      children: [
        { id: '1-1', name: '文件', icon: '📄', children: [] }
      ]
    };
    const result = renderTree(tree);
    expect(result).toContain('📁');
    expect(result).toContain('📄');
  });

  it('应该支持节点元数据显示', () => {
    const tree: TreeNode = {
      id: '1',
      name: '根节点',
      metadata: { size: '1.2MB', type: 'folder' },
      children: []
    };
    const options: RenderOptions = {
      showMetadata: true
    };
    const result = renderTree(tree, options);
    expect(result).toBeDefined();
  });
});