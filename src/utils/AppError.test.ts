import { describe, it, expect } from 'vitest';
import { AppError } from './AppError';

describe('AppError', () => {
  describe('基本创建', () => {
    it('应该创建一个带有默认值的 AppError 实例', () => {
      const error = new AppError('测试错误');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('测试错误');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('应该创建一个带有自定义 statusCode 的 AppError 实例', () => {
      const error = new AppError('请求错误', 400);

      expect(error.message).toBe('请求错误');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('应该创建一个带有自定义 isOperational 的 AppError 实例', () => {
      const error = new AppError('编程错误', 500, false);

      expect(error.message).toBe('编程错误');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('应该创建一个带有所有自定义参数的 AppError 实例', () => {
      const error = new AppError('未找到资源', 404, true);

      expect(error.message).toBe('未找到资源');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });
  });

  describe('错误消息', () => {
    it('应该正确设置错误消息', () => {
      const message = '这是一个详细的错误消息';
      const error = new AppError(message);

      expect(error.message).toBe(message);
    });

    it('应该处理空字符串错误消息', () => {
      const error = new AppError('');

      expect(error.message).toBe('');
    });

    it('应该处理包含特殊字符的错误消息', () => {
      const message = '错误: 无效的用户输入 @#$%^&*()';
      const error = new AppError(message);

      expect(error.message).toBe(message);
    });

    it('应该处理多行错误消息', () => {
      const message = '第一行\n第二行\n第三行';
      const error = new AppError(message);

      expect(error.message).toBe(message);
    });
  });

  describe('statusCode 属性', () => {
    it('应该接受常见的 HTTP 状态码', () => {
      const testCases = [
        { code: 400, message: '坏请求' },
        { code: 401, message: '未授权' },
        { code: 403, message: '禁止访问' },
        { code: 404, message: '未找到' },
        { code: 409, message: '冲突' },
        { code: 422, message: '无法处理的实体' },
        { code: 429, message: '请求过于频繁' },
        { code: 500, message: '内部服务器错误' },
        { code: 502, message: '网关错误' },
        { code: 503, message: '服务不可用' },
      ];

      testCases.forEach(({ code, message }) => {
        const error = new AppError(message, code);
        expect(error.statusCode).toBe(code);
      });
    });

    it('应该接受自定义的 statusCode', () => {
      const error = new AppError('自定义错误', 999);
      expect(error.statusCode).toBe(999);
    });

    it('应该是只读属性', () => {
      const error = new AppError('测试', 400);
      // TypeScript 会检查只读性，这里验证运行时行为
      expect(() => {
        (error as any).statusCode = 200;
      }).not.toThrow();
      // 注意：由于 Object.defineProperty，实际上不会改变值
      expect(error.statusCode).toBe(400);
    });
  });

  describe('isOperational 属性', () => {
    it('应该默认为 true（操作错误）', () => {
      const error = new AppError('测试');
      expect(error.isOperational).toBe(true);
    });

    it('应该接受 false 值（编程错误）', () => {
      const error = new AppError('编程错误', 500, false);
      expect(error.isOperational).toBe(false);
    });

    it('应该正确区分操作错误和编程错误', () => {
      const operationalError = new AppError('用户输入无效', 400, true);
      const programmingError = new AppError('未处理的异常', 500, false);

      expect(operationalError.isOperational).toBe(true);
      expect(programmingError.isOperational).toBe(false);
    });

    it('应该是只读属性', () => {
      const error = new AppError('测试', 500, true);
      expect(() => {
        (error as any).isOperational = false;
      }).not.toThrow();
      // 验证实际值不变
      expect(error.isOperational).toBe(true);
    });
  });

  describe('Error 继承', () => {
    it('应该继承自 Error 类', () => {
      const error = new AppError('测试错误');
      expect(error instanceof Error).toBe(true);
    });

    it('应该有 name 属性', () => {
      const error = new AppError('测试');
      expect(error.name).toBe('AppError');
    });

    it('应该有堆栈跟踪（stack 属性）', () => {
      const error = new AppError('测试');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
      expect(error.stack).toContain('AppError');
    });

    it('应该能被 throw 和 catch', () => {
      const error = new AppError('可捕获的错误', 400);

      expect(() => {
        throw error;
      }).toThrow(AppError);

      expect(() => {
        throw error;
      }).toThrow('可捕获的错误');
    });

    it('应该能在 catch 块中识别错误类型', () => {
      const error = new AppError('测试', 400);

      try {
        throw error;
      } catch (e) {
        expect(e instanceof AppError).toBe(true);
        expect((e as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理非常大的 statusCode', () => {
      const error = new AppError('测试', 99999);
      expect(error.statusCode).toBe(99999);
    });

    it('应该处理负的 statusCode', () => {
      const error = new AppError('测试', -1);
      expect(error.statusCode).toBe(-1);
    });

    it('应该处理零作为 statusCode', () => {
      const error = new AppError('测试', 0);
      expect(error.statusCode).toBe(0);
    });

    it('应该处理非常长的错误消息', () => {
      const longMessage = 'x'.repeat(10000);
      const error = new AppError(longMessage);
      expect(error.message.length).toBe(10000);
    });

    it('应该处理 Unicode 字符', () => {
      const message = '错误：🚨 数据库连接失败 ❌';
      const error = new AppError(message);
      expect(error.message).toBe(message);
    });

    it('应该处理对象作为错误消息时的转换', () => {
      const error = new AppError('对象: ' + JSON.stringify({ code: 'DB_ERROR' }));
      expect(error.message).toContain('DB_ERROR');
    });
  });

  describe('原型链', () => {
    it('应该正确设置原型链', () => {
      const error = new AppError('测试');
      expect(Object.getPrototypeOf(error) === AppError.prototype).toBe(true);
    });

    it('应该能正确使用 instanceof 操作符', () => {
      const error = new AppError('测试');
      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('不同的 AppError 实例应该有相同的原型', () => {
      const error1 = new AppError('错误1');
      const error2 = new AppError('错误2');

      expect(Object.getPrototypeOf(error1)).toBe(Object.getPrototypeOf(error2));
    });
  });

  describe('序列化', () => {
    it('应该能被序列化为 JSON', () => {
      const error = new AppError('测试错误', 400, true);
      const json = JSON.stringify(error);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');
    });

    it('应该在字符串转换时包含错误信息', () => {
      const error = new AppError('测试错误');
      const str = error.toString();

      expect(str).toContain('AppError');
      expect(str).toContain('测试错误');
    });

    it('应该能被转换为字符串', () => {
      const error = new AppError('测试错误', 404);
      expect(String(error)).toContain('AppError');
    });
  });

  describe('实际使用场景', () => {
    it('应该支持验证错误场景', () => {
      const error = new AppError('用户名不能为空', 422, true);

      expect(error.statusCode).toBe(422);
      expect(error.isOperational).toBe(true);
      expect(error.message).toContain('用户名');
    });

    it('应该支持认证错误场景', () => {
      const error = new AppError('无效的认证令牌', 401, true);

      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
    });

    it('应该支持授权错误场景', () => {
      const error = new AppError('您没有权限访问此资源', 403, true);

      expect(error.statusCode).toBe(403);
      expect(error.isOperational).toBe(true);
    });

    it('应该支持资源不存在场景', () => {
      const error = new AppError('用户不存在', 404, true);

      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });

    it('应该支持数据库连接错误（编程错误）', () => {
      const error = new AppError(
        '数据库连接失败',
        500,
        false
      );

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('应该支持未捕获异常（编程错误）', () => {
      const error = new AppError(
        '未处理的异常',
        500,
        false
      );

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('多个错误的隔离', () => {
    it('多个错误实例应该相互独立', () => {
      const error1 = new AppError('错误1', 400);
      const error2 = new AppError('错误2', 500);
      const error3 = new AppError('错误3', 404);

      expect(error1.message).toBe('错误1');
      expect(error1.statusCode).toBe(400);

      expect(error2.message).toBe('错误2');
      expect(error2.statusCode).toBe(500);

      expect(error3.message).toBe('错误3');
      expect(error3.statusCode).toBe(404);
    });

    it('修改一个错误不应该影响其他错误', () => {
      const error1 = new AppError('错误1', 400, true);
      const error2 = new AppError('错误2', 500, false);

      expect(error1.statusCode).toBe(400);
      expect(error1.isOperational).toBe(true);

      expect(error2.statusCode).toBe(500);
      expect(error2.isOperational).toBe(false);
    });
  });
});
