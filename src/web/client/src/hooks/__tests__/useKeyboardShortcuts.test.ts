/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts, ShortcutConfig, formatShortcut } from '../useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  let handleKeyDown: (e: KeyboardEvent) => void;

  beforeEach(() => {
    // 捕获事件监听器
    const originalAddEventListener = window.addEventListener;
    window.addEventListener = vi.fn((event, handler) => {
      if (event === 'keydown') {
        handleKeyDown = handler as (e: KeyboardEvent) => void;
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createKeyEvent = (
    key: string,
    modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}
  ): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey: modifiers.ctrl || false,
      metaKey: modifiers.meta || false,
      shiftKey: modifiers.shift || false,
      altKey: modifiers.alt || false,
      bubbles: true,
      cancelable: true
    });
    vi.spyOn(event, 'preventDefault');
    return event;
  };

  it('should trigger handler for simple key', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        handler,
        description: 'Test'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    const event = createKeyEvent('p');
    handleKeyDown(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should trigger handler for Ctrl+key', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        ctrl: true,
        handler,
        description: 'Test'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Should not trigger without Ctrl
    let event = createKeyEvent('p');
    handleKeyDown(event);
    expect(handler).not.toHaveBeenCalled();

    // Should trigger with Ctrl
    event = createKeyEvent('p', { ctrl: true });
    handleKeyDown(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should trigger handler for Cmd+key (meta)', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        meta: true,
        handler,
        description: 'Test'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Should trigger with meta
    const event = createKeyEvent('p', { meta: true });
    handleKeyDown(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should trigger handler for complex combination Cmd+Shift+key', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        meta: true,
        shift: true,
        handler,
        description: 'Test'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Should not trigger without Shift
    let event = createKeyEvent('p', { meta: true });
    handleKeyDown(event);
    expect(handler).not.toHaveBeenCalled();

    // Should trigger with both
    event = createKeyEvent('p', { meta: true, shift: true });
    handleKeyDown(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not trigger if extra modifiers are pressed', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        meta: true,
        handler,
        description: 'Test'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    // Should not trigger with extra Ctrl
    const event = createKeyEvent('p', { meta: true, ctrl: true });
    handleKeyDown(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple shortcuts', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        meta: true,
        handler: handler1,
        description: 'Test 1'
      },
      {
        key: 's',
        meta: true,
        handler: handler2,
        description: 'Test 2'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    handleKeyDown(createKeyEvent('p', { meta: true }));
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    handleKeyDown(createKeyEvent('s', { meta: true }));
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should be case insensitive', () => {
    const handler = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'P',
        handler,
        description: 'Test'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    handleKeyDown(createKeyEvent('p'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should stop at first matching shortcut', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const shortcuts: ShortcutConfig[] = [
      {
        key: 'p',
        handler: handler1,
        description: 'Test 1'
      },
      {
        key: 'p',
        handler: handler2,
        description: 'Test 2'
      }
    ];

    renderHook(() => useKeyboardShortcuts(shortcuts));

    handleKeyDown(createKeyEvent('p'));
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });
});

describe('formatShortcut', () => {
  it('should format simple key', () => {
    expect(formatShortcut({ key: 'p', handler: vi.fn(), description: '' }))
      .toBe('P');
  });

  it('should format Ctrl+key', () => {
    expect(formatShortcut({ key: 'p', ctrl: true, handler: vi.fn(), description: '' }))
      .toBe('Ctrl+P');
  });

  it('should format Cmd+key', () => {
    expect(formatShortcut({ key: 'p', meta: true, handler: vi.fn(), description: '' }))
      .toBe('Cmd+P');
  });

  it('should format complex combination', () => {
    expect(formatShortcut({
      key: 'p',
      ctrl: true,
      shift: true,
      alt: true,
      handler: vi.fn(),
      description: ''
    })).toBe('Ctrl+Shift+Alt+P');
  });

  it('should format Cmd+Shift+key', () => {
    expect(formatShortcut({
      key: 'p',
      meta: true,
      shift: true,
      handler: vi.fn(),
      description: ''
    })).toBe('Cmd+Shift+P');
  });
});
