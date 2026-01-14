/**
 * JSDoc/TSDoc 注释解析器
 * 从代码中提取用户编写的注释，用于悬浮提示显示
 */

// JSDoc 解析结果
export interface ParsedJSDoc {
  description: string;           // 主要描述
  params: JSDocParam[];          // @param 参数
  returns?: JSDocReturn;         // @returns 返回值
  throws?: string[];             // @throws 异常
  examples?: string[];           // @example 示例
  deprecated?: string;           // @deprecated 弃用说明
  see?: string[];                // @see 参考
  since?: string;                // @since 版本
  author?: string;               // @author 作者
  tags: Map<string, string>;     // 其他标签
}

export interface JSDocParam {
  name: string;
  type?: string;
  description: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface JSDocReturn {
  type?: string;
  description: string;
}

// 注释缓存：文件路径 -> 行号 -> 解析结果
const commentCache = new Map<string, Map<number, ParsedJSDoc>>();

/**
 * 解析 JSDoc 注释块
 */
export function parseJSDoc(commentBlock: string): ParsedJSDoc {
  const result: ParsedJSDoc = {
    description: '',
    params: [],
    tags: new Map(),
  };

  if (!commentBlock) return result;

  // 移除注释边界符号
  const cleaned = commentBlock
    .replace(/^\/\*\*\s*/, '')
    .replace(/\s*\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();

  const lines = cleaned.split('\n');
  let currentTag = '';
  let currentContent: string[] = [];
  let descriptionLines: string[] = [];
  let inDescription = true;

  for (const line of lines) {
    const tagMatch = line.match(/^@(\w+)\s*(.*)?$/);

    if (tagMatch) {
      // 保存之前的内容
      if (inDescription) {
        result.description = descriptionLines.join(' ').trim();
        inDescription = false;
      } else if (currentTag) {
        processTag(result, currentTag, currentContent.join(' ').trim());
      }

      currentTag = tagMatch[1];
      currentContent = tagMatch[2] ? [tagMatch[2]] : [];
    } else if (inDescription) {
      descriptionLines.push(line);
    } else if (currentTag) {
      currentContent.push(line);
    }
  }

  // 处理最后一个标签
  if (inDescription) {
    result.description = descriptionLines.join(' ').trim();
  } else if (currentTag) {
    processTag(result, currentTag, currentContent.join(' ').trim());
  }

  return result;
}

/**
 * 处理单个 JSDoc 标签
 */
function processTag(result: ParsedJSDoc, tag: string, content: string): void {
  switch (tag) {
    case 'param':
    case 'arg':
    case 'argument': {
      // 匹配: {type} name - description 或 {type} name description 或 name - description
      const paramMatch = content.match(
        /^(?:\{([^}]+)\}\s+)?(\[)?(\w+)(?:\s*=\s*([^\]]+))?\]?\s*[-–]?\s*(.*)$/
      );
      if (paramMatch) {
        result.params.push({
          type: paramMatch[1],
          optional: !!paramMatch[2],
          name: paramMatch[3],
          defaultValue: paramMatch[4],
          description: paramMatch[5] || '',
        });
      }
      break;
    }

    case 'returns':
    case 'return': {
      const returnMatch = content.match(/^(?:\{([^}]+)\}\s+)?(.*)$/);
      if (returnMatch) {
        result.returns = {
          type: returnMatch[1],
          description: returnMatch[2] || '',
        };
      }
      break;
    }

    case 'throws':
    case 'exception': {
      result.throws = result.throws || [];
      result.throws.push(content);
      break;
    }

    case 'example': {
      result.examples = result.examples || [];
      result.examples.push(content.trim());
      break;
    }

    case 'deprecated': {
      result.deprecated = content || '此功能已弃用';
      break;
    }

    case 'see': {
      result.see = result.see || [];
      result.see.push(content);
      break;
    }

    case 'since': {
      result.since = content;
      break;
    }

    case 'author': {
      result.author = content;
      break;
    }

    default:
      result.tags.set(tag, content);
  }
}

/**
 * 从代码内容中提取指定行号上方的 JSDoc 注释
 */
