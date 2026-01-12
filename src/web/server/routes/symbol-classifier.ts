/**
 * 符号分类器
 *
 * 用于判断代码符号的类型及其适用的分析视图:
 * - Function/Method: 支持调用图
 * - Interface/Type/Property: 仅支持定义和引用分析
 */

/**
 * 符号类型枚举
 */
export enum SymbolType {
  // 可执行符号 (支持调用图)
  FUNCTION = 'function',
  METHOD = 'method',
  CONSTRUCTOR = 'constructor',
  ARROW_FUNCTION = 'arrow_function',

  // 静态符号 (不支持调用图)
  INTERFACE = 'interface',
  TYPE_ALIAS = 'type',
  CLASS = 'class',
  PROPERTY = 'property',
  VARIABLE = 'variable',
  CONSTANT = 'constant',

  // 未知
  UNKNOWN = 'unknown',
}

/**
 * 视图类型枚举
 */
export enum ViewType {
  CALL_GRAPH = 'call-graph',       // 调用图视图
  DEFINITION = 'definition',       // 定义视图
  REFERENCES = 'references',       // 引用视图
  TYPE_HIERARCHY = 'type-hierarchy', // 类型层级视图
}

/**
 * 符号分类结果
 */
export interface SymbolClassification {
  type: SymbolType;
  canHaveCallGraph: boolean;
  defaultView: ViewType;
  supportedViews: ViewType[];
  description: string;
}

/**
 * 根据符号的 kind 字符串分类符号类型
 *
 * @param kind - TypeScript 符号类型字符串
 * @returns 符号分类结果
 */
export function classifySymbol(kind: string | undefined): SymbolClassification {
  if (!kind) {
    return {
      type: SymbolType.UNKNOWN,
      canHaveCallGraph: false,
      defaultView: ViewType.DEFINITION,
      supportedViews: [ViewType.DEFINITION, ViewType.REFERENCES],
      description: '未知符号类型',
    };
  }

  const normalizedKind = kind.toLowerCase();

  // 函数类符号 (支持调用图)
  if (
    normalizedKind.includes('function') ||
    normalizedKind === 'method' ||
    normalizedKind === 'constructor'
  ) {
    let type = SymbolType.FUNCTION;
    let description = '函数';

    if (normalizedKind === 'method') {
      type = SymbolType.METHOD;
      description = '方法';
    } else if (normalizedKind === 'constructor') {
      type = SymbolType.CONSTRUCTOR;
      description = '构造函数';
    } else if (normalizedKind.includes('arrow')) {
      type = SymbolType.ARROW_FUNCTION;
      description = '箭头函数';
    }

    return {
      type,
      canHaveCallGraph: true,
      defaultView: ViewType.CALL_GRAPH,
      supportedViews: [
        ViewType.CALL_GRAPH,
        ViewType.DEFINITION,
        ViewType.REFERENCES,
      ],
      description,
    };
  }

  // 接口
  if (normalizedKind === 'interface') {
    return {
      type: SymbolType.INTERFACE,
      canHaveCallGraph: false,
      defaultView: ViewType.REFERENCES,
      supportedViews: [
        ViewType.DEFINITION,
        ViewType.REFERENCES,
        ViewType.TYPE_HIERARCHY,
      ],
      description: '接口定义',
    };
  }

  // 类型别名
  if (normalizedKind === 'type' || normalizedKind === 'typealias') {
    return {
      type: SymbolType.TYPE_ALIAS,
      canHaveCallGraph: false,
      defaultView: ViewType.REFERENCES,
      supportedViews: [
        ViewType.DEFINITION,
        ViewType.REFERENCES,
        ViewType.TYPE_HIERARCHY,
      ],
      description: '类型别名',
    };
  }

  // 类
  if (normalizedKind === 'class') {
    return {
      type: SymbolType.CLASS,
      canHaveCallGraph: false,
      defaultView: ViewType.TYPE_HIERARCHY,
      supportedViews: [
        ViewType.DEFINITION,
        ViewType.REFERENCES,
        ViewType.TYPE_HIERARCHY,
      ],
      description: '类定义',
    };
  }

  // 属性
  if (normalizedKind === 'property' || normalizedKind === 'field') {
    return {
      type: SymbolType.PROPERTY,
      canHaveCallGraph: false,
      defaultView: ViewType.REFERENCES,
      supportedViews: [ViewType.DEFINITION, ViewType.REFERENCES],
      description: '属性',
    };
  }

  // 变量/常量
  if (
    normalizedKind === 'variable' ||
    normalizedKind === 'const' ||
    normalizedKind === 'let' ||
    normalizedKind === 'var'
  ) {
    const isConst = normalizedKind === 'const';
    return {
      type: isConst ? SymbolType.CONSTANT : SymbolType.VARIABLE,
      canHaveCallGraph: false,
      defaultView: ViewType.REFERENCES,
      supportedViews: [ViewType.DEFINITION, ViewType.REFERENCES],
      description: isConst ? '常量' : '变量',
    };
  }

  // 默认情况
  return {
    type: SymbolType.UNKNOWN,
    canHaveCallGraph: false,
    defaultView: ViewType.DEFINITION,
    supportedViews: [ViewType.DEFINITION, ViewType.REFERENCES],
    description: `未知类型 (${kind})`,
  };
}

/**
 * 判断符号是否可以生成调用图
 *
 * @param kind - TypeScript 符号类型字符串
 * @returns 是否支持调用图
 */
export function canGenerateCallGraph(kind: string | undefined): boolean {
  const classification = classifySymbol(kind);
  return classification.canHaveCallGraph;
}

/**
 * 获取符号的默认视图类型
 *
 * @param kind - TypeScript 符号类型字符串
 * @returns 默认视图类型
 */
export function getDefaultView(kind: string | undefined): ViewType {
  const classification = classifySymbol(kind);
  return classification.defaultView;
}

/**
 * 获取符号的友好描述
 *
 * @param kind - TypeScript 符号类型字符串
 * @returns 符号的友好描述
 */
export function getSymbolDescription(kind: string | undefined): string {
  const classification = classifySymbol(kind);
  return classification.description;
}
