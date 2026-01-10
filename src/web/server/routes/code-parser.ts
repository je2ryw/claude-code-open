/**
 * 轻量级代码解析器
 * 用于快速提取函数、类、方法等符号信息
 * 不依赖 AST，使用正则表达式
 */

import type { FunctionNode, ClassNode, MethodNode, LocationInfo } from '../../../map/types.js';

/**
 * 解析 TypeScript/JavaScript 代码
 */
export function parseTypeScriptCode(content: string, filePath: string): {
  functions: FunctionNode[];
  classes: ClassNode[];
} {
  const lines = content.split('\n');
  const functions: FunctionNode[] = [];
  const classes: ClassNode[] = [];

  // 正则表达式
  const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(<[^>]*>)?\s*\(/;
  const arrowFunctionRegex = /^(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/;
  const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;
  const methodRegex = /^\s+(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/;
  const constructorRegex = /^\s+constructor\s*\(/;

  let currentClass: ClassNode | null = null;
  let classStartLine = -1;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;
    const trimmedLine = line.trim();

    // 跳过注释
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
      continue;
    }

    // 解析类
    const classMatch = line.match(classRegex);
    if (classMatch && !currentClass) {
      const className = classMatch[1];
      currentClass = {
        id: `${filePath}::${className}`,
        name: className,
        isAbstract: line.includes('abstract'),
        isExported: line.includes('export'),
        methods: [],
        properties: [],
        location: {
          file: filePath,
          startLine: lineNumber,
          startColumn: 0,
          endLine: lineNumber, // 暂时设为相同，后面更新
          endColumn: 0,
        },
      };
      classStartLine = i;
      braceCount = 0;
      continue;
    }

    // 在类内部
    if (currentClass && classStartLine >= 0) {
      // 计算大括号
      for (const char of line) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }

      // 类结束
      if (braceCount < 0) {
        currentClass.location.endLine = lineNumber;
        classes.push(currentClass);
        currentClass = null;
        classStartLine = -1;
        continue;
      }

      // 解析构造函数
      const constructorMatch = line.match(constructorRegex);
      if (constructorMatch) {
        const method: MethodNode = {
          id: `${currentClass.id}::constructor`,
          name: 'constructor',
          className: currentClass.name,
          signature: 'constructor',
          parameters: [],
          isAsync: false,
          isGenerator: false,
          isExported: currentClass.isExported,
          visibility: 'public',
          isStatic: false,
          isAbstract: false,
          isOverride: false,
          location: {
            file: filePath,
            startLine: lineNumber,
            startColumn: 0,
            endLine: lineNumber + 10, // 估算
            endColumn: 0,
          },
          calls: [],
          calledBy: [],
        };
        currentClass.methods.push(method);
        continue;
      }

      // 解析方法
      const methodMatch = line.match(methodRegex);
      if (methodMatch && !line.includes('=') && braceCount > 0) {
        const methodName = methodMatch[1];
        // 跳过 getter/setter 等关键字
        if (['get', 'set', 'static', 'async', 'private', 'protected', 'public'].includes(methodName)) {
          continue;
        }

        const method: MethodNode = {
          id: `${currentClass.id}::${methodName}`,
          name: methodName,
          className: currentClass.name,
          signature: trimmedLine.substring(0, Math.min(100, trimmedLine.length)),
          parameters: [],
          isAsync: line.includes('async'),
          isGenerator: false,
          isExported: currentClass.isExported,
          visibility: line.includes('private') ? 'private' : line.includes('protected') ? 'protected' : 'public',
          isStatic: line.includes('static'),
          isAbstract: line.includes('abstract'),
          isOverride: false,
          location: {
            file: filePath,
            startLine: lineNumber,
            startColumn: 0,
            endLine: lineNumber + 10, // 估算
            endColumn: 0,
          },
          calls: [],
          calledBy: [],
        };
        currentClass.methods.push(method);
      }
      continue;
    }

    // 解析顶层函数
    const functionMatch = line.match(functionRegex);
    if (functionMatch) {
      const funcName = functionMatch[1];
      const func: FunctionNode = {
        id: `${filePath}::${funcName}`,
        name: funcName,
        signature: trimmedLine.substring(0, Math.min(100, trimmedLine.length)),
        parameters: [],
        isAsync: line.includes('async'),
        isGenerator: false,
        isExported: line.includes('export'),
        location: {
          file: filePath,
          startLine: lineNumber,
          startColumn: 0,
          endLine: lineNumber + 20, // 估算
          endColumn: 0,
        },
        calls: [],
        calledBy: [],
      };
      functions.push(func);
      continue;
    }

    // 解析箭头函数
    const arrowMatch = line.match(arrowFunctionRegex);
    if (arrowMatch) {
      const funcName = arrowMatch[1];
      const func: FunctionNode = {
        id: `${filePath}::${funcName}`,
        name: funcName,
        signature: trimmedLine.substring(0, Math.min(100, trimmedLine.length)),
        parameters: [],
        isAsync: line.includes('async'),
        isGenerator: false,
        isExported: line.includes('export'),
        location: {
          file: filePath,
          startLine: lineNumber,
          startColumn: 0,
          endLine: lineNumber + 20, // 估算
          endColumn: 0,
        },
        calls: [],
        calledBy: [],
      };
      functions.push(func);
    }
  }

  // 如果类没有正常结束（最后一个类）
  if (currentClass) {
    currentClass.location.endLine = lines.length;
    classes.push(currentClass);
  }

  return { functions, classes };
}
