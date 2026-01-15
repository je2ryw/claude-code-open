/**
 * Kitty 键盘协议测试 (v2.1.6)
 *
 * 测试 Kitty 渐进增强键盘协议的解析功能
 */

import { describe, it, expect } from 'vitest';
import {
  KITTY_CSI_U_REGEX,
  parseKittyModifiers,
  keycodeToKeyName,
  parseKittyKey,
  isKittyTerminal,
  supportsEnhancedKeyboard,
  isShiftEnter,
  isShiftTab,
  KITTY_KEYBOARD,
  SPECIAL_SEQUENCES,
} from '../../src/ui/utils/kitty-keyboard.js';

describe('Kitty Keyboard Protocol', () => {
  describe('KITTY_CSI_U_REGEX', () => {
    it('should match Kitty CSI u format', () => {
      expect(KITTY_CSI_U_REGEX.test('\x1b[13;2u')).toBe(true);  // Shift+Enter
      expect(KITTY_CSI_U_REGEX.test('\x1b[9;2u')).toBe(true);   // Shift+Tab
      expect(KITTY_CSI_U_REGEX.test('\x1b[97;5u')).toBe(true);  // Ctrl+a
      expect(KITTY_CSI_U_REGEX.test('\x1b[27u')).toBe(true);    // Escape (no modifiers)
    });

    it('should not match non-Kitty formats', () => {
      expect(KITTY_CSI_U_REGEX.test('\x1b\r')).toBe(false);     // 传统 Shift+Enter
      expect(KITTY_CSI_U_REGEX.test('\x1b[Z')).toBe(false);     // 传统 Shift+Tab
      expect(KITTY_CSI_U_REGEX.test('a')).toBe(false);          // 普通字符
      expect(KITTY_CSI_U_REGEX.test('')).toBe(false);           // 空字符串
    });

    it('should extract keycode and modifiers', () => {
      const match1 = KITTY_CSI_U_REGEX.exec('\x1b[13;2u');
      expect(match1).not.toBeNull();
      expect(match1![1]).toBe('13');
      expect(match1![2]).toBe('2');

      const match2 = KITTY_CSI_U_REGEX.exec('\x1b[27u');
      expect(match2).not.toBeNull();
      expect(match2![1]).toBe('27');
      expect(match2![2]).toBeUndefined();
    });
  });

  describe('parseKittyModifiers', () => {
    it('should parse no modifiers (1)', () => {
      const mods = parseKittyModifiers(1);
      expect(mods.shift).toBe(false);
      expect(mods.ctrl).toBe(false);
      expect(mods.meta).toBe(false);
      expect(mods.alt).toBe(false);
    });

    it('should parse Shift (2)', () => {
      const mods = parseKittyModifiers(2);
      expect(mods.shift).toBe(true);
      expect(mods.ctrl).toBe(false);
      expect(mods.meta).toBe(false);
    });

    it('should parse Alt (3)', () => {
      const mods = parseKittyModifiers(3);
      expect(mods.shift).toBe(false);
      expect(mods.alt).toBe(true);
      expect(mods.meta).toBe(true);
    });

    it('should parse Ctrl (5)', () => {
      const mods = parseKittyModifiers(5);
      expect(mods.shift).toBe(false);
      expect(mods.ctrl).toBe(true);
    });

    it('should parse Ctrl+Shift (6)', () => {
      const mods = parseKittyModifiers(6);
      expect(mods.shift).toBe(true);
      expect(mods.ctrl).toBe(true);
    });

    it('should parse Ctrl+Alt (7)', () => {
      const mods = parseKittyModifiers(7);
      expect(mods.ctrl).toBe(true);
      expect(mods.alt).toBe(true);
    });
  });

  describe('keycodeToKeyName', () => {
    it('should map standard control characters', () => {
      expect(keycodeToKeyName(9)).toBe('tab');
      expect(keycodeToKeyName(13)).toBe('return');
      expect(keycodeToKeyName(27)).toBe('escape');
      expect(keycodeToKeyName(32)).toBe('space');
      expect(keycodeToKeyName(127)).toBe('backspace');
    });

    it('should map ASCII printable characters', () => {
      expect(keycodeToKeyName(97)).toBe('a');
      expect(keycodeToKeyName(65)).toBe('a'); // uppercase also maps to lowercase
      expect(keycodeToKeyName(48)).toBe('0');
      expect(keycodeToKeyName(57)).toBe('9');
    });

    it('should map Kitty keypad keys', () => {
      expect(keycodeToKeyName(57399)).toBe('0'); // KP_0
      expect(keycodeToKeyName(57414)).toBe('return'); // KP_Enter
    });

    it('should return undefined for unknown keycodes', () => {
      expect(keycodeToKeyName(0)).toBeUndefined();
      expect(keycodeToKeyName(1)).toBeUndefined();
    });
  });

  describe('parseKittyKey', () => {
    it('should parse Shift+Enter', () => {
      const key = parseKittyKey('\x1b[13;2u');
      expect(key).not.toBeNull();
      expect(key!.name).toBe('return');
      expect(key!.shift).toBe(true);
      expect(key!.ctrl).toBe(false);
      expect(key!.keycode).toBe(13);
    });

    it('should parse Shift+Tab', () => {
      const key = parseKittyKey('\x1b[9;2u');
      expect(key).not.toBeNull();
      expect(key!.name).toBe('tab');
      expect(key!.shift).toBe(true);
    });

    it('should parse Ctrl+a', () => {
      const key = parseKittyKey('\x1b[97;5u');
      expect(key).not.toBeNull();
      expect(key!.name).toBe('a');
      expect(key!.ctrl).toBe(true);
    });

    it('should parse key without modifiers', () => {
      const key = parseKittyKey('\x1b[27u');
      expect(key).not.toBeNull();
      expect(key!.name).toBe('escape');
      expect(key!.shift).toBe(false);
      expect(key!.ctrl).toBe(false);
    });

    it('should return null for non-Kitty sequences', () => {
      expect(parseKittyKey('\x1b\r')).toBeNull();
      expect(parseKittyKey('\x1b[Z')).toBeNull();
      expect(parseKittyKey('a')).toBeNull();
    });
  });

  describe('isShiftEnter', () => {
    it('should detect Kitty Shift+Enter', () => {
      expect(isShiftEnter('\x1b[13;2u')).toBe(true);
    });

    it('should detect traditional Shift+Enter', () => {
      expect(isShiftEnter('\x1b\r')).toBe(true);
    });

    it('should not match other sequences', () => {
      expect(isShiftEnter('\x1b[9;2u')).toBe(false);  // Shift+Tab
      expect(isShiftEnter('\x1b[13;5u')).toBe(false); // Ctrl+Enter
      expect(isShiftEnter('a')).toBe(false);
    });
  });

  describe('isShiftTab', () => {
    it('should detect Kitty Shift+Tab', () => {
      expect(isShiftTab('\x1b[9;2u')).toBe(true);
    });

    it('should detect traditional Shift+Tab', () => {
      expect(isShiftTab('\x1b[Z')).toBe(true);
    });

    it('should not match other sequences', () => {
      expect(isShiftTab('\x1b[13;2u')).toBe(false);   // Shift+Enter
      expect(isShiftTab('\x1b[9;5u')).toBe(false);    // Ctrl+Tab
      expect(isShiftTab('a')).toBe(false);
    });
  });

  describe('KITTY_KEYBOARD constants', () => {
    it('should have correct escape sequences', () => {
      expect(KITTY_KEYBOARD.ENABLE).toBe('\x1b[>1u');
      expect(KITTY_KEYBOARD.ENABLE_FULL).toBe('\x1b[>31u');
      expect(KITTY_KEYBOARD.DISABLE).toBe('\x1b[<u');
      expect(KITTY_KEYBOARD.QUERY).toBe('\x1b[?u');
    });

    it('should generate push/pop sequences', () => {
      expect(KITTY_KEYBOARD.push(1)).toBe('\x1b[>1u');
      expect(KITTY_KEYBOARD.push(31)).toBe('\x1b[>31u');
      expect(KITTY_KEYBOARD.pop()).toBe('\x1b[<u');
    });
  });

  describe('SPECIAL_SEQUENCES constants', () => {
    it('should have correct Shift+Enter sequences', () => {
      expect(SPECIAL_SEQUENCES.SHIFT_ENTER_KITTY).toBe('\x1b[13;2u');
      expect(SPECIAL_SEQUENCES.SHIFT_ENTER_LEGACY).toBe('\x1b\r');
    });

    it('should have correct Shift+Tab sequences', () => {
      expect(SPECIAL_SEQUENCES.SHIFT_TAB_KITTY).toBe('\x1b[9;2u');
      expect(SPECIAL_SEQUENCES.SHIFT_TAB_LEGACY).toBe('\x1b[Z');
    });
  });

  describe('Terminal detection', () => {
    // These tests depend on environment variables
    // We'll just ensure the functions don't throw

    it('isKittyTerminal should return boolean', () => {
      const result = isKittyTerminal();
      expect(typeof result).toBe('boolean');
    });

    it('supportsEnhancedKeyboard should return boolean', () => {
      const result = supportsEnhancedKeyboard();
      expect(typeof result).toBe('boolean');
    });
  });
});
