/**
 * 树形结构渲染模块
 * 提供树形数据结构和多种渲染方式
 */

// 树形渲染样式类型
export type TreeRenderStyle = 'tree' | 'indent' | 'compact';

// 树形渲染选项
export interface TreeRenderOptions {
  style?: TreeRenderStyle;
  prefix?: string;
  indentSize?: number;
  colorize?: boolean;
  maxDepth?: number;
  svgWidth?: number;
  svgHeight?: number;
  nodeRadius?: number;
  nodeColor?: string;
  textColor?: string;
  lineColor?: string;
}

// 树节点统计信息
export interface TreeStats {
  totalNodes: number;
  totalLeaves: number;
  maxDepth: number;
  avgChildren: number;
}

// JSON 树节点表示
export interface TreeNodeJSON {
  label: string;
  children: TreeNodeJSON[];
  metadata?: Record<string, any>;
  expanded?: boolean;
}

/**
 * 树节点类
 * 表示树形结构中的一个节点
 */
export class TreeNode {
  label: string;
  children: TreeNode[] = [];
  parent: TreeNode | null = null;
  private metadata: Map<string, any> = new Map();
  private expanded: boolean = true;

  constructor(label: string) {
    this.label = label;
  }

  /**
   * 添加子节点
   */
  addChild(child: TreeNode): this {
    this.children.push(child);
    child.parent = this;
    return this;
  }

  /**
   * 获取节点深度（距离根节点的距离）
   */
  getDepth(): number {
    let depth = 0;
    let current: TreeNode | null = this.parent;
    while (current !== null) {
      depth++;
      current = current.parent;
    }
    return depth;
  }

  /**
   * 获取节点路径（从根到该节点）
   */
  getPath(): string[] {
    const path: string[] = [];
    let current: TreeNode | null = this;
    while (current !== null) {
      path.unshift(current.label);
      current = current.parent;
    }
    return path;
  }

  /**
   * 获取树的大小（包括本节点的所有节点总数）
   */
  getSize(): number {
    let size = 1;
    for (const child of this.children) {
      size += child.getSize();
    }
    return size;
  }

  /**
   * 获取树的高度（最深的叶子节点的深度）
   */
  getHeight(): number {
    if (this.children.length === 0) {
      return 0;
    }
    return 1 + Math.max(...this.children.map(child => child.getHeight()));
  }

  /**
   * 查找节点
   */
  find(label: string): TreeNode | null {
    if (this.label === label) {
      return this;
    }
    for (const child of this.children) {
      const found = child.find(label);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  /**
   * 设置元数据
   */
  setMetadata(key: string, value: any): this {
    this.metadata.set(key, value);
    return this;
  }

  /**
   * 获取元数据
   */
  getMetadata(key: string): any {
    return this.metadata.get(key);
  }

  /**
   * 获取所有元数据
   */
  getAllMetadata(): Map<string, any> {
    return this.metadata;
  }

  /**
   * 检查是否有元数据
   */
  hasMetadata(): boolean {
    return this.metadata.size > 0;
  }

  /**
   * 设置展开/折叠状态
   */
  setExpanded(expanded: boolean): this {
    this.expanded = expanded;
    return this;
  }

  /**
   * 获取展开/折叠状态
   */
  isExpanded(): boolean {
    return this.expanded;
  }
}

/**
 * 树形渲染器
 * 支持多种渲染格式
 */
export class TreeRenderer {
  private root: TreeNode;
  private options: Required<TreeRenderOptions>;

  constructor(root: TreeNode, options: TreeRenderOptions = {}) {
    this.root = root;
    this.options = {
      style: options.style || 'tree',
      prefix: options.prefix || '',
      indentSize: options.indentSize || 2,
      colorize: options.colorize || false,
      maxDepth: options.maxDepth || 100,
      svgWidth: options.svgWidth || 800,
      svgHeight: options.svgHeight || 600,
      nodeRadius: options.nodeRadius || 20,
      nodeColor: options.nodeColor || '#4A90E2',
      textColor: options.textColor || '#000000',
      lineColor: options.lineColor || '#666666',
    };
  }

  /**
   * 渲染树为文本
   */
  render(): string {
    const lines: string[] = [];
    this.renderNode(this.root, 0, lines, true, true);
    return lines.join('\n');
  }

  /**
   * 内部递归渲染节点
   */
  private renderNode(
    node: TreeNode,
    depth: number,
    lines: string[],
    isLast: boolean,
    isRoot: boolean
  ): void {
    if (depth > this.options.maxDepth) {
      return;
    }

    let prefix = this.options.prefix;

    if (!isRoot) {
      if (this.options.style === 'tree') {
        // 树形样式: ├── 或 └──
        const indent = this.getTreeIndent(depth);
        prefix += indent + (isLast ? '└── ' : '├── ');
      } else if (this.options.style === 'indent') {
        // 缩进样式
        prefix += ' '.repeat(depth * this.options.indentSize);
      } else if (this.options.style === 'compact') {
        // 紧凑样式
        prefix += '.'.repeat(Math.max(0, depth - 1)) + (depth > 0 ? ' ' : '');
      }
    }

    // 如果节点被折叠，显示指示符
    const expansionIndicator = node.children.length > 0 && !node.isExpanded() ? ' [+]' : '';
    lines.push(prefix + node.label + expansionIndicator);

    // 只在节点展开时渲染子节点
    if (node.isExpanded()) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLast = i === node.children.length - 1;
        this.renderNode(child, depth + 1, lines, isLast, false);
      }
    }
  }

