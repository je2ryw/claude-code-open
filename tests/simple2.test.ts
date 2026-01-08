import { test, expect } from 'vitest';

console.log('[SIMPLE TEST] File loaded');

test('basic math', () => {
  console.log('[SIMPLE TEST] test executed');
  expect(1 + 1).toBe(2);
});

console.log('[SIMPLE TEST] File end');
