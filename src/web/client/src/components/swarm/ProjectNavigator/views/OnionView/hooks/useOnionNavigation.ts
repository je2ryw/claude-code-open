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

// 生成缓存键（第三层和第四层需要包含 context）
function getCacheKey(layer: OnionLayer, contextNodeId?: string): string {
  // 第一层和第二层不需要 context，直接用 layer 作为键
  if (layer === OnionLayer.PROJECT_INTENT || layer === OnionLayer.BUSINESS_DOMAIN) {
    return `layer-${layer}`;
  }
  // 第三层和第四层需要 context
  return `layer-${layer}-${contextNodeId || 'default'}`;
}

// Hook 返回类型
export interface UseOnionNavigationReturn {
  /** 当前层级 */
  currentLayer: OnionLayer;
  /** 层级历史栈 */
  layerStack: OnionNavigationState['layerStack'];
  /** 各层级缓存数据 */
  layerData: OnionNavigationState['layerData'];
  /** 当前层级的数据（根据 context 获取正确的缓存） */
  currentLayerData: LayerData | undefined;
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
  drillDown: (targetLayer: OnionLayer, nodeId?: string) => Promise<void>;
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
  // 使用 cacheKey 作为键，而不是 layer，以支持同层级不同 context 的并发请求
  const pendingRequests = useRef<Set<string>>(new Set());

  /**
   * 获取层级数据
   */
  const fetchLayerData = useCallback(
    async (
      layer: OnionLayer,
      context?: DrillDownContext,
      forceRefresh: boolean = false
    ): Promise<LayerData | null> => {
      // 生成缓存键
      const cacheKey = getCacheKey(layer, context?.nodeId);

      // 检查缓存（非强制刷新时）
      // 注意：第三层和第四层的缓存键包含 context，所以不同的 nodeId 会使用不同的缓存
      if (!forceRefresh && layerData[cacheKey]) {
        return layerData[cacheKey] as LayerData;
      }

      // 防止重复请求（使用 cacheKey 而不是 layer，允许同层级不同 context 的并发请求）
      if (pendingRequests.current.has(cacheKey)) {
        return null;
      }

      pendingRequests.current.add(cacheKey);

      // 设置加载状态
      setLoading((prev) => ({ ...prev, [layer]: true }));
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[layer];
        return newErrors;
      });

      try {
        // 第四层需要 filePath 参数，如果没有则返回错误
        if (layer === OnionLayer.IMPLEMENTATION && !context?.nodeId) {
          throw new Error('请从第三层(关键流程)选择一个文件进入第四层');
        }

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

        // 第四层需要 filePath 参数（从第三层钻取时，nodeId 就是文件路径）
        if (layer === OnionLayer.IMPLEMENTATION && context?.nodeId) {
          params.append('filePath', context.nodeId);
        }

        const queryString = params.toString();
        if (queryString) {
          url += `?${queryString}`;
        }

        // 发起请求
        console.log(`[Onion] 请求层级 ${layer}`, { url, context });
        const response = await fetch(url);
        const result: OnionLayerResponse<LayerData> = await response.json();

        console.log(`[Onion] 层级 ${layer} 响应:`, result);

        if (!result.success || !result.data) {
          console.error(`[Onion] 层级 ${layer} 请求失败:`, result.error);
          throw new Error(result.error || '获取数据失败');
        }

        // 检查第三层数据
        if (layer === 3) {
          const keyProcessData = result.data as any;
          console.log(`[Onion] 第三层流程数量:`, keyProcessData?.processes?.length || 0);
          if (!keyProcessData?.processes?.length) {
            console.warn('[Onion] 第三层没有流程数据！');
          }
        }

        // 更新缓存（使用 cacheKey）
        setLayerData((prev) => ({
          ...prev,
          [cacheKey]: result.data,
        }));

        return result.data;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        setErrors((prev) => ({ ...prev, [layer]: errorMessage }));
        return null;
      } finally {
        pendingRequests.current.delete(cacheKey);
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
   * @param targetLayer 目标层级
   * @param nodeId 可选的节点ID（用于聚焦）
   */
  const drillDown = useCallback(
    async (targetLayer: OnionLayer, nodeId?: string) => {
      // 构建上下文
      const context: DrillDownContext = {
        fromLayer: currentLayer,
        nodeId: nodeId || '',
      };

      // 获取数据
      await fetchLayerData(targetLayer, context, false);

      // 更新当前层级
      setCurrentLayer(targetLayer);
      setCurrentFocusId(nodeId);

      // 添加到历史栈
      setLayerStack((prev) => [
        ...prev,
        { layer: targetLayer, focusId: nodeId, timestamp: Date.now() },
      ]);
    },
    [fetchLayerData, currentLayer]
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

    // 如果没有缓存数据，重新获取（使用正确的缓存键）
    const cacheKey = getCacheKey(previousEntry.layer, previousEntry.focusId);
    if (!layerData[cacheKey]) {
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

  // 计算当前层级的数据（根据 context 获取正确的缓存）
  const currentCacheKey = getCacheKey(currentLayer, currentFocusId);
  const currentLayerData = layerData[currentCacheKey] as LayerData | undefined;

  return {
    currentLayer,
    layerStack,
    layerData,
    currentLayerData,
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
