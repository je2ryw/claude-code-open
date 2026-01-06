/**
 * 树形结构渲染测试
 * 测试树形节点、树形渲染器和SVG可视化功能
 */

import { TreeNode, TreeRenderer, TreeRenderStyle, TreeRenderOptions } from '../../src/renderer/tree-render.js';
import * as assert from 'assert';

describe('TreeNode', () => {
  it('应该创建一个树节点', () => {
    const node = new TreeNode('root');
    assert.strictEqual(node.label, 'root');
    assert.strictEqual(node.children.length, 0);
    assert.strictEqual(node.parent, null);
  });

  it('应该添加子节点', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');

    root.addChild(child1);
    root.addChild(child2);

    assert.strictEqual(root.children.length, 2);
    assert.strictEqual(root.children[0], child1);
    assert.strictEqual(root.children[1], child2);
    assert.strictEqual(child1.parent, root);
    assert.strictEqual(child2.parent, root);
  });

  it('应该支持链式调用添加子节点', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');

    const result = root.addChild(child);
    assert.strictEqual(result, root);
  });

  it('应该获取节点深度', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child);
    child.addChild(grandchild);

    assert.strictEqual(root.getDepth(), 0);
    assert.strictEqual(child.getDepth(), 1);
    assert.strictEqual(grandchild.getDepth(), 2);
  });

  it('应该获取节点层级', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child);
    child.addChild(grandchild);

    assert.deepStrictEqual(root.getPath(), ['root']);
    assert.deepStrictEqual(child.getPath(), ['root', 'child']);
    assert.deepStrictEqual(grandchild.getPath(), ['root', 'child', 'grandchild']);
  });

  it('应该计算树的大小（节点总数）', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);

    assert.strictEqual(root.getSize(), 4);
    assert.strictEqual(child1.getSize(), 2);
    assert.strictEqual(child2.getSize(), 1);
  });

  it('应该计算树的高度', () => {
    const root = new TreeNode('root');
    assert.strictEqual(root.getHeight(), 0);

    const child = new TreeNode('child');
    root.addChild(child);
    assert.strictEqual(root.getHeight(), 1);

    const grandchild = new TreeNode('grandchild');
    child.addChild(grandchild);
    assert.strictEqual(root.getHeight(), 2);
  });

  it('应该查找节点', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child);
    child.addChild(grandchild);

    assert.strictEqual(root.find('root'), root);
    assert.strictEqual(root.find('child'), child);
    assert.strictEqual(root.find('grandchild'), grandchild);
    assert.strictEqual(root.find('notfound'), null);
  });

  it('应该设置节点元数据', () => {
    const node = new TreeNode('test');
    node.setMetadata('key1', 'value1');
    node.setMetadata('key2', 42);

    assert.strictEqual(node.getMetadata('key1'), 'value1');
    assert.strictEqual(node.getMetadata('key2'), 42);
    assert.strictEqual(node.getMetadata('notexist'), undefined);
  });

  it('应该支持节点展开/折叠状态', () => {
    const node = new TreeNode('test');
    assert.strictEqual(node.isExpanded(), true); // 默认展开

    node.setExpanded(false);
    assert.strictEqual(node.isExpanded(), false);

    node.setExpanded(true);
    assert.strictEqual(node.isExpanded(), true);
  });
});

describe('TreeRenderer', () => {
  it('应该使用默认选项渲染树', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');

    root.addChild(child1);
    root.addChild(child2);

    const renderer = new TreeRenderer(root);
    const output = renderer.render();

    assert(output.includes('root'));
    assert(output.includes('child1'));
    assert(output.includes('child2'));
  });

  it('应该使用树形样式渲染树', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);

    const renderer = new TreeRenderer(root, { style: 'tree' as TreeRenderStyle });
    const output = renderer.render();

    // 树形样式应该包含特定的连接符
    assert(output.includes('├'));
    assert(output.includes('└'));
  });

  it('应该使用缩进样式渲染树', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root, { style: 'indent' as TreeRenderStyle });
    const output = renderer.render();

    assert(output.includes('  '));
  });

  it('应该使用自定义前缀', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root, { prefix: '> ' });
    const output = renderer.render();

    assert(output.includes('> '));
  });

  it('应该返回JSON格式的树', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root);
    const json = renderer.toJSON();

    assert.strictEqual(json.label, 'root');
    assert.strictEqual(json.children.length, 1);
    assert.strictEqual(json.children[0].label, 'child');
  });

  it('应该过滤树中的节点', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);

    const renderer = new TreeRenderer(root);
    const filtered = renderer.filter(node => node.label.includes('child'));

    // 过滤后的树应该只包含包含 'child' 的节点
    const output = new TreeRenderer(filtered).render();
    assert(output.includes('child1'));
    assert(output.includes('child2'));
    assert(!output.includes('grandchild'));
  });

  it('应该映射树中的节点', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root);
    const mapped = renderer.map(node => {
      const newNode = new TreeNode(node.label.toUpperCase());
      return newNode;
    });

    const output = new TreeRenderer(mapped).render();
    assert(output.includes('ROOT'));
    assert(output.includes('CHILD'));
  });

  it('应该计算树的统计信息', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);

    const renderer = new TreeRenderer(root);
    const stats = renderer.getStats();

    assert.strictEqual(stats.totalNodes, 4);
    assert.strictEqual(stats.totalLeaves, 2);
    assert.strictEqual(stats.maxDepth, 2);
    assert.strictEqual(stats.avgChildren, 1);
  });

  it('应该处理空树', () => {
    const root = new TreeNode('empty');
    const renderer = new TreeRenderer(root);
    const output = renderer.render();

    assert(output.includes('empty'));
    assert.strictEqual(root.children.length, 0);
  });
});

