import { useState, useEffect } from 'react';
import './CliSpinner.css';

// 官方 CLI 风格的 spinner 帧
const SPINNER_FRAMES = ['●', '○', '◐', '◑'];
const SPINNER_INTERVAL = 100; // ms

interface CliSpinnerProps {
  /** 是否正在加载 */
  loading?: boolean;
  /** spinner 的颜色样式 */
  variant?: 'default' | 'success' | 'warning' | 'error';
  /** 自定义类名 */
  className?: string;
}

export function CliSpinner({ loading = true, variant = 'default', className = '' }: CliSpinnerProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, SPINNER_INTERVAL);

    return () => clearInterval(interval);
  }, [loading]);

  if (!loading) {
    // 显示静态状态符号
    return (
      <span className={`cli-spinner cli-spinner--${variant} cli-spinner--static ${className}`}>
        {variant === 'success' ? '✓' : variant === 'error' ? '✗' : '●'}
      </span>
    );
  }

  return (
    <span className={`cli-spinner cli-spinner--${variant} ${className}`}>
      {SPINNER_FRAMES[frameIndex]}
    </span>
  );
}

// 官方 CLI 风格的状态指示器
interface CliStatusIndicatorProps {
  status: 'running' | 'completed' | 'error' | 'pending';
  showSpinner?: boolean;
}

export function CliStatusIndicator({ status, showSpinner = true }: CliStatusIndicatorProps) {
  if (status === 'running' && showSpinner) {
    return <CliSpinner loading variant="default" />;
  }

  const statusMap = {
    running: { icon: '●', className: 'running' },
    completed: { icon: '✓', className: 'success' },
    error: { icon: '✗', className: 'error' },
    pending: { icon: '○', className: 'pending' },
  };

  const { icon, className } = statusMap[status] || statusMap.pending;

  return (
    <span className={`cli-status-indicator cli-status-indicator--${className}`}>
      {icon}
    </span>
  );
}
