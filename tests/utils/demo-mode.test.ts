/**
 * IS_DEMO 环境变量测试
 *
 * 测试官方 v2.1.0 新增功能：
 * "Added IS_DEMO environment variable to hide email and organization from the UI,
 * useful for streaming or recording sessions"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isDemoMode, isTruthy } from '../../src/utils/env-check';

describe('isDemoMode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 重置环境变量
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('IS_DEMO 环境变量检测', () => {
    it('当 IS_DEMO 未设置时应返回 false', () => {
      delete process.env.IS_DEMO;
      expect(isDemoMode()).toBe(false);
    });

    it('当 IS_DEMO=1 时应返回 true', () => {
      process.env.IS_DEMO = '1';
      expect(isDemoMode()).toBe(true);
    });

    it('当 IS_DEMO=true 时应返回 true', () => {
      process.env.IS_DEMO = 'true';
      expect(isDemoMode()).toBe(true);
    });

    it('当 IS_DEMO=TRUE 时应返回 true (不区分大小写)', () => {
      process.env.IS_DEMO = 'TRUE';
      expect(isDemoMode()).toBe(true);
    });

    it('当 IS_DEMO=yes 时应返回 true', () => {
      process.env.IS_DEMO = 'yes';
      expect(isDemoMode()).toBe(true);
    });

    it('当 IS_DEMO=on 时应返回 true', () => {
      process.env.IS_DEMO = 'on';
      expect(isDemoMode()).toBe(true);
    });

    it('当 IS_DEMO=0 时应返回 false', () => {
      process.env.IS_DEMO = '0';
      expect(isDemoMode()).toBe(false);
    });

    it('当 IS_DEMO=false 时应返回 false', () => {
      process.env.IS_DEMO = 'false';
      expect(isDemoMode()).toBe(false);
    });

    it('当 IS_DEMO=no 时应返回 false', () => {
      process.env.IS_DEMO = 'no';
      expect(isDemoMode()).toBe(false);
    });

    it('当 IS_DEMO 有前后空格时应正常处理', () => {
      process.env.IS_DEMO = '  true  ';
      expect(isDemoMode()).toBe(true);
    });

    it('当 IS_DEMO 为空字符串时应返回 false', () => {
      process.env.IS_DEMO = '';
      expect(isDemoMode()).toBe(false);
    });
  });
});

describe('isTruthy', () => {
  describe('官网源码行为验证', () => {
    // 官网源码实现:
    // function i1(A){
    //   if(!A)return!1;
    //   if(typeof A==="boolean")return A;
    //   let Q=A.toLowerCase().trim();
    //   return["1","true","yes","on"].includes(Q)
    // }

    it('undefined 应返回 false', () => {
      expect(isTruthy(undefined)).toBe(false);
    });

    it('空字符串应返回 false', () => {
      expect(isTruthy('')).toBe(false);
    });

    it('boolean true 应返回 true', () => {
      expect(isTruthy(true)).toBe(true);
    });

    it('boolean false 应返回 false', () => {
      expect(isTruthy(false)).toBe(false);
    });

    it('"1" 应返回 true', () => {
      expect(isTruthy('1')).toBe(true);
    });

    it('"true" 应返回 true', () => {
      expect(isTruthy('true')).toBe(true);
    });

    it('"yes" 应返回 true', () => {
      expect(isTruthy('yes')).toBe(true);
    });

    it('"on" 应返回 true', () => {
      expect(isTruthy('on')).toBe(true);
    });

    it('"TRUE" 应返回 true (不区分大小写)', () => {
      expect(isTruthy('TRUE')).toBe(true);
    });

    it('"  true  " 应返回 true (trim 处理)', () => {
      expect(isTruthy('  true  ')).toBe(true);
    });

    it('"0" 应返回 false', () => {
      expect(isTruthy('0')).toBe(false);
    });

    it('"false" 应返回 false', () => {
      expect(isTruthy('false')).toBe(false);
    });

    it('"no" 应返回 false', () => {
      expect(isTruthy('no')).toBe(false);
    });

    it('"off" 应返回 false', () => {
      expect(isTruthy('off')).toBe(false);
    });

    it('任意其他字符串应返回 false', () => {
      expect(isTruthy('random')).toBe(false);
      expect(isTruthy('maybe')).toBe(false);
      expect(isTruthy('enabled')).toBe(false);
    });
  });
});

describe('Demo 模式 UI 隐藏行为', () => {
  /**
   * 这些测试验证 UI 组件的隐藏逻辑
   * 根据官网源码:
   * - !process.env.IS_DEMO && D.oauthAccount?.organizationName
   * - if(A.organization&&!process.env.IS_DEMO)Q.push({label:"Organization",value:A.organization});
   * - if(A.email&&!process.env.IS_DEMO)Q.push({label:"Email",value:A.email});
   */

  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('非 Demo 模式时 organization 应显示', () => {
    delete process.env.IS_DEMO;
    const organization = 'Anthropic';

    // 模拟 UI 逻辑: organization && !isDemoMode()
    const shouldShow = organization && !isDemoMode();
    expect(shouldShow).toBe(true);
  });

  it('Demo 模式时 organization 应隐藏', () => {
    process.env.IS_DEMO = '1';
    const organization = 'Anthropic';

    // 模拟 UI 逻辑: organization && !isDemoMode()
    const shouldShow = organization && !isDemoMode();
    expect(shouldShow).toBe(false);
  });

  it('非 Demo 模式时 email 应显示', () => {
    delete process.env.IS_DEMO;
    const email = 'user@anthropic.com';

    // 模拟 UI 逻辑: email && !isDemoMode()
    const shouldShow = email && !isDemoMode();
    expect(shouldShow).toBe(true);
  });

  it('Demo 模式时 email 应隐藏', () => {
    process.env.IS_DEMO = '1';
    const email = 'user@anthropic.com';

    // 模拟 UI 逻辑: email && !isDemoMode()
    const shouldShow = email && !isDemoMode();
    expect(shouldShow).toBe(false);
  });

  it('Demo 模式时空的 organization 不应显示', () => {
    process.env.IS_DEMO = '1';
    const organization = '';

    // 空字符串在 && 短路求值中是 falsy，结果是 ''
    const shouldShow = organization && !isDemoMode();
    expect(shouldShow).toBeFalsy();
  });

  it('Demo 模式时 undefined organization 不应显示', () => {
    process.env.IS_DEMO = '1';
    const organization: string | undefined = undefined;

    // undefined 在 && 短路求值中是 falsy，结果是 undefined
    const shouldShow = organization && !isDemoMode();
    expect(shouldShow).toBeFalsy();
  });
});
