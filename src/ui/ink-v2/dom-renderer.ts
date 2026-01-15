/**
 * DOM Renderer - DOM 树渲染器
 * 用于将 Ink DOM 元素渲染到 Screen 缓冲区
 *
 * 从官方 Claude Code 源码逆向工程提取 (原名: DQ0)
 *
 * 关键功能：
 * 1. display:none 视觉伪影修复 - 当元素从可见变为 display:none 时清除屏幕痕迹
 * 2. 增量渲染优化 - 使用 blit 复制未变化的区域
 * 3. 脏区域清除 - 当元素位置/大小变化时清除旧区域
 */

import type {
  DOMElement,
  ElementRenderState,
  DOMRenderOptions,
  ScreenData,
  Region,
} from './types.js';
import { Display } from './types.js';
import type { Screen } from './screen.js';

/**
 * 元素渲染状态缓存
 * 官方实现: var G21 = new WeakMap
 * 用于追踪每个元素的之前渲染位置，以便在 display:none 时清除
 */
const elementRenderStateCache = new WeakMap<DOMElement, ElementRenderState>();

/**
 * 渲染 DOM 元素到 Screen
 * 官方实现: function DQ0(A, Q, {...})
 *
 * @param element - 要渲染的 DOM 元素
 * @param screen - 目标 Screen 缓冲区
 * @param options - 渲染选项
 */
export function renderDOMElement(
  element: DOMElement,
  screen: Screen,
  options: DOMRenderOptions = {}
): void {
  const {
    offsetX = 0,
    offsetY = 0,
    skipStaticElements = false,
    prevScreen,
    ink2 = false,
  } = options;

  // 跳过静态元素（如果需要）
  if (skipStaticElements && element.internal_static) {
    return;
  }

  const { yogaNode } = element;

  if (!yogaNode) {
    return;
  }

  // 关键修复: display:none 视觉伪影处理
  // 官方实现:
  // if(X.getDisplay() === OP.None) {
  //   if(J && A.dirty) {
  //     let F = G21.get(A);
  //     if(F) {
  //       Q.clear({x: Math.floor(F.x), y: Math.floor(F.y), width: Math.floor(F.width), height: Math.floor(F.height)});
  //       G21.delete(A);
  //     }
  //   }
  //   return;
  // }
  if (yogaNode.getDisplay() === Display.None) {
    if (ink2 && element.dirty) {
      const prevState = elementRenderStateCache.get(element);
      if (prevState) {
        // 清除元素之前占用的屏幕区域
        screen.clear({
          x: Math.floor(prevState.x),
          y: Math.floor(prevState.y),
          width: Math.floor(prevState.width),
          height: Math.floor(prevState.height),
        });
        // 删除缓存记录避免重复清除
        elementRenderStateCache.delete(element);
      }
    }
    return;
  }

  // 计算元素的绝对位置
  const x = offsetX + yogaNode.getComputedLeft();
  const y = offsetY + yogaNode.getComputedTop();
  const width = yogaNode.getComputedWidth();
  const height = yogaNode.getComputedHeight();

  // 获取之前的渲染状态
  const prevState = elementRenderStateCache.get(element);

  // 增量渲染优化: 如果元素未脏且位置/大小未变化，从上一帧复制
  // 官方实现:
  // if(J && !A.dirty && V && V.x === I && V.y === D && V.width === W && V.height === K && Y) {
  //   Q.blit(Y, {x: Math.floor(I), y: Math.floor(D), width: Math.floor(W), height: Math.floor(K)});
  //   return;
  // }
  if (
    ink2 &&
    !element.dirty &&
    prevState &&
    prevState.x === x &&
    prevState.y === y &&
    prevState.width === width &&
    prevState.height === height &&
    prevScreen
  ) {
    screen.blit(prevScreen, {
      x: Math.floor(x),
      y: Math.floor(y),
      width: Math.floor(width),
      height: Math.floor(height),
    });
    return;
  }

  // 脏区域清除: 当元素位置/大小变化时清除旧区域
  // 官方实现:
  // if(J && V && A.dirty) {
  //   let F = Math.floor(V.x), H = Math.floor(V.y), E = Math.floor(V.x + V.width), z = Math.floor(V.y + V.height);
  //   let $ = Math.floor(I), O = Math.floor(D), L = Math.floor(I + W), M = Math.floor(D + K);
  //   if(F !== $ || H !== O)
  //     Q.clear({x: F, y: H, width: Math.floor(V.width), height: Math.floor(V.height)});
  //   else {
  //     if(E > L) Q.clear({x: L, y: H, width: E - L, height: Math.floor(V.height)});
  //     if(z > M) Q.clear({x: F, y: M, width: Math.floor(V.width), height: z - M});
  //   }
  // }
  if (ink2 && prevState && element.dirty) {
    const prevX = Math.floor(prevState.x);
    const prevY = Math.floor(prevState.y);
    const prevRight = Math.floor(prevState.x + prevState.width);
    const prevBottom = Math.floor(prevState.y + prevState.height);

    const newX = Math.floor(x);
    const newY = Math.floor(y);
    const newRight = Math.floor(x + width);
    const newBottom = Math.floor(y + height);

    // 如果位置变化，清除整个旧区域
    if (prevX !== newX || prevY !== newY) {
      screen.clear({
        x: prevX,
        y: prevY,
        width: Math.floor(prevState.width),
        height: Math.floor(prevState.height),
      });
    } else {
      // 位置未变但大小变化，只清除多余的边缘区域
      // 右边缘缩小
      if (prevRight > newRight) {
        screen.clear({
          x: newRight,
          y: prevY,
          width: prevRight - newRight,
          height: Math.floor(prevState.height),
        });
      }
      // 下边缘缩小
      if (prevBottom > newBottom) {
        screen.clear({
          x: prevX,
          y: newBottom,
          width: Math.floor(prevState.width),
          height: prevBottom - newBottom,
        });
      }
    }
  }

  // 根据节点类型渲染
  if (element.nodeName === 'ink-text') {
    // 文本节点渲染（简化实现）
    // 官方实现包含文本换行、样式应用等复杂逻辑
    // 这里只是基本框架，实际文本渲染需要更多处理
    renderTextElement(element, screen, x, y);
  } else if (element.nodeName === 'ink-box') {
    // 盒子节点：处理 overflow 裁剪并递归渲染子节点
    const overflowX =
      element.style.overflowX === 'hidden' ||
      element.style.overflow === 'hidden';
    const overflowY =
      element.style.overflowY === 'hidden' ||
      element.style.overflow === 'hidden';
    const hasOverflow = overflowX || overflowY;

    if (hasOverflow) {
      // 设置裁剪区域
      const clipX1 = overflowX
        ? x + yogaNode.getComputedBorder(0) // Edge.Left = 0
        : undefined;
      const clipX2 = overflowX
        ? x + width - yogaNode.getComputedBorder(2) // Edge.Right = 2
        : undefined;
      const clipY1 = overflowY
        ? y + yogaNode.getComputedBorder(1) // Edge.Top = 1
        : undefined;
      const clipY2 = overflowY
        ? y + height - yogaNode.getComputedBorder(3) // Edge.Bottom = 3
        : undefined;

      screen.clip({ x1: clipX1, x2: clipX2, y1: clipY1, y2: clipY2 });
    }

    // 递归渲染子节点
    for (const child of element.childNodes) {
      renderDOMElement(child, screen, {
        offsetX: x,
        offsetY: y,
        skipStaticElements,
        prevScreen,
        ink2,
      });
    }

    if (hasOverflow) {
      screen.unclip();
    }

    // 渲染边框（如果有）
    renderBorder(x, y, element, screen);
  } else if (element.nodeName === 'ink-root') {
    // 根节点：直接递归渲染子节点
    for (const child of element.childNodes) {
      renderDOMElement(child, screen, {
        offsetX: x,
        offsetY: y,
        skipStaticElements,
        prevScreen,
        ink2,
      });
    }
  }

  // 更新元素渲染状态缓存
  // 官方实现: G21.set(A, {x: I, y: D, width: W, height: K})
  elementRenderStateCache.set(element, { x, y, width, height });

  // 清除脏标志
  // 官方实现: A.dirty = !1
  element.dirty = false;
}

