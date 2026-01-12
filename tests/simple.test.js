// 最简单的测试 - 使用 CommonJS
const { describe, it, expect } = require('vitest');

describe('Simple Test', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
