/**
 * 烟雾测试 - 验证 vitest 框架是否正常工作
 */

console.log('[SMOKE TEST] File loaded');

import { describe, it, expect } from 'vitest';

console.log('[SMOKE TEST] Imports loaded');

describe('Smoke Test', () => {
  console.log('[SMOKE TEST] describe block executed');

  it('should pass basic assertion', () => {
    console.log('[SMOKE TEST] test 1 executed');
    expect(1 + 1).toBe(2);
  });

  it('should handle string comparison', () => {
    console.log('[SMOKE TEST] test 2 executed');
    expect('hello').toBe('hello');
  });

  it('should handle object comparison', () => {
    console.log('[SMOKE TEST] test 3 executed');
    expect({ a: 1 }).toEqual({ a: 1 });
  });

  it('should handle array comparison', () => {
    console.log('[SMOKE TEST] test 4 executed');
    expect([1, 2, 3]).toEqual([1, 2, 3]);
  });

  it('should handle boolean', () => {
    console.log('[SMOKE TEST] test 5 executed');
    expect(true).toBe(true);
    expect(false).toBe(false);
  });
});

console.log('[SMOKE TEST] File end');