  /**
   * 获取树形缩进字符串
   */
  private getTreeIndent(depth: number): string {
    if (depth === 0) return '';
    return '   '.repeat(depth - 1);
  }

  /**
   * 转换为JSON格式
   */
  toJSON(): TreeNodeJSON {
    return this.nodeToJSON(this.root);
  }

  /**
   * 递归节点转JSON
   */
  private nodeToJSON(node: TreeNode): TreeNodeJSON {
    const json: TreeNodeJSON = {
      label: node.label,
      children: node.children.map(child => this.nodeToJSON(child)),
    };

    if (node.hasMetadata()) {
      json.metadata = Object.fromEntries(node.getAllMetadata());
    }

    if (!node.isExpanded()) {
      json.expanded = false;
    }

    return json;
  }

  /**
   * 过滤树中的节点
   */
  filter(predicate: (node: TreeNode) => boolean): TreeNode {
    return this.filterNode(this.root, predicate);
  }

  /**
   * 递归过滤节点
   */
  private filterNode(node: TreeNode, predicate: (node: TreeNode) => boolean): TreeNode {
    const newNode = new TreeNode(node.label);

    // 复制元数据和状态
    for (const [key, value] of node['metadata'] as Map<string, any>) {
      newNode.setMetadata(key, value);
    }
    newNode.setExpanded(node.isExpanded());

    // 递归过滤子节点
    for (const child of node.children) {
      if (predicate(child)) {
        newNode.addChild(this.filterNode(child, predicate));
      }
    }

    return newNode;
  }

  /**
   * 映射树中的节点
   */
  map(mapper: (node: TreeNode) => TreeNode): TreeNode {
    return this.mapNode(this.root, mapper);
  }

  /**
   * 递归映射节点
   */
  private mapNode(node: TreeNode, mapper: (node: TreeNode) => TreeNode): TreeNode {
    const newNode = mapper(node);

    for (const child of node.children) {
      newNode.addChild(this.mapNode(child, mapper));
    }

    return newNode;
  }

  /**
   * 获取树的统计信息
   */
  getStats(): TreeStats {
    const stats = this.calculateStats(this.root);
    const totalLeaves = this.countLeaves(this.root);
    const totalChildren = this.root.children.reduce((sum, child) => sum + child.getSize(), 0);

    return {
      totalNodes: this.root.getSize(),
      totalLeaves,
      maxDepth: this.root.getHeight(),
      avgChildren: this.root.children.length > 0
        ? totalChildren / this.root.children.length
        : 0,
    };
  }

  /**
   * 计算统计信息（辅助方法）
   */
  private calculateStats(node: TreeNode): any {
    return {
      nodeCount: node.getSize(),
      height: node.getHeight(),
    };
  }

