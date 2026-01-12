/**
 * FORCE_AUTOUPDATE_PLUGINS 环境变量测试
 *
 * 测试用例覆盖：
 * 1. 主更新器禁用 + FORCE 启用 = 插件更新
 * 2. 主更新器禁用 + FORCE 禁用 = 不更新
 * 3. 主更新器启用 = 正常更新
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isTruthy,
  isAutoUpdaterDisabled,
  getAutoUpdaterDisabledReason,
  shouldSkipPluginAutoUpdate,
  isForcePluginAutoUpdateEnabled,
} from '../../src/utils/env-check';

describe('FORCE_AUTOUPDATE_PLUGINS 环境变量', () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 清理相关环境变量
    delete process.env.DISABLE_AUTOUPDATER;
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
    delete process.env.FORCE_AUTOUPDATE_PLUGINS;
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
  });

  describe('isTruthy 辅助函数', () => {
    it('应该正确识别真值', () => {
      expect(isTruthy('1')).toBe(true);
      expect(isTruthy('true')).toBe(true);
      expect(isTruthy('TRUE')).toBe(true);
      expect(isTruthy('True')).toBe(true);
      expect(isTruthy('yes')).toBe(true);
      expect(isTruthy('YES')).toBe(true);
      expect(isTruthy('on')).toBe(true);
      expect(isTruthy('ON')).toBe(true);
      expect(isTruthy(true)).toBe(true);
    });

    it('应该正确识别假值', () => {
      expect(isTruthy('0')).toBe(false);
      expect(isTruthy('false')).toBe(false);
      expect(isTruthy('FALSE')).toBe(false);
      expect(isTruthy('no')).toBe(false);
      expect(isTruthy('off')).toBe(false);
      expect(isTruthy('')).toBe(false);
      expect(isTruthy(undefined)).toBe(false);
      expect(isTruthy(false)).toBe(false);
    });
  });

  describe('getAutoUpdaterDisabledReason', () => {
    it('主更新器未禁用时应返回 null', () => {
      expect(getAutoUpdaterDisabledReason()).toBe(null);
    });

    it('DISABLE_AUTOUPDATER=1 时应返回禁用原因', () => {
      process.env.DISABLE_AUTOUPDATER = '1';
      expect(getAutoUpdaterDisabledReason()).toBe('DISABLE_AUTOUPDATER set');
    });

    it('DISABLE_AUTOUPDATER=true 时应返回禁用原因', () => {
      process.env.DISABLE_AUTOUPDATER = 'true';
      expect(getAutoUpdaterDisabledReason()).toBe('DISABLE_AUTOUPDATER set');
    });

    it('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC 设置时应返回禁用原因', () => {
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
      expect(getAutoUpdaterDisabledReason()).toBe('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC set');
    });
  });

  describe('isAutoUpdaterDisabled', () => {
    it('主更新器未禁用时应返回 false', () => {
      expect(isAutoUpdaterDisabled()).toBe(false);
    });

    it('DISABLE_AUTOUPDATER=1 时应返回 true', () => {
      process.env.DISABLE_AUTOUPDATER = '1';
      expect(isAutoUpdaterDisabled()).toBe(true);
    });

    it('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 时应返回 true', () => {
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
      expect(isAutoUpdaterDisabled()).toBe(true);
    });
  });

  describe('isForcePluginAutoUpdateEnabled', () => {
    it('FORCE_AUTOUPDATE_PLUGINS 未设置时应返回 false', () => {
      expect(isForcePluginAutoUpdateEnabled()).toBe(false);
    });

    it('FORCE_AUTOUPDATE_PLUGINS=1 时应返回 true', () => {
      process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
      expect(isForcePluginAutoUpdateEnabled()).toBe(true);
    });

    it('FORCE_AUTOUPDATE_PLUGINS=true 时应返回 true', () => {
      process.env.FORCE_AUTOUPDATE_PLUGINS = 'true';
      expect(isForcePluginAutoUpdateEnabled()).toBe(true);
    });

    it('FORCE_AUTOUPDATE_PLUGINS=0 时应返回 false', () => {
      process.env.FORCE_AUTOUPDATE_PLUGINS = '0';
      expect(isForcePluginAutoUpdateEnabled()).toBe(false);
    });

    it('FORCE_AUTOUPDATE_PLUGINS=false 时应返回 false', () => {
      process.env.FORCE_AUTOUPDATE_PLUGINS = 'false';
      expect(isForcePluginAutoUpdateEnabled()).toBe(false);
    });
  });

  describe('shouldSkipPluginAutoUpdate', () => {
    describe('场景 1: 主更新器启用 = 正常更新（不跳过）', () => {
      it('主更新器启用时不应跳过插件更新', () => {
        // 不设置任何禁用环境变量
        expect(shouldSkipPluginAutoUpdate()).toBe(false);
      });

      it('主更新器启用时，即使 FORCE 也设置，仍不跳过', () => {
        process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
        expect(shouldSkipPluginAutoUpdate()).toBe(false);
      });
    });

    describe('场景 2: 主更新器禁用 + FORCE 禁用 = 跳过插件更新', () => {
      it('DISABLE_AUTOUPDATER=1 且 FORCE 未设置时应跳过插件更新', () => {
        process.env.DISABLE_AUTOUPDATER = '1';
        expect(shouldSkipPluginAutoUpdate()).toBe(true);
      });

      it('DISABLE_AUTOUPDATER=1 且 FORCE=0 时应跳过插件更新', () => {
        process.env.DISABLE_AUTOUPDATER = '1';
        process.env.FORCE_AUTOUPDATE_PLUGINS = '0';
        expect(shouldSkipPluginAutoUpdate()).toBe(true);
      });

      it('DISABLE_AUTOUPDATER=1 且 FORCE=false 时应跳过插件更新', () => {
        process.env.DISABLE_AUTOUPDATER = '1';
        process.env.FORCE_AUTOUPDATE_PLUGINS = 'false';
        expect(shouldSkipPluginAutoUpdate()).toBe(true);
      });

      it('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 且 FORCE 未设置时应跳过插件更新', () => {
        process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
        expect(shouldSkipPluginAutoUpdate()).toBe(true);
      });
    });

    describe('场景 3: 主更新器禁用 + FORCE 启用 = 允许插件更新', () => {
      it('DISABLE_AUTOUPDATER=1 且 FORCE=1 时不应跳过插件更新', () => {
        process.env.DISABLE_AUTOUPDATER = '1';
        process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
        expect(shouldSkipPluginAutoUpdate()).toBe(false);
      });

      it('DISABLE_AUTOUPDATER=1 且 FORCE=true 时不应跳过插件更新', () => {
        process.env.DISABLE_AUTOUPDATER = '1';
        process.env.FORCE_AUTOUPDATE_PLUGINS = 'true';
        expect(shouldSkipPluginAutoUpdate()).toBe(false);
      });

      it('DISABLE_AUTOUPDATER=1 且 FORCE=yes 时不应跳过插件更新', () => {
        process.env.DISABLE_AUTOUPDATER = '1';
        process.env.FORCE_AUTOUPDATE_PLUGINS = 'yes';
        expect(shouldSkipPluginAutoUpdate()).toBe(false);
      });

      it('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 且 FORCE=1 时不应跳过插件更新', () => {
        process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
        process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
        expect(shouldSkipPluginAutoUpdate()).toBe(false);
      });
    });
  });

  describe('官网源码逻辑验证', () => {
    /**
     * 官网源码:
     * function Ku(){return _JA()!==null}
     * function BOA(){return Ku()&&!i1(process.env.FORCE_AUTOUPDATE_PLUGINS)}
     *
     * 即: shouldSkipPluginAutoUpdate = isAutoUpdaterDisabled() && !isTruthy(FORCE_AUTOUPDATE_PLUGINS)
     */

    it('验证公式: shouldSkip = isDisabled && !isForce', () => {
      // Case 1: disabled=false, force=false => skip=false
      expect(isAutoUpdaterDisabled()).toBe(false);
      expect(isForcePluginAutoUpdateEnabled()).toBe(false);
      expect(shouldSkipPluginAutoUpdate()).toBe(false);
      expect(shouldSkipPluginAutoUpdate()).toBe(isAutoUpdaterDisabled() && !isForcePluginAutoUpdateEnabled());

      // Case 2: disabled=true, force=false => skip=true
      process.env.DISABLE_AUTOUPDATER = '1';
      expect(isAutoUpdaterDisabled()).toBe(true);
      expect(isForcePluginAutoUpdateEnabled()).toBe(false);
      expect(shouldSkipPluginAutoUpdate()).toBe(true);
      expect(shouldSkipPluginAutoUpdate()).toBe(isAutoUpdaterDisabled() && !isForcePluginAutoUpdateEnabled());

      // Case 3: disabled=true, force=true => skip=false
      process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
      expect(isAutoUpdaterDisabled()).toBe(true);
      expect(isForcePluginAutoUpdateEnabled()).toBe(true);
      expect(shouldSkipPluginAutoUpdate()).toBe(false);
      expect(shouldSkipPluginAutoUpdate()).toBe(isAutoUpdaterDisabled() && !isForcePluginAutoUpdateEnabled());

      // Case 4: disabled=false, force=true => skip=false
      delete process.env.DISABLE_AUTOUPDATER;
      expect(isAutoUpdaterDisabled()).toBe(false);
      expect(isForcePluginAutoUpdateEnabled()).toBe(true);
      expect(shouldSkipPluginAutoUpdate()).toBe(false);
      expect(shouldSkipPluginAutoUpdate()).toBe(isAutoUpdaterDisabled() && !isForcePluginAutoUpdateEnabled());
    });
  });
});

