/**
 * useOnionNavigation - 洋葱导航状态管理 Hook
 *
 * 功能：
 * - 管理当前层级状态
 * - 管理层级历史栈
 * - 提供层级导航方法
 * - 调用 API 获取层级数据
 * - 管理加载和错误状态
 */

import { useState, useCallback, useRef } from 'react';
import {
  OnionLayer,
  OnionNavigationState,
  ProjectIntentData,
  BusinessDomainData,
  KeyProcessData,
  ImplementationData,
  OnionLayerResponse,
} from '../../../../../../../../../web/shared/onion-types';

// 层级数据联合类型
type LayerData = ProjectIntentData | BusinessDomainData | KeyProcessData | ImplementationData;

// 层级上下文，用于向下钻取时传递信息
export interface DrillDownContext {
  fromLayer: OnionLayer;
  nodeId: string;
  nodeName?: string;
}

// Hook 返回类型
export interface UseOnionNavigationReturn {
  /** 当前层级 */
  currentLayer: OnionLayer;
  /** 层级历史栈 */
  layerStack: OnionNavigationState['layerStack'];
  /** 各层级缓存数据 */
  layerData: OnionNavigationState['layerData'];
  /** 各层级加载状态 */
  loading: OnionNavigationState['loading'];
  /** 各层级错误状态 */
  errors: OnionNavigationState['errors'];
  /** 是否可以返回 */
  canGoBack: boolean;
  /** 当前聚焦的节点 ID */
  currentFocusId?: string;

  // 导航方法
  /** 直接跳转到指定层级 */
  navigateToLayer: (layer: OnionLayer, forceRefresh?: boolean) => Promise<void>;
  /** 向下钻取（进入下一层） */
  drillDown: (context: DrillDownContext) => Promise<void>;
  /** 返回上一层 */
  goBack: () => Promise<void>;
  /** 刷新当前层级数据 */
  refreshLayer: () => Promise<void>;
  /** 清除错误状态 */
  clearError: (layer?: OnionLayer) => void;
}

/**
 * 洋葱导航 Hook
 */
export function useOnionNavigation(initialLayer: OnionLayer = OnionLayer.PROJECT_INTENT): UseOnionNavigationReturn {
  // 当前层级
  const [currentLayer, setCurrentLayer] = useState<OnionLayer>(initialLayer);

  // 层级历史栈
  const [layerStack, setLayerStack] = useState<OnionNavigationState['layerStack']>([
    { layer: initialLayer, timestamp: Date.now() },
  ]);

  // 各层级数据缓存
  const [layerData, setLayerData] = useState<OnionNavigationState['layerData']>({});

  // 加载状态
  const [loading, setLoading] = useState<OnionNavigationState['loading']>({});

  // 错误状态
  const [errors, setErrors] = useState<OnionNavigationState['errors']>({});

  // 当前聚焦的节点 ID
  const [currentFocusId, setCurrentFocusId] = useState<string | undefined>();

  // 用于防止重复请求
  const pendingRequests = useRef<Set<OnionLayer>>(new Set());

  /**
   * 获取层级数据
   */
  const fetchLayerData = useCallback(
    async (
      layer: OnionLayer,
      context?: DrillDownContext,
      forceRefresh: boolean = false
    ): Promise<LayerData | null> => {
      // 检查缓存（非强制刷新时）
      if (!forceRefresh && layerData[layer]) {
        return layerData[layer] as LayerData;
      }

      // 防止重复请求
      if (pendingRequests.current.has(layer)) {
        return null;
      }

      pendingRequests.current.add(layer);

      // 设置加载状态
      setLoading((prev) => ({ ...prev, [layer]: true }));
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[layer];
        return newErrors;
      });

      try {
        // 构建 URL
        let url = `/api/blueprint/onion/layer/${layer}`;
        const params = new URLSearchParams();

        if (forceRefresh) {
          params.append('forceRefresh', 'true');
        }

        if (context) {
          params.append('fromLayer', String(context.fromLayer));
          params.append('nodeId', context.nodeId);
        }

        const queryString = params.toString();
        if (queryString) {
          url += `?${queryString}`;
        }

        // 发起请求
        const response = await fetch(url);
        const result: OnionLayerResponse<LayerData> = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || '获取数据失败');
        }

        // 更新缓存
        setLayerData((prev) => ({
          ...prev,
          [layer]: result.data,
        }));

        return result.data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        setErrors((prev) => ({ ...prev, [layer]: errorMessage }));
        return null;
      } finally {
        pendingRequests.current.delete(layer);
        setLoading((prev) => ({ ...prev, [layer]: false }));
      }
    },
    [layerData]
  );

  /**
   * 直接跳转到指定层级
   */
  const navigateToLayer = useCallback(
    async (layer: OnionLayer, forceRefresh: boolean = false) => {
      // 获取数据
      await fetchLayerData(layer, undefined, forceRefresh);

      // 更新当前层级
      setCurrentLayer(layer);
      setCurrentFocusId(undefined);

      // 重置历史栈为目标层级
      setLayerStack([{ layer, timestamp: Date.now() }]);
    },
    [fetchLayerData]
  );

  /**
   * 向下钻取
   */
  const drillDown = useCallback(
    async (context: DrillDownContext) => {
      // 计算目标层级（下一层）
      const targetLayer = Math.min(context.fromLayer + 1, OnionLayer.IMPLEMENTATION) as OnionLayer;

      // 获取数据
      await fetchLayerData(targetLayer, context, false);

      // 更新当前层级
      setCurrentLayer(targetLayer);
      setCurrentFocusId(context.nodeId);

      // 添加到历史栈
      setLayerStack((prev) => [
        ...prev,
        { layer: targetLayer, focusId: context.nodeId, timestamp: Date.now() },
      ]);
    },
    [fetchLayerData]
  );

  /**
   * 返回上一层
   */
  const goBack = useCallback(async () => {
    if (layerStack.length <= 1) {
      return; // 已经是第一层，无法返回
    }

    // 弹出当前层
    const newStack = layerStack.slice(0, -1);
    const previousEntry = newStack[newStack.length - 1];

    // 更新状态
    setLayerStack(newStack);
    setCurrentLayer(previousEntry.layer);
    setCurrentFocusId(previousEntry.focusId);

    // 如果没有缓存数据，重新获取
    if (!layerData[previousEntry.layer]) {
      await fetchLayerData(previousEntry.layer);
    }
  }, [layerStack, layerData, fetchLayerData]);

  /**
   * 刷新当前层级
   */
  const refreshLayer = useCallback(async () => {
    // 获取当前栈顶的上下文
    const currentEntry = layerStack[layerStack.length - 1];
    const previousEntry = layerStack.length > 1 ? layerStack[layerStack.length - 2] : undefined;

    const context: DrillDownContext | undefined = previousEntry
      ? { fromLayer: previousEntry.layer, nodeId: currentEntry.focusId || '' }
      : undefined;

    await fetchLayerData(currentLayer, context, true);
  }, [currentLayer, layerStack, fetchLayerData]);

  /**
   * 清除错误状态
   */
  const clearError = useCallback((layer?: OnionLayer) => {
    if (layer !== undefined) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[layer];
        return newErrors;
      });
    } else {
      setErrors({});
    }
  }, []);

  // 计算是否可以返回
  const canGoBack = layerStack.length > 1;

  return {
    currentLayer,
    layerStack,
    layerData,
    loading,
    errors,
    canGoBack,
    currentFocusId,

    navigateToLayer,
    drillDown,
    goBack,
    refreshLayer,
    clearError,
  };
}

export default useOnionNavigation;
