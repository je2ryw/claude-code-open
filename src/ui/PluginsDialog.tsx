/**
 * 插件管理 UI 组件
 * 完全对齐官方 Claude Code 的交互式界面
 *
 * 功能：
 * - Discover: 发现可用插件（从 Marketplace 获取）
 * - Installed: 显示已安装插件
 * - Marketplaces: 管理插件市场
 * - Errors: 显示错误信息
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 图标常量
const ICONS = {
  tick: '✓',
  cross: '✗',
  radioOn: '●',
  radioOff: '○',
  pointer: '❯',
  arrowUp: '↑',
  arrowDown: '↓',
  bullet: '•',
  ellipsis: '…',
  warning: '⚠',
};

// Tab 定义
type TabId = 'discover' | 'installed' | 'marketplaces' | 'errors';

const TAB_LABELS: Record<TabId, string> = {
  discover: 'Discover',
  installed: 'Installed',
  marketplaces: 'Marketplaces',
  errors: 'Errors',
};

const TAB_ORDER: TabId[] = ['discover', 'installed', 'marketplaces', 'errors'];

// 插件接口定义
interface PluginEntry {
  name: string;
  description?: string;
  version?: string;
  author?: string | { name: string };
  homepage?: string;
  tags?: string[];
  source?: {
    github?: string;
    git?: string;
    local?: string;
  };
}

interface MarketplacePlugin {
  pluginId: string;
  entry: PluginEntry;
  marketplaceName: string;
}

interface InstalledPlugin {
  name: string;
  version: string;
  description?: string;
  marketplaceName?: string;
  installPath: string;
  installedAt?: string;
}

interface Marketplace {
  name: string;
  source: string;
  pluginCount: number;
  autoUpdate?: boolean;
  installedPlugins?: InstalledPlugin[];
  pendingUpdate?: boolean;
  lastUpdated?: string;
}

interface PluginError {
  pluginId: string;
  message: string;
  timestamp: string;
}

interface PluginsDialogProps {
  onDone: () => void;
  cwd?: string;
}

// 格式化安装数
function formatInstalls(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

// 搜索输入框组件
function SearchInput({
  query,
  isFocused,
  width,
}: {
  query: string;
  isFocused: boolean;
  width: number;
}): React.ReactElement {
  const placeholder = 'Type to search...';
  const displayText = query || (isFocused ? '' : placeholder);
  const cursor = isFocused ? '▋' : '';

  return (
    <Box>
      <Text dimColor={!query && !isFocused}>
        {ICONS.radioOff} {displayText}{cursor}
      </Text>
    </Box>
  );
}

// Tab 栏组件
function TabBar({
  tabs,
  selectedTab,
  onTabChange,
}: {
  tabs: TabId[];
  selectedTab: TabId;
  onTabChange: (tab: TabId) => void;
}): React.ReactElement {
  return (
    <Box flexDirection="row" gap={2} marginBottom={1}>
      {tabs.map((tab) => (
        <Text
          key={tab}
          bold={selectedTab === tab}
          color={selectedTab === tab ? 'cyan' : undefined}
          inverse={selectedTab === tab}
        >
          {' '}{TAB_LABELS[tab]}{' '}
        </Text>
      ))}
      <Text dimColor>(tab to cycle)</Text>
    </Box>
  );
}

// Discover Tab 组件
function DiscoverTab({
  plugins,
  installCounts,
  selectedPlugins,
  loadingPlugins,
  onSelect,
  onDeselect,
  onViewDetails,
  onInstall,
  searchQuery,
  onSearchChange,
  error,
  noMarketplaces,
}: {
  plugins: MarketplacePlugin[];
  installCounts?: Map<string, number>;
  selectedPlugins: Set<string>;
  loadingPlugins: Set<string>;
  onSelect: (pluginId: string) => void;
  onDeselect: (pluginId: string) => void;
  onViewDetails: (plugin: MarketplacePlugin) => void;
  onInstall: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  error?: string;
  noMarketplaces?: boolean;
}): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSearchFocused, setIsSearchFocused] = useState(true);

  // 过滤插件
  const filteredPlugins = useMemo(() => {
    if (!searchQuery) return plugins;
    const q = searchQuery.toLowerCase();
    return plugins.filter(
      (p) =>
        p.entry.name.toLowerCase().includes(q) ||
        p.entry.description?.toLowerCase().includes(q) ||
        p.marketplaceName.toLowerCase().includes(q)
    );
  }, [plugins, searchQuery]);

  // 键盘处理
  useInput((input, key) => {
    if (key.escape) {
      if (isSearchFocused && searchQuery) {
        onSearchChange('');
      } else {
        setIsSearchFocused(false);
      }
      return;
    }

    if (isSearchFocused) {
      if (key.downArrow) {
        setIsSearchFocused(false);
        setSelectedIndex(0);
      } else if (key.backspace || key.delete) {
        onSearchChange(searchQuery.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        onSearchChange(searchQuery + input);
      }
      return;
    }

    if (key.upArrow) {
      if (selectedIndex === 0) {
        setIsSearchFocused(true);
      } else {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filteredPlugins.length - 1, prev + 1));
    } else if (input === ' ' || input === '\u3000') {
      // Space 切换选择（v2.1.31: 支持全角空格，兼容日语 IME）
      const plugin = filteredPlugins[selectedIndex];
      if (plugin) {
        if (selectedPlugins.has(plugin.pluginId)) {
          onDeselect(plugin.pluginId);
        } else {
          onSelect(plugin.pluginId);
        }
      }
    } else if (key.return) {
      // Enter 查看详情
      const plugin = filteredPlugins[selectedIndex];
      if (plugin) {
        onViewDetails(plugin);
      }
    } else if (input === 'i' && selectedPlugins.size > 0) {
      // i 安装选中的插件
      onInstall();
    }
  });

  if (noMarketplaces) {
    return (
      <Box flexDirection="column">
        <Text bold>Discover plugins</Text>
        <Box marginTop={1}>
          <Text dimColor>No marketplaces configured.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Add a marketplace first with:</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color="cyan">/plugins marketplace add anthropics/claude-code</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Discover plugins</Text>
        {filteredPlugins.length > 10 && (
          <Text dimColor> ({selectedIndex + 1}/{filteredPlugins.length})</Text>
        )}
      </Box>

      {/* 搜索框 */}
      <Box marginBottom={1}>
        <SearchInput
          query={searchQuery}
          isFocused={isSearchFocused}
          width={60}
        />
      </Box>

      {/* 警告信息 */}
      {error && (
        <Box marginBottom={1}>
          <Text color="yellow">{ICONS.warning} {error}</Text>
        </Box>
      )}

      {/* 无搜索结果 */}
      {filteredPlugins.length === 0 && searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>No plugins match "{searchQuery}"</Text>
        </Box>
      )}

      {/* 插件列表 */}
      {filteredPlugins.slice(0, 15).map((plugin, index) => {
        const isSelected = index === selectedIndex && !isSearchFocused;
        const isChecked = selectedPlugins.has(plugin.pluginId);
        const isLoading = loadingPlugins.has(plugin.pluginId);
        const installCount = installCounts?.get(plugin.pluginId) || 0;

        return (
          <Box key={plugin.pluginId} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? ICONS.pointer : ' '}{' '}
              </Text>
              <Text>
                {isLoading ? ICONS.ellipsis : isChecked ? ICONS.radioOn : ICONS.radioOff}{' '}
                {plugin.entry.name}
                <Text dimColor> · {plugin.marketplaceName}</Text>
                {plugin.entry.tags?.includes('community-managed') && (
                  <Text dimColor> [Community Managed]</Text>
                )}
                {installCount > 0 && (
                  <Text dimColor> · {formatInstalls(installCount)} installs</Text>
                )}
              </Text>
            </Box>
            {plugin.entry.description && (
              <Box marginLeft={4}>
                <Text dimColor>
                  {plugin.entry.description.length > 60
                    ? plugin.entry.description.substring(0, 57) + '...'
                    : plugin.entry.description}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* 更多指示器 */}
      {filteredPlugins.length > 15 && (
        <Box>
          <Text dimColor> {ICONS.arrowDown} more below</Text>
        </Box>
      )}

      {/* 底部提示 */}
      <Box marginTop={1}>
        <Text italic>
          {selectedPlugins.size > 0 && (
            <Text bold color="cyan">Press i to install · </Text>
          )}
          <Text dimColor>Type to search · Space: (de)select · Enter: details · Esc: back</Text>
        </Text>
      </Box>
    </Box>
  );
}

// Installed Tab 组件（按 marketplace 分组显示，与官方一致）
// v2.1.14: 添加搜索功能
function InstalledTab({
  plugins,
  onUninstall,
  onViewDetails,
}: {
  plugins: InstalledPlugin[];
  onUninstall: (pluginName: string) => void;
  onViewDetails: (plugin: InstalledPlugin) => void;
}): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  // v2.1.14: 添加搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // v2.1.14: 过滤插件（按名称或描述）
  const filteredPlugins = useMemo(() => {
    if (!searchQuery) return plugins;
    const q = searchQuery.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.marketplaceName?.toLowerCase().includes(q)
    );
  }, [plugins, searchQuery]);

  // 按 marketplace 分组
  const groupedPlugins = useMemo(() => {
    const groups: Record<string, InstalledPlugin[]> = {};
    for (const plugin of filteredPlugins) {
      const marketplace = plugin.marketplaceName || 'unknown';
      if (!groups[marketplace]) {
        groups[marketplace] = [];
      }
      groups[marketplace].push(plugin);
    }
    return groups;
  }, [filteredPlugins]);

  // 扁平化列表用于选择
  const flatList = useMemo(() => {
    const result: { type: 'header' | 'plugin'; marketplace?: string; plugin?: InstalledPlugin }[] = [];
    for (const [marketplace, pluginList] of Object.entries(groupedPlugins)) {
      result.push({ type: 'header', marketplace });
      for (const plugin of pluginList) {
        result.push({ type: 'plugin', plugin, marketplace });
      }
    }
    return result;
  }, [groupedPlugins]);

  // 只有 plugin 类型的项可以被选中
  const selectableIndices = useMemo(() => {
    return flatList
      .map((item, index) => item.type === 'plugin' ? index : -1)
      .filter(i => i >= 0);
  }, [flatList]);

  useInput((input, key) => {
    // v2.1.14: 搜索模式处理
    if (key.escape) {
      if (isSearchFocused && searchQuery) {
        setSearchQuery('');
      } else if (isSearchFocused) {
        setIsSearchFocused(false);
      }
      return;
    }

    // v2.1.14: 输入任意字符开始搜索
    if (!isSearchFocused && input && !key.ctrl && !key.meta && !key.return && !key.upArrow && !key.downArrow) {
      setIsSearchFocused(true);
      setSearchQuery(input);
      return;
    }

    if (isSearchFocused) {
      if (key.downArrow) {
        setIsSearchFocused(false);
        if (selectableIndices.length > 0) {
          setSelectedIndex(selectableIndices[0]);
        }
      } else if (key.backspace || key.delete) {
        setSearchQuery(searchQuery.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setSearchQuery(searchQuery + input);
      }
      return;
    }

    if (key.upArrow) {
      const currentPos = selectableIndices.indexOf(selectedIndex);
      if (currentPos > 0) {
        setSelectedIndex(selectableIndices[currentPos - 1]);
      } else {
        // 返回搜索框
        setIsSearchFocused(true);
      }
    } else if (key.downArrow) {
      const currentPos = selectableIndices.indexOf(selectedIndex);
      if (currentPos < selectableIndices.length - 1) {
        setSelectedIndex(selectableIndices[currentPos + 1]);
      }
    } else if (key.return) {
      const item = flatList[selectedIndex];
      if (item?.type === 'plugin' && item.plugin) {
        onViewDetails(item.plugin);
      }
    } else if (input === 'u' || key.delete) {
      const item = flatList[selectedIndex];
      if (item?.type === 'plugin' && item.plugin) {
        onUninstall(item.plugin.name);
      }
    }
  });

  // 初始化选中第一个可选项
  useEffect(() => {
    if (selectableIndices.length > 0 && !selectableIndices.includes(selectedIndex)) {
      setSelectedIndex(selectableIndices[0]);
    }
  }, [selectableIndices, selectedIndex]);

  if (plugins.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>Installed Plugins</Text>
        <Box marginTop={1}>
          <Text dimColor>No plugins installed.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Use the Discover tab to find and install plugins.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>Installed Plugins</Text>
        {filteredPlugins.length !== plugins.length && (
          <Text dimColor> ({filteredPlugins.length}/{plugins.length})</Text>
        )}
      </Box>

      {/* v2.1.14: 搜索框 */}
      <Box marginBottom={1}>
        <SearchInput
          query={searchQuery}
          isFocused={isSearchFocused}
          width={60}
        />
      </Box>

      {/* 无搜索结果 */}
      {filteredPlugins.length === 0 && searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>No plugins match "{searchQuery}"</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        {flatList.map((item, index) => {
          if (item.type === 'header') {
            return (
              <Box key={`header-${item.marketplace}`} marginTop={index > 0 ? 1 : 0}>
                <Text bold>{item.marketplace}</Text>
              </Box>
            );
          }

          const plugin = item.plugin!;
          const isSelected = index === selectedIndex && !isSearchFocused;
          // scope 默认为 user
          const scope = 'user';

          return (
            <Box key={`plugin-${plugin.name}`}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? ICONS.pointer : ' '}{' '}
                {ICONS.radioOn} {plugin.name}
                <Text dimColor> {scope}</Text>
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor italic>
          Type to search · Space: toggle · Enter: details · Delete: uninstall · Esc: back
        </Text>
      </Box>
    </Box>
  );
}

// Marketplaces Tab 组件
function MarketplacesTab({
  marketplaces,
  onAdd,
  onRemove,
  onUpdate,
  onViewDetails,
}: {
  marketplaces: Marketplace[];
  onAdd: () => void;
  onRemove: (name: string) => void;
  onUpdate: (name: string) => void;
  onViewDetails: (marketplace: Marketplace) => void;
}): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 菜单项：+Add Marketplace 在第一位
  const menuItems = [
    { type: 'add' as const, label: '+ Add Marketplace' },
    ...marketplaces.map((m) => ({ type: 'marketplace' as const, marketplace: m })),
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(menuItems.length - 1, prev + 1));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      if (item.type === 'add') {
        onAdd();
      } else if (item.marketplace) {
        onViewDetails(item.marketplace);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Manage marketplaces</Text>
      </Box>

      {/* 添加选项 */}
      <Box marginBottom={1}>
        <Text color={selectedIndex === 0 ? 'cyan' : undefined}>
          {selectedIndex === 0 ? ICONS.pointer : ' '} +
        </Text>
        <Text bold color={selectedIndex === 0 ? 'cyan' : undefined}>
          {' '}Add Marketplace
        </Text>
      </Box>

      {/* Marketplace 列表 */}
      {marketplaces.map((marketplace, index) => {
        const itemIndex = index + 1;
        const isSelected = itemIndex === selectedIndex;

        return (
          <Box key={marketplace.name} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? ICONS.pointer : ' '}{' '}
                {marketplace.pendingUpdate ? ICONS.ellipsis : ICONS.tick}{' '}
                {marketplace.name}
                <Text dimColor> · {marketplace.pluginCount} plugins</Text>
                {marketplace.autoUpdate && <Text dimColor> [auto-update]</Text>}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>{marketplace.source}</Text>
            </Box>
          </Box>
        );
      })}

      {marketplaces.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor>No marketplaces configured.</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor italic>
          {ICONS.arrowUp}{ICONS.arrowDown} · enter to select · Esc to go back
        </Text>
      </Box>
    </Box>
  );
}

// Errors Tab 组件
function ErrorsTab({
  errors,
  onClear,
}: {
  errors: PluginError[];
  onClear: () => void;
}): React.ReactElement {
  useInput((input, key) => {
    if (input === 'c') {
      onClear();
    }
  });

  if (errors.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold>Plugin errors</Text>
        <Box marginTop={1}>
          <Text color="green">{ICONS.tick} No errors</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Plugin errors ({errors.length})</Text>

      <Box flexDirection="column" marginTop={1}>
        {errors.map((error, index) => (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color="red">{ICONS.cross} {error.pluginId}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>{error.message}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>at {error.timestamp}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor italic>
          c: clear errors · Esc: back
        </Text>
      </Box>
    </Box>
  );
}

// Plugin Details 视图
function PluginDetails({
  plugin,
  isInstalled,
  isInstalling,
  onInstall,
  onUninstall,
  onBack,
}: {
  plugin: MarketplacePlugin | InstalledPlugin;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onBack: () => void;
}): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const entry = 'entry' in plugin ? plugin.entry : plugin;
  const name = 'entry' in plugin ? plugin.entry.name : plugin.name;
  const marketplaceName = 'marketplaceName' in plugin ? plugin.marketplaceName : undefined;
  const version = entry.version || ('version' in plugin ? plugin.version : undefined);
  const description = entry.description || ('description' in plugin ? plugin.description : undefined);
  const author = 'author' in entry ? entry.author : undefined;
  const homepage = 'homepage' in entry ? entry.homepage : undefined;

  const actions = isInstalled
    ? [
        { label: 'Uninstall', action: 'uninstall' },
        { label: 'View homepage', action: 'homepage' },
      ]
    : [
        { label: 'Install', action: 'install' },
        { label: 'View homepage', action: 'homepage' },
      ];

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(actions.length - 1, prev + 1));
    } else if (key.return) {
      const action = actions[selectedIndex];
      if (action.action === 'install') {
        onInstall();
      } else if (action.action === 'uninstall') {
        onUninstall();
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
        <Box marginBottom={1}>
          <Text bold>Plugin details</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{name}</Text>
          {marketplaceName && <Text dimColor>from {marketplaceName}</Text>}
          {version && <Text dimColor>Version: {version}</Text>}
          {description && (
            <Box marginTop={1}>
              <Text>{description}</Text>
            </Box>
          )}
          {author && (
            <Box marginTop={1}>
              <Text dimColor>
                By: {typeof author === 'string' ? author : author.name}
              </Text>
            </Box>
          )}
        </Box>

        {/* 警告 */}
        <Box marginBottom={1}>
          <Text color="yellow">{ICONS.warning} </Text>
          <Text dimColor italic>
            Make sure you trust a plugin before installing, updating, or using it.
            Anthropic does not control what MCP servers, files, or other software
            are included in plugins.
          </Text>
        </Box>

        {/* 操作选项 */}
        <Box flexDirection="column">
          {actions.map((action, index) => (
            <Box key={action.action}>
              <Text color={selectedIndex === index ? 'cyan' : undefined}>
                {selectedIndex === index ? ICONS.pointer : ' '}{' '}
                {isInstalling && action.action === 'install' ? 'Installing…' : action.label}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box marginTop={1} paddingLeft={1}>
        <Text dimColor>
          <Text bold>Select:</Text> Enter · <Text bold>Back:</Text> Esc
        </Text>
      </Box>
    </Box>
  );
}

// Add Marketplace 视图
function AddMarketplace({
  onAdd,
  onBack,
}: {
  onAdd: (source: string) => void;
  onBack: () => void;
}): React.ReactElement {
  const [source, setSource] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.return && source.trim()) {
      onAdd(source.trim());
      return;
    }

    if (key.backspace || key.delete) {
      setSource((prev) => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setSource((prev) => prev + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="gray">
        <Box marginBottom={1}>
          <Text bold>Add Marketplace</Text>
        </Box>

        <Box marginBottom={1}>
          <Text>Enter marketplace source:</Text>
        </Box>

        <Box marginBottom={1}>
          <Text>
            {ICONS.pointer} {source || ''}▋
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>Examples:</Text>
          <Text dimColor>  • anthropics/claude-code</Text>
          <Text dimColor>  • git@github.com:owner/repo.git</Text>
          <Text dimColor>  • https://example.com/marketplace</Text>
          <Text dimColor>  • ./path/to/local/marketplace</Text>
        </Box>
      </Box>

      <Box marginTop={1} paddingLeft={1}>
        <Text dimColor>
          <Text bold>Confirm:</Text> Enter · <Text bold>Back:</Text> Esc
        </Text>
      </Box>
    </Box>
  );
}

/**
 * 插件管理主界面
 */
export function PluginsDialog({
  onDone,
  cwd = process.cwd(),
}: PluginsDialogProps): React.ReactElement {
  const [currentTab, setCurrentTab] = useState<TabId>('discover');
  const [viewMode, setViewMode] = useState<'tabs' | 'details' | 'add-marketplace'>('tabs');

  // 数据状态
  const [discoverPlugins, setDiscoverPlugins] = useState<MarketplacePlugin[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [errors, setErrors] = useState<PluginError[]>([]);
  const [installCounts, setInstallCounts] = useState<Map<string, number>>(new Map());

  // UI 状态
  const [selectedPlugins, setSelectedPlugins] = useState<Set<string>>(new Set());
  const [loadingPlugins, setLoadingPlugins] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<MarketplacePlugin | InstalledPlugin | null>(null);
  const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const homeDir = os.homedir();
  const pluginDir = path.join(homeDir, '.claude', 'plugins');
  const projectPluginDir = path.join(cwd, '.claude', 'plugins');
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // === 1. 读取已安装插件（从 installed_plugins.json） ===
      const installed: InstalledPlugin[] = [];
      const installedPluginsPath = path.join(pluginDir, 'installed_plugins.json');

      if (fs.existsSync(installedPluginsPath)) {
        try {
          const installedData = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf-8'));
          const plugins = installedData.plugins || {};

          for (const [pluginId, installations] of Object.entries(plugins)) {
            // pluginId 格式: "plugin-name@marketplace-name"
            const [pluginName, marketplaceName] = pluginId.split('@');
            const installList = installations as any[];

            for (const install of installList) {
              // 读取插件的 plugin.json 获取详细信息
              const pluginJsonPath = path.join(install.installPath, '.claude-plugin', 'plugin.json');
              let description = '';
              let author: string | { name: string } | undefined;

              if (fs.existsSync(pluginJsonPath)) {
                try {
                  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
                  description = pluginJson.description || '';
                  author = pluginJson.author;
                } catch {
                  // 忽略解析错误
                }
              }

              installed.push({
                name: pluginName,
                version: install.version || '0.0.0',
                description,
                marketplaceName,
                installPath: install.installPath,
                installedAt: install.installedAt,
              });
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
      setInstalledPlugins(installed);

      // === 2. 读取 marketplaces（从 ~/.claude/plugins/marketplaces/） ===
      const marketplaceList: Marketplace[] = [];
      const marketplacesDir = path.join(pluginDir, 'marketplaces');

      if (fs.existsSync(marketplacesDir)) {
        try {
          const entries = fs.readdirSync(marketplacesDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const marketplaceName = entry.name;
              const marketplacePath = path.join(marketplacesDir, marketplaceName);

              // 统计该 marketplace 中的插件数量
              let pluginCount = 0;
              const pluginsPath = path.join(marketplacePath, 'plugins');
              const externalPluginsPath = path.join(marketplacePath, 'external_plugins');

              if (fs.existsSync(pluginsPath)) {
                try {
                  const pluginEntries = fs.readdirSync(pluginsPath, { withFileTypes: true });
                  pluginCount += pluginEntries.filter(e => e.isDirectory()).length;
                } catch {
                  // 忽略
                }
              }

              if (fs.existsSync(externalPluginsPath)) {
                try {
                  const externalEntries = fs.readdirSync(externalPluginsPath, { withFileTypes: true });
                  pluginCount += externalEntries.filter(e => e.isDirectory()).length;
                } catch {
                  // 忽略
                }
              }

              // 获取该 marketplace 已安装的插件
              const installedInMarketplace = installed.filter(p => p.marketplaceName === marketplaceName);

              marketplaceList.push({
                name: marketplaceName,
                source: `github.com/anthropics/${marketplaceName}`,
                pluginCount,
                autoUpdate: true,
                installedPlugins: installedInMarketplace,
              });
            }
          }
        } catch {
          // 忽略读取错误
        }
      }

      // 如果没有找到任何 marketplace，显示提示
      setMarketplaces(marketplaceList);

      // === 3. 读取可发现的插件（从 marketplaces 目录） ===
      const discover: MarketplacePlugin[] = [];

      for (const marketplace of marketplaceList) {
        const marketplacePath = path.join(marketplacesDir, marketplace.name);
        const pluginsPath = path.join(marketplacePath, 'plugins');
        const externalPluginsPath = path.join(marketplacePath, 'external_plugins');

        // 读取 plugins 目录
        for (const pluginBasePath of [pluginsPath, externalPluginsPath]) {
          if (fs.existsSync(pluginBasePath)) {
            try {
              const pluginEntries = fs.readdirSync(pluginBasePath, { withFileTypes: true });
              for (const pluginEntry of pluginEntries) {
                if (pluginEntry.isDirectory()) {
                  const pluginName = pluginEntry.name;
                  const pluginJsonPath = path.join(pluginBasePath, pluginName, '.claude-plugin', 'plugin.json');

                  if (fs.existsSync(pluginJsonPath)) {
                    try {
                      const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
                      discover.push({
                        pluginId: `${pluginName}@${marketplace.name}`,
                        entry: {
                          name: pluginJson.name || pluginName,
                          description: pluginJson.description,
                          version: pluginJson.version,
                          author: pluginJson.author,
                          tags: pluginJson.tags || [],
                        },
                        marketplaceName: marketplace.name,
                      });
                    } catch {
                      // 忽略解析错误，但仍添加插件
                      discover.push({
                        pluginId: `${pluginName}@${marketplace.name}`,
                        entry: {
                          name: pluginName,
                          tags: [],
                        },
                        marketplaceName: marketplace.name,
                      });
                    }
                  }
                }
              }
            } catch {
              // 忽略读取错误
            }
          }
        }
      }
      setDiscoverPlugins(discover);

      // 模拟安装计数（实际应从服务器获取）
      const counts = new Map<string, number>();
      for (const plugin of discover) {
        // 根据插件名生成模拟的安装数
        const hash = plugin.pluginId.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        counts.set(plugin.pluginId, (hash % 50) * 1000);
      }
      setInstallCounts(counts);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugin data');
    } finally {
      setLoading(false);
    }
  };

  // Tab 切换
  const handleTabChange = useCallback((tab: TabId) => {
    setCurrentTab(tab);
    setViewMode('tabs');
    setSelectedPlugin(null);
    setSelectedMarketplace(null);
  }, []);

  // 主键盘处理
  useInput((input, key) => {
    if (viewMode !== 'tabs') return;

    if (key.escape) {
      onDone();
      return;
    }

    if (key.tab) {
      // Tab 切换
      const currentIndex = TAB_ORDER.indexOf(currentTab);
      const nextIndex = (currentIndex + 1) % TAB_ORDER.length;
      setCurrentTab(TAB_ORDER[nextIndex]);
    }
  }, { isActive: viewMode === 'tabs' });

  // 插件选择
  const handleSelectPlugin = useCallback((pluginId: string) => {
    setSelectedPlugins((prev) => new Set([...prev, pluginId]));
  }, []);

  const handleDeselectPlugin = useCallback((pluginId: string) => {
    setSelectedPlugins((prev) => {
      const next = new Set(prev);
      next.delete(pluginId);
      return next;
    });
  }, []);

  // 查看插件详情
  const handleViewPluginDetails = useCallback((plugin: MarketplacePlugin | InstalledPlugin) => {
    setSelectedPlugin(plugin);
    setViewMode('details');
  }, []);

  // 安装插件
  const handleInstall = useCallback(() => {
    // 模拟安装过程
    for (const pluginId of selectedPlugins) {
      setLoadingPlugins((prev) => new Set([...prev, pluginId]));

      setTimeout(() => {
        setLoadingPlugins((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
        setSelectedPlugins((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });

        // 添加到已安装列表
        const plugin = discoverPlugins.find((p) => p.pluginId === pluginId);
        if (plugin) {
          setInstalledPlugins((prev) => [
            ...prev,
            {
              name: plugin.entry.name,
              version: plugin.entry.version || '1.0.0',
              description: plugin.entry.description,
              marketplaceName: plugin.marketplaceName,
              installPath: path.join(pluginDir, plugin.entry.name),
            },
          ]);
        }
      }, 2000);
    }
  }, [selectedPlugins, discoverPlugins, pluginDir]);

  // 卸载插件
  const handleUninstall = useCallback((pluginName: string) => {
    setInstalledPlugins((prev) => prev.filter((p) => p.name !== pluginName));
    setViewMode('tabs');
    setSelectedPlugin(null);
  }, []);

  // 添加 marketplace
  const handleAddMarketplace = useCallback((source: string) => {
    const name = source.includes('/') ? source.split('/').pop() || source : source;
    setMarketplaces((prev) => [
      ...prev,
      {
        name,
        source,
        pluginCount: 0,
        autoUpdate: true,
        pendingUpdate: true,
      },
    ]);
    setViewMode('tabs');

    // 模拟更新
    setTimeout(() => {
      setMarketplaces((prev) =>
        prev.map((m) =>
          m.source === source ? { ...m, pendingUpdate: false, pluginCount: 3 } : m
        )
      );
    }, 2000);
  }, []);

  // 移除 marketplace
  const handleRemoveMarketplace = useCallback((name: string) => {
    setMarketplaces((prev) => prev.filter((m) => m.name !== name));
  }, []);

  // 清除错误
  const handleClearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  // 返回
  const handleBack = useCallback(() => {
    setViewMode('tabs');
    setSelectedPlugin(null);
    setSelectedMarketplace(null);
  }, []);

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text bold>/plugins</Text>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  // 添加 marketplace 视图
  if (viewMode === 'add-marketplace') {
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="blue">
          <AddMarketplace
            onAdd={handleAddMarketplace}
            onBack={handleBack}
          />
        </Box>
      </Box>
    );
  }

  // 插件详情视图
  if (viewMode === 'details' && selectedPlugin) {
    const isInstalled = installedPlugins.some(
      (p) => p.name === ('entry' in selectedPlugin ? selectedPlugin.entry.name : selectedPlugin.name)
    );
    const pluginId = 'pluginId' in selectedPlugin ? selectedPlugin.pluginId : selectedPlugin.name;
    const isInstalling = loadingPlugins.has(pluginId);

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="blue">
          <PluginDetails
            plugin={selectedPlugin}
            isInstalled={isInstalled}
            isInstalling={isInstalling}
            onInstall={() => {
              if ('pluginId' in selectedPlugin) {
                handleSelectPlugin(selectedPlugin.pluginId);
                handleInstall();
              }
            }}
            onUninstall={() => {
              const name = 'entry' in selectedPlugin ? selectedPlugin.entry.name : selectedPlugin.name;
              handleUninstall(name);
            }}
            onBack={handleBack}
          />
        </Box>
      </Box>
    );
  }

  // 主 Tab 视图
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="blue">
        {/* Tab 栏 */}
        <TabBar
          tabs={TAB_ORDER}
          selectedTab={currentTab}
          onTabChange={handleTabChange}
        />

        {/* Tab 内容 */}
        {currentTab === 'discover' && (
          <DiscoverTab
            plugins={discoverPlugins}
            installCounts={installCounts}
            selectedPlugins={selectedPlugins}
            loadingPlugins={loadingPlugins}
            onSelect={handleSelectPlugin}
            onDeselect={handleDeselectPlugin}
            onViewDetails={handleViewPluginDetails}
            onInstall={handleInstall}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            error={error}
            noMarketplaces={marketplaces.length === 0}
          />
        )}

        {currentTab === 'installed' && (
          <InstalledTab
            plugins={installedPlugins}
            onUninstall={handleUninstall}
            onViewDetails={handleViewPluginDetails}
          />
        )}

        {currentTab === 'marketplaces' && (
          <MarketplacesTab
            marketplaces={marketplaces}
            onAdd={() => setViewMode('add-marketplace')}
            onRemove={handleRemoveMarketplace}
            onUpdate={() => {}}
            onViewDetails={(marketplace) => {
              setSelectedMarketplace(marketplace);
            }}
          />
        )}

        {currentTab === 'errors' && (
          <ErrorsTab
            errors={errors}
            onClear={handleClearErrors}
          />
        )}
      </Box>

      {/* 底部提示 */}
      <Box marginLeft={3}>
        <Text dimColor italic>Esc to go back</Text>
      </Box>
    </Box>
  );
}

export default PluginsDialog;
