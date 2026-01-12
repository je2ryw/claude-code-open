import { useState, useCallback, useRef } from 'react';

export interface NavigationItem {
  id: string;
  type: 'symbol' | 'file' | 'map';
  label: string;
  timestamp: number;
}

/**
 * useNavigationHistory Hook
 *
 * 功能：管理导航历史（类似浏览器前进/后退）
 *
 * 特性：
 * - 支持前进/后退
 * - 自动限制历史大小
 * - 去重相邻重复项
 * - 分支导航（在历史中间跳转会删除后续历史）
 *
 * @param maxSize 最大历史记录数（默认50）
 */
export function useNavigationHistory(maxSize: number = 50) {
  const [state, setState] = useState<{
    history: NavigationItem[];
    currentIndex: number;
  }>({
    history: [],
    currentIndex: -1
  });

  // 使用 ref 来立即获取最新的状态，避免闭包问题
  const stateRef = useRef(state);
  stateRef.current = state;

  const push = useCallback((item: NavigationItem) => {
    setState(prev => {
      // 移除当前位置之后的所有历史
      let newHistory = prev.history.slice(0, prev.currentIndex + 1);

      // 如果与当前项相同，不添加
      if (newHistory.length > 0 && newHistory[newHistory.length - 1].id === item.id) {
        return prev;
      }

      // 添加新项
      newHistory.push(item);

      // 限制历史大小
      let newIndex = newHistory.length - 1;
      if (newHistory.length > maxSize) {
        newHistory = newHistory.slice(1);
        newIndex = maxSize - 1;
      }

      const newState = {
        history: newHistory,
        currentIndex: newIndex
      };

      // 立即更新 ref，以便后续的 back/forward 能读取到最新状态
      stateRef.current = newState;

      return newState;
    });
  }, [maxSize]);

  const back = useCallback(() => {
    const prevState = stateRef.current;

    if (prevState.currentIndex > 0) {
      const newIndex = prevState.currentIndex - 1;
      const item = prevState.history[newIndex];

      setState(prev => {
        const newState = {
          ...prev,
          currentIndex: newIndex
        };
        // 立即更新 ref
        stateRef.current = newState;
        return newState;
      });

      return item;
    }

    return null;
  }, []);

  const forward = useCallback(() => {
    const prevState = stateRef.current;

    if (prevState.currentIndex < prevState.history.length - 1) {
      const newIndex = prevState.currentIndex + 1;
      const item = prevState.history[newIndex];

      setState(prev => {
        const newState = {
          ...prev,
          currentIndex: newIndex
        };
        // 立即更新 ref
        stateRef.current = newState;
        return newState;
      });

      return item;
    }

    return null;
  }, []);

  const clear = useCallback(() => {
    setState({
      history: [],
      currentIndex: -1
    });
  }, []);

  const canGoBack = state.currentIndex > 0;
  const canGoForward = state.currentIndex < state.history.length - 1;
  const current = state.history[state.currentIndex] || null;

  return {
    history: state.history,
    currentIndex: state.currentIndex,
    push,
    back,
    forward,
    canGoBack,
    canGoForward,
    clear,
    current
  };
}
