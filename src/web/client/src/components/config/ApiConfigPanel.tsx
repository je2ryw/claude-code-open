/**
 * API 配置面板组件
 * 用于配置 Claude API 的高级参数
 */

import { useState, useEffect } from 'react';

/**
 * API 配置接口
 */
interface ApiConfig {
  /** Temperature 参数 (0-1) */
  temperature?: number;
  /** 最大输出 tokens */
  maxTokens?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 请求超时时间(ms) */
  requestTimeout?: number;
  /** API Provider */
  apiProvider?: 'anthropic' | 'bedrock' | 'vertex';
}

/**
 * 组件属性
 */
interface ApiConfigPanelProps {
  /** 保存回调 */
  onSave?: (config: ApiConfig) => void;
  /** 关闭回调 */
  onClose?: () => void;
}

/**
 * 验证配置的有效性
 */
function validateConfig(config: ApiConfig): string | null {
  // 验证 temperature
  if (config.temperature !== undefined) {
    if (config.temperature < 0 || config.temperature > 1) {
      return 'Temperature 必须在 0 到 1 之间';
    }
  }

  // 验证 maxTokens
  if (config.maxTokens !== undefined) {
    if (config.maxTokens < 1 || config.maxTokens > 200000) {
      return 'Max Output Tokens 必须在 1 到 200000 之间';
    }
  }

  // 验证 maxRetries
  if (config.maxRetries !== undefined) {
    if (config.maxRetries < 0 || config.maxRetries > 10) {
      return 'Max Retries 必须在 0 到 10 之间';
    }
  }

  // 验证 requestTimeout
  if (config.requestTimeout !== undefined) {
    if (config.requestTimeout < 1000 || config.requestTimeout > 600000) {
      return 'Request Timeout 必须在 1000 到 600000 毫秒之间';
    }
  }

  return null;
}

/**
 * API 配置面板组件
 */
export function ApiConfigPanel({ onSave, onClose }: ApiConfigPanelProps) {
  // 配置状态
  const [config, setConfig] = useState<ApiConfig>({
    temperature: 1.0,
    maxTokens: 32000,
    maxRetries: 3,
    requestTimeout: 300000,
    apiProvider: 'anthropic',
  });

  // 加载状态
  const [loading, setLoading] = useState(false);
  // 错误信息
  const [error, setError] = useState<string | null>(null);
  // 验证错误
  const [validationError, setValidationError] = useState<string | null>(null);

  /**
   * 加载当前配置
   */
  useEffect(() => {
    fetchCurrentConfig();
  }, []);

  /**
   * 从服务器获取当前配置
   */
  const fetchCurrentConfig = async () => {
    try {
      const response = await fetch('/api/config/api');
      const data = await response.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      setError('加载配置失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  /**
   * 保存配置
   */
  const handleSave = async () => {
    // 验证配置
    const validationErr = validateConfig(config);
    if (validationErr) {
      setValidationError(validationErr);
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/config/api', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await response.json();

      if (data.success) {
        onSave?.(config);
        setError(null);
      } else {
        setError(data.error || '保存失败');
      }
    } catch (err) {
      setError('保存配置失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 更新配置字段
   */
  const updateConfig = (field: keyof ApiConfig, value: any) => {
    setConfig({ ...config, [field]: value });
    setValidationError(null); // 清除验证错误
  };

  return (
    <div className="api-config-panel">
      <div className="settings-section">
        <h3>API Configuration</h3>
        <p className="settings-description">
          配置 Claude API 的高级参数，这些设置会影响 AI 的行为和性能。
        </p>

        {/* 错误消息 */}
        {(error || validationError) && (
          <div className="mcp-form-error">
            {validationError || error}
          </div>
        )}

        {/* 配置表单 */}
        <div className="config-form">
          {/* Temperature */}
          <div className="mcp-form-group">
            <label>
              Temperature (0-1)
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                className="mcp-form-input"
                value={config.temperature ?? 1.0}
                onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
              />
            </label>
            <span className="help-text">
              控制输出的随机性。较低的值 (0.0-0.3) 使输出更聚焦和确定，较高的值 (0.7-1.0) 使输出更有创造性和多样性。默认: 1.0
            </span>
          </div>

          {/* Max Output Tokens */}
          <div className="mcp-form-group">
            <label>
              Max Output Tokens (1-200000)
              <input
                type="number"
                min="1"
                max="200000"
                step="1000"
                className="mcp-form-input"
                value={config.maxTokens ?? 32000}
                onChange={(e) => updateConfig('maxTokens', parseInt(e.target.value, 10))}
              />
            </label>
            <span className="help-text">
              限制 AI 响应的最大长度（以 tokens 为单位）。较大的值允许更长的响应，但会消耗更多资源。默认: 32000
            </span>
          </div>

          {/* Max Retries */}
          <div className="mcp-form-group">
            <label>
              Max Retries (0-10)
              <input
                type="number"
                min="0"
                max="10"
                step="1"
                className="mcp-form-input"
                value={config.maxRetries ?? 3}
                onChange={(e) => updateConfig('maxRetries', parseInt(e.target.value, 10))}
              />
            </label>
            <span className="help-text">
              API 请求失败时的最大重试次数。设置为 0 则不重试。默认: 3
            </span>
          </div>

          {/* Request Timeout */}
          <div className="mcp-form-group">
            <label>
              Request Timeout (ms)
              <input
                type="number"
                min="1000"
                max="600000"
                step="1000"
                className="mcp-form-input"
                value={config.requestTimeout ?? 300000}
                onChange={(e) => updateConfig('requestTimeout', parseInt(e.target.value, 10))}
              />
            </label>
            <span className="help-text">
              API 请求的超时时间（毫秒）。超过此时间未响应将取消请求。默认: 300000 (5分钟)
            </span>
          </div>

          {/* API Provider */}
          <div className="mcp-form-group">
            <label>
              API Provider
              <select
                className="mcp-form-input"
                value={config.apiProvider ?? 'anthropic'}
                onChange={(e) => updateConfig('apiProvider', e.target.value as ApiConfig['apiProvider'])}
              >
                <option value="anthropic">Anthropic (Default)</option>
                <option value="bedrock">AWS Bedrock</option>
                <option value="vertex">Google Vertex AI</option>
              </select>
            </label>
            <span className="help-text">
              选择 Claude API 的提供商。不同的提供商可能有不同的功能和定价。
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="mcp-form-actions">
          {onClose && (
            <button
              className="mcp-btn-secondary mcp-btn"
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
          )}
          <button
            className="mcp-btn-primary mcp-btn"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApiConfigPanel;