describe('PluginAutoUpdater 集成测试', () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // 清理相关环境变量
    delete process.env.DISABLE_AUTOUPDATER;
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
    delete process.env.FORCE_AUTOUPDATE_PLUGINS;
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = { ...originalEnv };
  });

  it('应该能够导入 PluginAutoUpdater', async () => {
    const { PluginAutoUpdater } = await import('../../src/plugins/index');
    expect(PluginAutoUpdater).toBeDefined();
  });

  it('应该能够导入 startPluginAutoUpdate', async () => {
    const { startPluginAutoUpdate } = await import('../../src/plugins/index');
    expect(startPluginAutoUpdate).toBeDefined();
    expect(typeof startPluginAutoUpdate).toBe('function');
  });

  it('应该能够导入环境变量检查函数', async () => {
    const {
      shouldSkipPluginAutoUpdate: skip,
      isForcePluginAutoUpdateEnabled: force,
      isAutoUpdaterDisabled: disabled,
      getAutoUpdaterDisabledReason: reason,
    } = await import('../../src/plugins/index');

    expect(skip).toBeDefined();
    expect(force).toBeDefined();
    expect(disabled).toBeDefined();
    expect(reason).toBeDefined();
  });

  it('PluginAutoUpdater.shouldSkipAutoUpdate 应该使用正确的逻辑', async () => {
    const { PluginAutoUpdater, pluginManager } = await import('../../src/plugins/index');
    const updater = new PluginAutoUpdater(pluginManager);

    // 未禁用时不跳过
    expect(updater.shouldSkipAutoUpdate()).toBe(false);

    // 禁用但未强制时跳过
    process.env.DISABLE_AUTOUPDATER = '1';
    expect(updater.shouldSkipAutoUpdate()).toBe(true);

    // 禁用但强制时不跳过
    process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
    expect(updater.shouldSkipAutoUpdate()).toBe(false);
  });

  it('PluginAutoUpdater.getStatus 应该返回正确的状态', async () => {
    const { PluginAutoUpdater, pluginManager } = await import('../../src/plugins/index');
    const updater = new PluginAutoUpdater(pluginManager);

    // 默认状态
    let status = updater.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.forceEnabled).toBe(false);
    expect(status.reason).toBeUndefined();

    // 禁用状态
    process.env.DISABLE_AUTOUPDATER = '1';
    status = updater.getStatus();
    expect(status.enabled).toBe(false);
    expect(status.forceEnabled).toBe(false);
    expect(status.reason).toBe('DISABLE_AUTOUPDATER set');

    // 禁用但强制启用状态
    process.env.FORCE_AUTOUPDATE_PLUGINS = '1';
    status = updater.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.forceEnabled).toBe(true);
    expect(status.reason).toBe('DISABLE_AUTOUPDATER set');
  });
});
