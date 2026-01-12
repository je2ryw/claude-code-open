import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '../types';

export interface UseWebSocketReturn {
  connected: boolean;
  sessionId: string | null;
  model: string;
  setModel: (model: string) => void;
  send: (message: unknown) => void;
  addMessageHandler: (handler: (msg: WSMessage) => void) => () => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [model, setModel] = useState('sonnet');
  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<Array<(msg: WSMessage) => void>>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 追踪组件是否已卸载，防止 React 18 Strict Mode 导致的重复连接问题
  const isMountedRef = useRef(true);
  // 追踪是否正在连接中
  const isConnectingRef = useRef(false);
  // 保存 URL ref，避免 useCallback 依赖变化导致重新连接
  const urlRef = useRef(url);
  urlRef.current = url;

  const connect = useCallback(() => {
    // 防止重复连接
    if (isConnectingRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;
    if (!isMountedRef.current) return;

    isConnectingRef.current = true;
    const ws = new WebSocket(urlRef.current);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectingRef.current = false;
      // 如果组件已卸载，立即关闭连接
      if (!isMountedRef.current) {
        ws.close();
        return;
      }
      console.log('WebSocket connected');
      setConnected(true);

      // 定期发送 ping 保持连接
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      // 如果组件已卸载，忽略消息
      if (!isMountedRef.current) return;

      try {
        const message = JSON.parse(event.data) as WSMessage;

        // 忽略 pong 消息
        if (message.type === 'pong') return;

        messageHandlersRef.current.forEach(handler => handler(message));

        if (message.type === 'connected') {
          const payload = message.payload as { sessionId: string; model: string };
          setSessionId(payload.sessionId);
          setModel(payload.model);
        }

        // 处理会话切换 - 更新 sessionId
        if (message.type === 'session_switched') {
          const payload = message.payload as { sessionId: string };
          setSessionId(payload.sessionId);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      // 如果组件已卸载，不输出日志和重连
      if (!isMountedRef.current) return;

      console.log('WebSocket disconnected');
      setConnected(false);

      // 清除 ping 定时器
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // 只有在组件仍然挂载时才尝试重连
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      isConnectingRef.current = false;
      // 如果组件已卸载，不输出错误日志
      if (!isMountedRef.current) return;
      console.error('WebSocket error:', error);
    };
  }, []); // 移除 url 依赖，使用 ref 代替

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      // 标记组件为已卸载，阻止所有回调执行
      isMountedRef.current = false;
      isConnectingRef.current = false;

      // 清理定时器
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // 清理 WebSocket 连接
      if (wsRef.current) {
        const ws = wsRef.current;
        // 移除所有事件监听器，防止回调被触发
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        // 关闭连接
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const addMessageHandler = useCallback((handler: (msg: WSMessage) => void) => {
    messageHandlersRef.current.push(handler);
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter(h => h !== handler);
    };
  }, []);

  const handleModelChange = useCallback((newModel: string) => {
    setModel(newModel);
    // 发送模型切换消息到服务器
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_model', payload: { model: newModel } }));
    }
  }, []);

  return { connected, sessionId, model, setModel: handleModelChange, send, addMessageHandler };
}