  /**
   * 计算叶子节点数量
   */
  private countLeaves(node: TreeNode): number {
    if (node.children.length === 0) {
      return 1;
    }
    return node.children.reduce((sum, child) => sum + this.countLeaves(child), 0);
  }

  /**
   * 转换为SVG格式
   */
  toSVG(): string {
    const width = this.options.svgWidth;
    const height = this.options.svgHeight;

    // 计算布局
    const layout = this.calculateLayout();

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    svg += `  <defs>\n    <style>\n`;
    svg += `      .tree-node { fill: ${this.options.nodeColor}; stroke: #000; stroke-width: 2; }\n`;
    svg += `      .tree-text { font-family: Arial, sans-serif; font-size: 12px; text-anchor: middle; dominant-baseline: middle; }\n`;
    svg += `      .tree-line { stroke: ${this.options.lineColor}; stroke-width: 1; }\n`;
    svg += `    </style>\n  </defs>\n`;

    // 绘制连接线
    this.drawSVGLines(this.root, svg, layout);

    // 绘制节点
    svg += this.drawSVGNodes(this.root, layout);

    svg += '</svg>';

    return svg;
  }

  /**
   * 计算SVG布局（节点位置）
   */
  private calculateLayout(): Map<TreeNode, { x: number; y: number }> {
    const layout = new Map<TreeNode, { x: number; y: number }>();
    const width = this.options.svgWidth;
    const height = this.options.svgHeight;

    // 简单的层级布局算法
    const depths = this.getNodeDepths(this.root);
    const maxDepth = Math.max(...Array.from(depths.values()));

    const levelWidths = new Map<number, number>();
    for (const [node, depth] of depths) {
      levelWidths.set(depth, (levelWidths.get(depth) || 0) + 1);
    }

    const verticalSpacing = height / (maxDepth + 2);
    const positions = new Map<number, number>();

    for (const [node, depth] of depths) {
      const levelWidth = levelWidths.get(depth) || 1;
      const x = (width / (levelWidth + 1)) * ((positions.get(depth) || 0) + 1);
      const y = verticalSpacing * (depth + 1);

      layout.set(node, { x, y });
      positions.set(depth, (positions.get(depth) || 0) + 1);
    }

    return layout;
  }

  /**
   * 获取节点深度映射
   */
  private getNodeDepths(node: TreeNode, depths = new Map<TreeNode, number>(), depth = 0): Map<TreeNode, number> {
    depths.set(node, depth);
    for (const child of node.children) {
      this.getNodeDepths(child, depths, depth + 1);
    }
    return depths;
  }

  /**
   * 绘制SVG连接线
   */
  private drawSVGLines(node: TreeNode, svg: string, layout: Map<TreeNode, { x: number; y: number }>): void {
    const nodePos = layout.get(node);
    if (!nodePos) return;

    for (const child of node.children) {
      const childPos = layout.get(child);
      if (!childPos) continue;

      svg += `  <line x1="${nodePos.x}" y1="${nodePos.y}" x2="${childPos.x}" y2="${childPos.y}" class="tree-line"/>\n`;
      this.drawSVGLines(child, svg, layout);
    }
  }

  /**
   * 绘制SVG节点
   */
  private drawSVGNodes(node: TreeNode, layout: Map<TreeNode, { x: number; y: number }>): string {
    let svg = '';
    const pos = layout.get(node);

    if (!pos) return svg;

    const radius = this.options.nodeRadius;
    const nodeColor = node.getMetadata('nodeColor') || this.options.nodeColor;
    const nodeSize = node.getMetadata('nodeSize') || radius;

    // 绘制节点圆形
    svg += `  <circle cx="${pos.x}" cy="${pos.y}" r="${nodeSize}" class="tree-node" fill="${nodeColor}"/>\n`;

    // 绘制节点文本
    svg += `  <text x="${pos.x}" y="${pos.y}" class="tree-text">${this.escapeXml(node.label)}</text>\n`;

    // 递归绘制子节点
    for (const child of node.children) {
      svg += this.drawSVGNodes(child, layout);
    }

    return svg;
  }

  /**
   * 转义XML特殊字符
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