/**
 * 渲染文本元素（简化实现）
 */
function renderTextElement(
  element: DOMElement,
  screen: Screen,
  x: number,
  y: number
): void {
  // 实际实现需要处理：
  // 1. 文本内容提取
  // 2. 样式应用
  // 3. 文本换行
  // 4. 超链接处理
  // 这里只是基本框架
}

/**
 * 渲染边框（简化实现）
 */
function renderBorder(
  x: number,
  y: number,
  element: DOMElement,
  screen: Screen
): void {
  // 官方实现: VNB(I, D, A, Q)
  // 实际需要处理边框字符和样式
}

/**
 * 获取元素的渲染状态缓存
 */
export function getElementRenderState(
  element: DOMElement
): ElementRenderState | undefined {
  return elementRenderStateCache.get(element);
}

/**
 * 设置元素的渲染状态缓存
 */
export function setElementRenderState(
  element: DOMElement,
  state: ElementRenderState
): void {
  elementRenderStateCache.set(element, state);
}

/**
 * 删除元素的渲染状态缓存
 */
export function deleteElementRenderState(element: DOMElement): boolean {
  return elementRenderStateCache.delete(element);
}

/**
 * 清除所有渲染状态缓存
 * 注意：WeakMap 不支持遍历，所以无法真正清除所有条目
 * 但当 element 被垃圾回收时，对应的缓存会自动清除
 */
export function clearElementRenderStateCache(): void {
  // WeakMap 会在 key 被垃圾回收时自动清除对应条目
  // 所以这里不需要手动清除
}

/**
 * 处理 display:none 转换
 * 当元素从可见变为 display:none 时调用，清除屏幕上的视觉痕迹
 *
 * @param element - 变为 display:none 的元素
 * @param screen - 目标 Screen 缓冲区
 * @returns 是否成功清除
 */
export function handleDisplayNoneTransition(
  element: DOMElement,
  screen: Screen
): boolean {
  const prevState = elementRenderStateCache.get(element);
  if (prevState) {
    screen.clear({
      x: Math.floor(prevState.x),
      y: Math.floor(prevState.y),
      width: Math.floor(prevState.width),
      height: Math.floor(prevState.height),
    });
    elementRenderStateCache.delete(element);
    return true;
  }
  return false;
}

/**
 * 批量处理多个元素的 display:none 转换
 *
 * @param elements - 变为 display:none 的元素数组
 * @param screen - 目标 Screen 缓冲区
 * @returns 成功清除的元素数量
 */
export function handleMultipleDisplayNoneTransitions(
  elements: DOMElement[],
  screen: Screen
): number {
  let count = 0;
  for (const element of elements) {
    if (handleDisplayNoneTransition(element, screen)) {
      count++;
    }
  }
  return count;
}