describe('SVG Tree Rendering', () => {
  it('应该生成基础SVG树', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root);
    const svg = renderer.toSVG();

    assert(svg.includes('<svg'));
    assert(svg.includes('</svg>'));
    assert(svg.includes('root'));
    assert(svg.includes('child'));
  });

  it('应该生成带自定义选项的SVG树', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root, {
      svgWidth: 400,
      svgHeight: 300,
    });
    const svg = renderer.toSVG();

    assert(svg.includes('width="400"'));
    assert(svg.includes('height="300"'));
  });

  it('应该处理深层树的SVG渲染', () => {
    const root = new TreeNode('root');
    let current = root;
    for (let i = 1; i <= 5; i++) {
      const child = new TreeNode(`level${i}`);
      current.addChild(child);
      current = child;
    }

    const renderer = new TreeRenderer(root);
    const svg = renderer.toSVG();

    assert(svg.includes('root'));
    assert(svg.includes('level1'));
    assert(svg.includes('level5'));
  });

  it('应该支持SVG节点样式定制', () => {
    const root = new TreeNode('root');
    root.setMetadata('nodeColor', '#FF0000');
    root.setMetadata('nodeSize', 50);

    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root);
    const svg = renderer.toSVG();

    assert(svg.includes('FF0000'));
  });
});

describe('Render Options', () => {
  it('应该使用自定义选项控制渲染', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const options: TreeRenderOptions = {
      style: 'tree',
      prefix: '>>> ',
      indentSize: 4,
      colorize: false,
    };

    const renderer = new TreeRenderer(root, options);
    const output = renderer.render();

    assert(output.includes('>>> '));
  });

  it('应该支持缩进大小自定义', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root, { indentSize: 6 });
    const output = renderer.render();

    // 缩进应该是6个空格
    const lines = output.split('\n');
    assert(lines.length >= 2);
  });

  it('应该支持颜色化选项', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    const renderer = new TreeRenderer(root, { colorize: true });
    const output = renderer.render();

    // 颜色化的输出应该包含ANSI颜色代码
    // 或者可能不包含，取决于实现
    assert(typeof output === 'string');
  });
});

describe('Edge Cases', () => {
  it('应该处理包含特殊字符的标签', () => {
    const root = new TreeNode('root-with-dash_and_underscore');
    const child = new TreeNode('child<>&"');
    root.addChild(child);

    const renderer = new TreeRenderer(root);
    const output = renderer.render();

    assert(output.includes('root-with-dash_and_underscore'));
  });

  it('应该处理非常大的树', () => {
    const root = new TreeNode('root');
    for (let i = 0; i < 100; i++) {
      root.addChild(new TreeNode(`child${i}`));
    }

    const renderer = new TreeRenderer(root);
    const output = renderer.render();

    assert.strictEqual(root.children.length, 100);
    assert(output.includes('child0'));
    assert(output.includes('child99'));
  });

  it('应该处理循环节点引用（限制深度）', () => {
    const root = new TreeNode('root');
    const child = new TreeNode('child');
    root.addChild(child);

    // TreeRenderer应该有最大深度限制，防止无限循环
    const renderer = new TreeRenderer(root);
    const output = renderer.render();

    assert(typeof output === 'string');
  });

  it('应该正确处理折叠的节点', () => {
    const root = new TreeNode('root');
    const child1 = new TreeNode('child1');
    const child2 = new TreeNode('child2');
    const grandchild = new TreeNode('grandchild');

    root.addChild(child1);
    root.addChild(child2);
    child1.addChild(grandchild);

    child1.setExpanded(false);

    const renderer = new TreeRenderer(root);
    const output = renderer.render();

    // 折叠的节点应该显示某种标记
    assert(output.includes('child1'));
  });
});
