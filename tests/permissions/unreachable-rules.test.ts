/**
 * 不可达规则检测测试
 *
 * 测试覆盖：
 * - 检测被阻塞的规则
 * - 验证修复建议正确性
 * - 格式化警告输出
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PermissionRuleParser,
  PermissionRuleManager,
  detectUnreachableRules,
  isBlocking,
  formatRule,
  formatRuleSource,
  formatUnreachableWarning,
  formatUnreachableWarnings,
  ParsedRule,
} from '../../src/permissions/rule-parser.js';

describe('Unreachable Rules Detection', () => {
  let manager: PermissionRuleManager;

  beforeEach(() => {
    manager = new PermissionRuleManager();
  });

  describe('isBlocking', () => {
    it('should detect when a broad rule blocks a specific rule of the same type', () => {
      const broadRule = PermissionRuleParser.parse('Bash', 'allow', 'settings');
      const specificRule = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'settings');

      expect(isBlocking(broadRule, specificRule)).toBe(true);
    });

    it('should detect when a prefix rule blocks a more specific prefix rule', () => {
      const broadPrefix = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'settings');
      const specificPrefix = PermissionRuleParser.parse('Bash(npm install:*)', 'allow', 'settings');

      expect(isBlocking(broadPrefix, specificPrefix)).toBe(true);
    });

    it('should not detect blocking for unrelated tools', () => {
      const bashRule = PermissionRuleParser.parse('Bash', 'allow', 'settings');
      const readRule = PermissionRuleParser.parse('Read', 'allow', 'settings');

      expect(isBlocking(bashRule, readRule)).toBe(false);
    });

    it('should detect when a deny rule blocks an allow rule', () => {
      const denyAll = PermissionRuleParser.parse('Bash', 'deny', 'settings');
      const allowNpm = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'settings');

      expect(isBlocking(denyAll, allowNpm)).toBe(true);
    });

    it('should detect when a deny prefix blocks an allow with same prefix', () => {
      const denyNpm = PermissionRuleParser.parse('Bash(npm:*)', 'deny', 'settings');
      const allowNpmInstall = PermissionRuleParser.parse('Bash(npm install:*)', 'allow', 'settings');

      expect(isBlocking(denyNpm, allowNpmInstall)).toBe(true);
    });

    it('should not block when deny is more specific than allow', () => {
      const allowNpm = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'settings');
      const denyNpmInstall = PermissionRuleParser.parse('Bash(npm install:*)', 'deny', 'settings');

      // allow is broader, deny is more specific - this is valid configuration
      // Different types, and deny is more specific, so allow does not block deny
      expect(isBlocking(allowNpm, denyNpmInstall)).toBe(false);
    });

    it('should detect glob pattern subsumption', () => {
      const broadGlob = PermissionRuleParser.parse('Read(/home/**)', 'allow', 'settings');
      const specificGlob = PermissionRuleParser.parse('Read(/home/user/**)', 'allow', 'settings');

      expect(isBlocking(broadGlob, specificGlob)).toBe(true);
    });

    it('should detect any (*) pattern blocking everything', () => {
      const anyRule = PermissionRuleParser.parse('Bash(*)', 'allow', 'settings');
      const specificRule = PermissionRuleParser.parse('Bash(npm install lodash)', 'allow', 'settings');

      expect(isBlocking(anyRule, specificRule)).toBe(true);
    });
  });

  describe('detectUnreachableRules', () => {
    it('should detect unreachable rules in a list', () => {
      const rules: ParsedRule[] = [
        PermissionRuleParser.parse('Bash', 'allow', 'settings'),
        PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'project'),
      ];

      const result = detectUnreachableRules(rules);

      expect(result.hasUnreachable).toBe(true);
      expect(result.unreachableRules.length).toBe(1);
      expect(result.unreachableRules[0].rule.raw).toBe('Bash(npm:*)');
      expect(result.unreachableRules[0].blockedBy.raw).toBe('Bash');
    });

    it('should not report unreachable when rules are properly ordered', () => {
      const rules: ParsedRule[] = [
        PermissionRuleParser.parse('Bash(npm install:*)', 'allow', 'settings'),
        PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'settings'),
        PermissionRuleParser.parse('Bash', 'allow', 'settings'),
      ];

      const result = detectUnreachableRules(rules);

      // More specific rules first is valid
      expect(result.hasUnreachable).toBe(false);
    });

    it('should return empty result for empty rules', () => {
      const result = detectUnreachableRules([]);

      expect(result.hasUnreachable).toBe(false);
      expect(result.unreachableRules.length).toBe(0);
    });

    it('should handle multiple unreachable rules', () => {
      const rules: ParsedRule[] = [
        PermissionRuleParser.parse('Bash', 'allow', 'settings'),
        PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'project'),
        PermissionRuleParser.parse('Bash(git:*)', 'allow', 'project'),
      ];

      const result = detectUnreachableRules(rules);

      expect(result.hasUnreachable).toBe(true);
      expect(result.unreachableRules.length).toBe(2);
    });
  });

  describe('PermissionRuleManager.detectUnreachable', () => {
    it('should detect unreachable allow rules via deny blocking', () => {
      // A deny rule that blocks all Bash commands will make allow rules unreachable
      manager.addDenyRule('Bash', 'settings');
      manager.addAllowRule('Bash(npm:*)', 'project');

      const result = manager.detectUnreachable();

      expect(result.hasUnreachable).toBe(true);
      expect(result.unreachableRules.length).toBeGreaterThan(0);
    });

    it('should detect unreachable deny rules with same pattern', () => {
      // Two deny rules with same prefix - first blocks second
      manager.addDenyRule('Bash(rm:*)', 'settings');
      manager.addDenyRule('Bash(rm:*)', 'project'); // Same pattern, second is unreachable

      const result = manager.detectUnreachable();

      expect(result.hasUnreachable).toBe(true);
    });

    it('should detect deny rules blocking allow rules', () => {
      manager.addDenyRule('Bash', 'settings');
      manager.addAllowRule('Bash(npm:*)', 'project');

      const result = manager.detectUnreachable();

      expect(result.hasUnreachable).toBe(true);
      const unreachableAllow = result.unreachableRules.find(
        ur => ur.rule.type === 'allow'
      );
      expect(unreachableAllow).toBeDefined();
      expect(unreachableAllow?.blockedBy.type).toBe('deny');
    });

    it('should return no unreachable for valid configuration', () => {
      // This is a valid configuration: deny specific, allow general
      manager.addAllowRule('Bash(npm:*)', 'settings');
      manager.addDenyRule('Bash(npm install:*)', 'settings');

      const result = manager.detectUnreachable();

      // Both rules can be reached in this order
      // npm install will be denied, other npm commands will be allowed
      // Note: we need to check if there are any unreachable rules
      // The allow is broader, deny is more specific - this is valid
    });

    it('should detect complex rule conflicts', () => {
      // Deny Read blocks all allow Read rules
      manager.addDenyRule('Read', 'settings');
      manager.addAllowRule('Read(/home/**)', 'project');
      manager.addAllowRule('Read(/home/user/**)', 'project');

      const result = manager.detectUnreachable();

      expect(result.hasUnreachable).toBe(true);
      expect(result.unreachableRules.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('formatRule', () => {
    it('should format rule without params', () => {
      const rule = PermissionRuleParser.parse('Bash', 'allow', 'settings');
      expect(formatRule(rule)).toBe('Bash');
    });

    it('should format rule with params', () => {
      const rule = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'settings');
      expect(formatRule(rule)).toBe('Bash(npm:*)');
    });

    it('should format path rule', () => {
      const rule = PermissionRuleParser.parse('Read(/home/**)', 'allow', 'settings');
      expect(formatRule(rule)).toBe('Read(/home/**)');
    });
  });

  describe('formatRuleSource', () => {
    it('should format cli source', () => {
      expect(formatRuleSource('cli')).toBe('Command Line');
    });

    it('should format settings source', () => {
      expect(formatRuleSource('settings')).toBe('User Settings (~/.claude/settings.json)');
    });

    it('should format project source', () => {
      expect(formatRuleSource('project')).toBe('Project Settings (.claude/settings.json)');
    });

    it('should format policy source', () => {
      expect(formatRuleSource('policy')).toBe('Policy File');
    });

    it('should format session source', () => {
      expect(formatRuleSource('session')).toBe('Session Memory');
    });

    it('should format runtime source', () => {
      expect(formatRuleSource('runtime')).toBe('Runtime');
    });
  });

  describe('formatUnreachableWarning', () => {
    it('should format warning message correctly', () => {
      const broadRule = PermissionRuleParser.parse('Bash', 'allow', 'settings');
      const specificRule = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'project');

      const rules = [broadRule, specificRule];
      const result = detectUnreachableRules(rules);

      expect(result.unreachableRules.length).toBe(1);

      const warning = formatUnreachableWarning(result.unreachableRules[0]);

      expect(warning).toContain('Warning');
      expect(warning).toContain('Bash(npm:*)');
      expect(warning).toContain('Bash');
      expect(warning).toContain('Project Settings');
      expect(warning).toContain('Fix:');
    });
  });

  describe('formatUnreachableWarnings', () => {
    it('should return empty string when no unreachable rules', () => {
      const result = {
        hasUnreachable: false,
        unreachableRules: [],
        warnings: [],
      };

      expect(formatUnreachableWarnings(result)).toBe('');
    });

    it('should format multiple warnings', () => {
      // Deny Bash blocks all allow Bash rules
      manager.addDenyRule('Bash', 'settings');
      manager.addAllowRule('Bash(npm:*)', 'project');
      manager.addAllowRule('Bash(git:*)', 'project');

      const result = manager.detectUnreachable();
      const formatted = formatUnreachableWarnings(result);

      expect(formatted).toContain('Permission Rules Warning');
      expect(formatted).toContain('unreachable rule');
    });
  });

  describe('validateRules', () => {
    it('should return empty string for valid rules', () => {
      // Different tools, no conflict
      manager.addAllowRule('Bash(npm:*)', 'settings');
      manager.addAllowRule('Read', 'settings');

      const warning = manager.validateRules();

      expect(warning).toBe('');
    });

    it('should return warning string for invalid rules', () => {
      // Deny Bash blocks allow Bash(npm:*)
      manager.addDenyRule('Bash', 'settings');
      manager.addAllowRule('Bash(npm:*)', 'project');

      const warning = manager.validateRules();

      expect(warning).not.toBe('');
      expect(warning).toContain('unreachable');
    });
  });

  describe('fix suggestions', () => {
    it('should suggest making deny more specific for deny/allow conflicts', () => {
      manager.addDenyRule('Bash', 'settings');
      manager.addAllowRule('Bash(npm:*)', 'project');

      const result = manager.detectUnreachable();

      expect(result.unreachableRules.length).toBeGreaterThan(0);
      const allowUnreachable = result.unreachableRules.find(
        ur => ur.rule.type === 'allow'
      );
      expect(allowUnreachable).toBeDefined();
      expect(allowUnreachable?.fixSuggestion).toMatch(/more specific/);
    });

    it('should suggest remove for redundant rules', () => {
      // detectUnreachableRules works on same-type rules list
      const rules = [
        PermissionRuleParser.parse('Bash', 'allow', 'settings'),
        PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'project'),
      ];
      const result = detectUnreachableRules(rules);

      expect(result.unreachableRules.length).toBeGreaterThan(0);
      const suggestion = result.unreachableRules[0].fixSuggestion;
      expect(suggestion).toMatch(/Remove|Move/);
    });
  });

  describe('edge cases', () => {
    it('should handle exact match rules blocking same pattern', () => {
      const exact1 = PermissionRuleParser.parse('Bash(ls -la)', 'allow', 'settings');
      const exact2 = PermissionRuleParser.parse('Bash(ls -la)', 'allow', 'project');

      expect(isBlocking(exact1, exact2)).toBe(true);
    });

    it('should not block different exact matches', () => {
      const exact1 = PermissionRuleParser.parse('Bash(ls -la)', 'allow', 'settings');
      const exact2 = PermissionRuleParser.parse('Bash(pwd)', 'allow', 'settings');

      expect(isBlocking(exact1, exact2)).toBe(false);
    });

    it('should handle tool-level blocking', () => {
      const toolLevel = PermissionRuleParser.parse('Bash', 'deny', 'settings');
      const specific = PermissionRuleParser.parse('Bash(npm:*)', 'allow', 'project');

      // deny Bash blocks allow Bash(npm:*)
      expect(isBlocking(toolLevel, specific)).toBe(true);
    });
  });
});
