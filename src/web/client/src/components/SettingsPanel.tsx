/**
 * 设置面板组件
 * 包含通用设置、模型选择、MCP 管理、插件管理和关于信息
 */

import { useState } from 'react';
import { McpPanel } from './McpPanel';
import { PluginsPanel } from './PluginsPanel';
import {
  ApiConfigPanel,
  PermissionsConfigPanel,
  HooksConfigPanel,
  SystemConfigPanel,
  ConfigImportExport,
} from './config';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  model: string;
  onModelChange: (model: string) => void;
  onSendMessage?: (message: any) => void;
}

type SettingsTab =
  | 'general'
  | 'model'
  | 'api'
  | 'permissions'
  | 'hooks'
  | 'system'
  | 'import-export'
  | 'mcp'
  | 'plugins'
  | 'about';

// Tab 配置
const TAB_CONFIG: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'model', label: 'Model', icon: '🤖' },
  { id: 'api', label: 'API Advanced', icon: '🔧' },
  { id: 'permissions', label: 'Permissions', icon: '🔐' },
  { id: 'hooks', label: 'Hooks', icon: '🪝' },
  { id: 'system', label: 'System', icon: '💾' },
  { id: 'import-export', label: 'Import/Export', icon: '📦' },
  { id: 'mcp', label: 'MCP', icon: '🔌' },
  { id: 'plugins', label: 'Plugins', icon: '🧩' },
  { id: 'about', label: 'About', icon: 'ℹ️' },
];

export function SettingsPanel({
  isOpen,
  onClose,
  model,
  onModelChange,
  onSendMessage,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="settings-section">
            <h3>General Settings</h3>
            <p className="settings-description">
              Configure general application settings.
            </p>
            <div className="setting-item">
              <label>Theme</label>
              <select className="setting-select" disabled>
                <option value="dark">Dark (Default)</option>
                <option value="light">Light</option>
              </select>
            </div>
            <div className="setting-item">
              <label>Language</label>
              <select className="setting-select" disabled>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div className="setting-item">
              <label>Auto-save Sessions</label>
              <select className="setting-select" disabled>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
        );

      case 'model':
        return (
          <div className="settings-section">
            <h3>Model Settings</h3>
            <p className="settings-description">
              Choose which Claude model to use for conversations.
            </p>
            <div className="setting-item">
              <label>Default Model</label>
              <select
                className="setting-select"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
              >
                <option value="opus">Claude Opus 4.5 (Most capable)</option>
                <option value="sonnet">Claude Sonnet 4.5 (Balanced)</option>
                <option value="haiku">Claude Haiku 4.5 (Fastest)</option>
              </select>
            </div>
            <div className="model-info">
              <div className="model-card">
                <h4>Claude Opus 4.5</h4>
                <p>
                  Most intelligent and capable model. Best for complex reasoning,
                  analysis, and creative tasks. Extended thinking capabilities.
                </p>
              </div>
              <div className="model-card">
                <h4>Claude Sonnet 4.5</h4>
                <p>
                  Balanced performance. Great for most coding tasks and general
                  assistance. Good speed-to-capability ratio.
                </p>
              </div>
              <div className="model-card">
                <h4>Claude Haiku 4.5</h4>
                <p>
                  Fastest and most cost-effective. Ideal for simple tasks and
                  quick responses.
                </p>
              </div>
            </div>
          </div>
        );

      case 'api':
        return (
          <ApiConfigPanel
            onSave={() => {
              // 配置保存后刷新
              console.log('API config saved');
            }}
            onClose={onClose}
          />
        );

      case 'permissions':
        return (
          <PermissionsConfigPanel
            onSave={() => {
              console.log('Permissions config saved');
            }}
            onClose={onClose}
          />
        );

      case 'hooks':
        return (
          <HooksConfigPanel
            onSave={() => {
              console.log('Hooks config saved');
            }}
            onClose={onClose}
          />
        );

      case 'system':
        return (
          <SystemConfigPanel
            onSave={() => {
              console.log('System config saved');
            }}
            onClose={onClose}
          />
        );

      case 'import-export':
        return <ConfigImportExport onClose={onClose} />;

      case 'mcp':
        return <McpPanel onClose={onClose} onSendMessage={onSendMessage} />;

      case 'plugins':
        return <PluginsPanel onClose={onClose} onSendMessage={onSendMessage} />;

      case 'about':
        return (
          <div className="settings-section">
            <h3>About Claude Code WebUI</h3>
            <p className="settings-description">
              An educational reverse-engineering project that recreates Claude Code CLI.
            </p>
            <div className="about-info">
              <p>
                <strong>Version:</strong> 2.1.4 (Educational)
              </p>
              <p>
                <strong>Repository:</strong> github.com/kill136/claude-code-open
              </p>
              <p>
                <strong>License:</strong> Educational Use Only
              </p>
            </div>
            <div className="about-disclaimer">
              <p>
                <strong>Disclaimer:</strong> This is NOT the official Claude Code
                source. It is a learning project based on public APIs and type
                definitions.
              </p>
            </div>

            <div className="about-features">
              <h4>Features</h4>
              <ul>
                <li>25+ integrated tools for file operations and code analysis</li>
                <li>Session management with persistence</li>
                <li>MCP (Model Context Protocol) server support</li>
                <li>Plugin system for extensibility</li>
                <li>Multi-model support (Opus, Sonnet, Haiku)</li>
                <li>File attachments and image support</li>
                <li>Slash commands for quick actions</li>
              </ul>
            </div>

            <div className="about-links">
              <h4>Useful Links</h4>
              <p>
                <a
                  href="https://docs.anthropic.com/en/docs/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Claude Code Documentation
                </a>
              </p>
              <p>
                <a
                  href="https://modelcontextprotocol.io/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MCP Documentation
                </a>
              </p>
              <p>
                <a
                  href="https://github.com/kill136/claude-code-open"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Repository
                </a>
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="settings-panel-overlay" onClick={handleOverlayClick}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            {TAB_CONFIG.map((tab) => (
              <div
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="settings-nav-icon">{tab.icon}</span>
                {tab.label}
              </div>
            ))}
          </nav>
          <div className="settings-content">{renderTabContent()}</div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