export function extractJSDocForLine(
  content: string,
  targetLine: number,
  filePath?: string
): ParsedJSDoc | null {
  // 检查缓存
  if (filePath) {
    const fileCache = commentCache.get(filePath);
    if (fileCache?.has(targetLine)) {
      return fileCache.get(targetLine)!;
    }
  }

  const lines = content.split('\n');
  let commentBlock = '';
  let inComment = false;
  let commentStartLine = -1;

  // 从目标行向上查找 JSDoc 注释
  for (let i = targetLine - 2; i >= 0 && i >= targetLine - 20; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.endsWith('*/')) {
      inComment = true;
      commentBlock = trimmed + '\n' + commentBlock;
    } else if (inComment) {
      commentBlock = trimmed + '\n' + commentBlock;
      if (trimmed.startsWith('/**')) {
        commentStartLine = i;
        break;
      }
    } else if (trimmed === '' || trimmed.startsWith('//')) {
      // 空行或单行注释，继续向上查找
      continue;
    } else {
      // 遇到其他代码，停止
      break;
    }
  }

  if (!commentBlock || commentStartLine === -1) {
    return null;
  }

  const parsed = parseJSDoc(commentBlock);

  // 缓存结果
  if (filePath) {
    if (!commentCache.has(filePath)) {
      commentCache.set(filePath, new Map());
    }
    commentCache.get(filePath)!.set(targetLine, parsed);
  }

  return parsed;
}

/**
 * 从代码内容中提取所有符号的 JSDoc 注释
 * 返回 Map<行号, JSDoc>
 */
export function extractAllJSDocs(content: string, filePath?: string): Map<number, ParsedJSDoc> {
  const result = new Map<number, ParsedJSDoc>();
  const lines = content.split('\n');

  // 用于匹配符号定义的正则
  const symbolPatterns = [
    /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/,
    /^\s*(?:export\s+)?interface\s+(\w+)/,
    /^\s*(?:export\s+)?type\s+(\w+)/,
    /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^\s*(?:export\s+)?const\s+(\w+)/,
    /^\s*(?:export\s+)?let\s+(\w+)/,
    /^\s*(?:public|private|protected)?\s*(?:static)?\s*(?:readonly)?\s*(?:async)?\s*(\w+)\s*[:(]/,
  ];

  let currentComment = '';
  let commentStartLine = -1;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 检测注释开始
    if (trimmed.startsWith('/**')) {
      inComment = true;
      commentStartLine = i;
      currentComment = trimmed;
      if (trimmed.endsWith('*/')) {
        inComment = false;
      }
      continue;
    }

    // 在注释中
    if (inComment) {
      currentComment += '\n' + trimmed;
      if (trimmed.endsWith('*/')) {
        inComment = false;
      }
      continue;
    }

    // 检测符号定义（在注释后的第一个非空行）
    if (currentComment && trimmed && !trimmed.startsWith('//')) {
      for (const pattern of symbolPatterns) {
        if (pattern.test(line)) {
          const parsed = parseJSDoc(currentComment);
          if (parsed.description || parsed.params.length > 0) {
            result.set(i + 1, parsed); // 行号从 1 开始
          }
          break;
        }
      }
      currentComment = '';
      commentStartLine = -1;
    }
  }

  // 缓存整个文件
  if (filePath) {
    commentCache.set(filePath, result);
  }

  return result;
}

/**
 * 清除文件缓存（文件修改时调用）
 */
export function clearJSDocCache(filePath: string): void {
  commentCache.delete(filePath);
}

/**
 * 清除所有缓存
 */
export function clearAllJSDocCache(): void {
  commentCache.clear();
}

/**
 * 格式化 JSDoc 为简短描述（用于悬浮提示）
 */
export function formatJSDocBrief(jsdoc: ParsedJSDoc): string {
  let brief = jsdoc.description;

  // 如果描述太长，截取第一句
  if (brief.length > 100) {
    const firstSentence = brief.match(/^[^.。!！?？]+[.。!！?？]?/);
    if (firstSentence) {
      brief = firstSentence[0];
    } else {
      brief = brief.substring(0, 97) + '...';
    }
  }

  // 添加弃用警告
  if (jsdoc.deprecated) {
    brief = `⚠️ 已弃用: ${jsdoc.deprecated}\n${brief}`;
  }

  return brief;
}

/**
 * 格式化参数列表（用于悬浮提示）
 */
export function formatJSDocParams(jsdoc: ParsedJSDoc): string[] {
  return jsdoc.params.map(p => {
    let str = p.name;
    if (p.type) str += `: ${p.type}`;
    if (p.optional) str = `[${str}]`;
    if (p.defaultValue) str += ` = ${p.defaultValue}`;
    if (p.description) str += ` - ${p.description}`;
    return str;
  });
}

/**
 * 检查是否有有意义的 JSDoc（不只是空注释）
 */
export function hasValidJSDoc(jsdoc: ParsedJSDoc | null): boolean {
  if (!jsdoc) return false;
  return !!(
    jsdoc.description ||
    jsdoc.params.length > 0 ||
    jsdoc.returns ||
    jsdoc.deprecated ||
    jsdoc.examples?.length
  );
}
