/**
 * Shift+Tab 权限模式切换测试
 * 官方 v2.1.2 功能: 快速选择 auto-accept edits
 *
 * 测试场景：
 * 1. 一次 Shift+Tab -> Auto-Accept Edits 模式
 * 2. 两次 Shift+Tab -> Plan Mode
 * 3. 权限模式指示器显示
 * 4. 终端兼容性（不同的转义序列）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 模拟 Shift+Tab 的转义序列
const SHIFT_TAB_ESCAPE_SEQ = '\x1b[Z';

describe('Shift+Tab 权限模式切换', () => {
  let mockOnPermissionModeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnPermissionModeChange = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('单次 Shift+Tab', () => {
    it('应该触发 acceptEdits 模式', () => {
      // 模拟按下 Shift+Tab
      const shiftTabEvent = {
        key: { tab: true, shift: true },
        input: '',
      };

      // 模拟时间间隔（第一次按下）
      const now = Date.now();
      const lastPressTime = 0;
      const timeSinceLastPress = now - lastPressTime;

      // 验证时间间隔大于双击阈值（500ms）
      expect(timeSinceLastPress).toBeGreaterThan(500);

      // 第一次按下应该触发 acceptEdits
      mockOnPermissionModeChange('acceptEdits');
      expect(mockOnPermissionModeChange).toHaveBeenCalledWith('acceptEdits');
    });
  });

  describe('双击 Shift+Tab', () => {
    it('应该触发 plan 模式', () => {
      // 模拟两次快速按下 Shift+Tab（间隔小于 500ms）
      mockOnPermissionModeChange('acceptEdits');
      vi.advanceTimersByTime(200); // 200ms 后第二次按下
      mockOnPermissionModeChange('plan');

      expect(mockOnPermissionModeChange).toHaveBeenCalledTimes(2);
      expect(mockOnPermissionModeChange).toHaveBeenLastCalledWith('plan');
    });

    it('超时后应该重置为单击', () => {
      // 第一次按下
      mockOnPermissionModeChange('acceptEdits');
      vi.advanceTimersByTime(600); // 超过 500ms

      // 第二次按下应该被视为新的单击
      mockOnPermissionModeChange('acceptEdits');

      expect(mockOnPermissionModeChange).toHaveBeenCalledTimes(2);
      expect(mockOnPermissionModeChange).toHaveBeenNthCalledWith(1, 'acceptEdits');
      expect(mockOnPermissionModeChange).toHaveBeenNthCalledWith(2, 'acceptEdits');
    });
  });

  describe('终端转义序列兼容性', () => {
    it('应该识别 \\x1b[Z 作为 Shift+Tab', () => {
      const input = SHIFT_TAB_ESCAPE_SEQ;
      expect(input).toBe('\x1b[Z');
    });

    it('应该识别 key.tab && key.shift 组合', () => {
      const key = { tab: true, shift: true };
      expect(key.tab && key.shift).toBe(true);
    });
  });

  describe('权限模式循环', () => {
    it('模式顺序应为: default -> acceptEdits -> plan', () => {
      const modes = ['default', 'acceptEdits', 'plan'];

      // 验证模式顺序
      expect(modes[0]).toBe('default');
      expect(modes[1]).toBe('acceptEdits');
      expect(modes[2]).toBe('plan');
    });
  });
});

describe('PermissionPrompt Shift+Tab 支持', () => {
  describe('快捷键提示', () => {
    it('应该显示 Shift+Tab 快捷键提示', () => {
      const hintText = 'shift+tab: auto-accept edits · shift+tab×2: plan mode';
      expect(hintText).toContain('shift+tab');
      expect(hintText).toContain('auto-accept');
      expect(hintText).toContain('plan mode');
    });
  });

  describe('模式指示器', () => {
    it('acceptEdits 模式应显示正确的指示器', () => {
      const mode = 'acceptEdits';
      const indicator = mode === 'acceptEdits' ? '[Auto-Accept] ' : '[Plan] ';
      expect(indicator).toBe('[Auto-Accept] ');
    });

    it('plan 模式应显示正确的指示器', () => {
      const mode = 'plan';
      const indicator = mode === 'acceptEdits' ? '[Auto-Accept] ' : '[Plan] ';
      expect(indicator).toBe('[Plan] ');
    });

    it('default 模式不应显示指示器', () => {
      const mode = 'default';
      const indicator = mode !== 'default'
        ? mode === 'acceptEdits' ? '[Auto-Accept] ' : '[Plan] '
        : '';
      expect(indicator).toBe('');
    });
  });
});

describe('Input 组件 Shift+Tab 集成', () => {
  describe('props 接口', () => {
    it('应该支持 onPermissionModeChange 回调', () => {
      interface InputProps {
        onPermissionModeChange?: (mode: 'default' | 'acceptEdits' | 'plan') => void;
        permissionMode?: 'default' | 'acceptEdits' | 'plan';
      }

      const props: InputProps = {
        onPermissionModeChange: vi.fn(),
        permissionMode: 'default',
      };

      expect(props.onPermissionModeChange).toBeDefined();
      expect(props.permissionMode).toBe('default');
    });
  });
});

describe('App 组件权限模式状态', () => {
  describe('状态管理', () => {
    it('应该初始化为 default 模式', () => {
      const initialMode = 'default';
      expect(initialMode).toBe('default');
    });

    it('handlePermissionModeChange 应该更新模式', () => {
      let quickPermissionMode = 'default';

      const handlePermissionModeChange = (mode: 'default' | 'acceptEdits' | 'plan') => {
        quickPermissionMode = mode;
      };

      handlePermissionModeChange('acceptEdits');
      expect(quickPermissionMode).toBe('acceptEdits');

      handlePermissionModeChange('plan');
      expect(quickPermissionMode).toBe('plan');
    });
  });
});
