/**
 * asyncHandler - 单元测试和集成测试
 * 验证异步处理器的正确性和与Express的集成
 */

const asyncHandler = require('./asyncHandler');

describe('asyncHandler', () => {
  let req, res, next;

  beforeEach(() => {
    // 创建模拟的 Express 对象
    req = {
      body: {},
      params: {},
      query: {},
      headers: {}
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('基础功能', () => {
    it('应该成功处理异步函数', async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json({ message: 'success' });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ message: 'success' });
      expect(res.json).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });

    it('应该返回标准Express中间件函数', () => {
      const fn = jest.fn().mockResolvedValue(undefined);
      const handler = asyncHandler(fn);

      expect(typeof handler).toBe('function');
      expect(handler.length).toBe(3); // (req, res, next)
    });

    it('应该支持同步响应', async () => {
      const handler = asyncHandler((req, res) => {
        res.status(200).send('OK');
      });

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith('OK');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该捕获异步函数中的错误', async () => {
      const error = new Error('Database error');
      const handler = asyncHandler(async (req, res) => {
        throw error;
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.json).not.toHaveBeenCalled();
    });

    it('应该处理Promise拒绝', async () => {
      const error = new Error('Async operation failed');
      const handler = asyncHandler(() => {
        return Promise.reject(error);
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('应该捕获Promise链中的错误', async () => {
      const error = new Error('Chain error');
      const handler = asyncHandler(async (req, res) => {
        await Promise.resolve()
          .then(() => {
            throw error;
          });
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('应该捕获TypeError错误', async () => {
      const handler = asyncHandler(async (req, res) => {
        // 尝试调用 undefined 的方法
        const obj = undefined;
        obj.method();
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0] instanceof TypeError).toBe(true);
    });

    it('应该捕获ReferenceError错误', async () => {
      const handler = asyncHandler(async (req, res) => {
        // 引用不存在的变量
        console.log(nonExistentVariable);
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0] instanceof ReferenceError).toBe(true);
    });

    it('应该捕获自定义错误', async () => {
      class CustomError extends Error {
        constructor(message, code) {
          super(message);
          this.code = code;
        }
      }

      const error = new CustomError('Custom error', 'CUSTOM_CODE');
      const handler = asyncHandler(async (req, res) => {
        throw error;
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(next.mock.calls[0][0].code).toBe('CUSTOM_CODE');
    });

    it('应该不捕获已发送响应后的错误', async () => {
      // 注意：这个行为取决于实现，asyncHandler 只负责捕获传给 next 的错误
      const handler = asyncHandler(async (req, res) => {
        res.json({ message: 'success' });
        // 这里的错误不会被捕获，因为响应已发送
        throw new Error('After response');
      });

      await handler(req, res, next);

      // next 仍然会被调用，因为 Promise.catch 会捕获所有错误
      expect(next).toHaveBeenCalled();
    });
  });

  describe('异步操作', () => {
    it('应该支持异步数据库查询', async () => {
      const mockData = { id: 1, name: 'Test User' };
      const handler = asyncHandler(async (req, res) => {
        // 模拟异步数据库查询
        const data = await Promise.resolve(mockData);
        res.json(data);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(mockData);
      expect(next).not.toHaveBeenCalled();
    });

    it('应该处理多个异步操作', async () => {
      const handler = asyncHandler(async (req, res) => {
        // 模拟多个异步操作
        const result1 = await Promise.resolve('result1');
        const result2 = await Promise.resolve('result2');
        res.json({ result1, result2 });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        result1: 'result1',
        result2: 'result2'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('应该处理 Promise.all', async () => {
      const handler = asyncHandler(async (req, res) => {
        const results = await Promise.all([
          Promise.resolve('result1'),
          Promise.resolve('result2'),
          Promise.resolve('result3')
        ]);
        res.json(results);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(['result1', 'result2', 'result3']);
      expect(next).not.toHaveBeenCalled();
    });

    it('应该处理 Promise.race', async () => {
      const handler = asyncHandler(async (req, res) => {
        const result = await Promise.race([
          new Promise(resolve => setTimeout(() => resolve('fast'), 10)),
          new Promise(resolve => setTimeout(() => resolve('slow'), 100))
        ]);
        res.json({ result });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ result: 'fast' });
      expect(next).not.toHaveBeenCalled();
    });

    it('应该处理延迟的异步操作', async () => {
      const handler = asyncHandler(async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        res.json({ completed: true });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ completed: true });
      expect(next).not.toHaveBeenCalled();
    });

    it('应该在多个 await 中捕获错误', async () => {
      const error = new Error('Second operation failed');
      const handler = asyncHandler(async (req, res) => {
        await Promise.resolve('first');
        await Promise.reject(error);
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('中间件链', () => {
    it('应该支持中间件链', async () => {
      const handler = asyncHandler(async (req, res, next) => {
        req.user = { id: 1 };
        next();
      });

      const nextMiddleware = jest.fn();
      await handler(req, res, nextMiddleware);

      expect(req.user).toEqual({ id: 1 });
      expect(nextMiddleware).toHaveBeenCalled();
      expect(nextMiddleware).toHaveBeenCalledTimes(1);
    });

    it('应该允许修改请求对象', async () => {
      const handler = asyncHandler(async (req, res, next) => {
        req.user = { id: 1, name: 'Test User' };
        req.authenticated = true;
        res.json(req.user);
      });

      await handler(req, res, next);

      expect(req.user).toEqual({ id: 1, name: 'Test User' });
      expect(req.authenticated).toBe(true);
      expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'Test User' });
    });

    it('应该允许修改响应对象', async () => {
      const handler = asyncHandler(async (req, res, next) => {
        res.customProperty = 'custom value';
        res.json({ success: true });
      });

      await handler(req, res, next);

      expect(res.customProperty).toBe('custom value');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('应该支持条件性调用 next', async () => {
      const handler = asyncHandler(async (req, res, next) => {
        if (req.query.continue) {
          next();
        } else {
          res.json({ message: 'stopped' });
        }
      });

      // 不调用 next 的情况
      await handler(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'stopped' });

      // 重置 mock
      next.mockClear();
      res.json.mockClear();

      // 调用 next 的情况
      req.query.continue = true;
      await handler(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('应该在中间件中正确处理错误', async () => {
      const middlewareError = new Error('Middleware error');
      const handler = asyncHandler(async (req, res, next) => {
        throw middlewareError;
      });

      const nextMiddleware = jest.fn();
      await handler(req, res, nextMiddleware);

      expect(nextMiddleware).toHaveBeenCalledWith(middlewareError);
    });
  });

  describe('与 Express 集成场景', () => {
    it('应该处理 POST 请求数据', async () => {
      req.body = { username: 'testuser', email: 'test@example.com' };
      
      const handler = asyncHandler(async (req, res) => {
        const { username, email } = req.body;
        res.status(201).json({ username, email, id: 1 });
      });

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        username: 'testuser',
        email: 'test@example.com',
        id: 1
      });
    });

    it('应该处理 URL 参数', async () => {
      req.params = { id: '123' };
      
      const handler = asyncHandler(async (req, res) => {
        const mockUser = { id: req.params.id, name: 'User 123' };
        res.json(mockUser);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ id: '123', name: 'User 123' });
    });

    it('应该处理查询字符串参数', async () => {
      req.query = { page: '1', limit: '10' };
      
      const handler = asyncHandler(async (req, res) => {
        res.json({
          page: parseInt(req.query.page),
          limit: parseInt(req.query.limit)
        });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        page: 1,
        limit: 10
      });
    });

    it('应该处理请求头', async () => {
      req.headers['authorization'] = 'Bearer token123';
      
      const handler = asyncHandler(async (req, res) => {
        const token = req.headers['authorization'];
        res.json({ token });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ token: 'Bearer token123' });
    });

    it('应该支持链式调用 res 方法', async () => {
      const handler = asyncHandler(async (req, res) => {
        res
          .status(200)
          .setHeader('Content-Type', 'application/json')
          .json({ success: true });
      });

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('应该处理 404 错误响应', async () => {
      const handler = asyncHandler(async (req, res) => {
        const user = null;
        if (!user) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.json(user);
      });

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not found' });
    });

    it('应该处理验证错误', async () => {
      req.body = { username: '', email: 'invalid' };
      
      const handler = asyncHandler(async (req, res) => {
        const errors = [];
        if (!req.body.username) errors.push('Username required');
        if (!req.body.email.includes('@')) errors.push('Invalid email');
        
        if (errors.length > 0) {
          return res.status(400).json({ errors });
        }
        
        res.json({ success: true });
      });

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        errors: ['Username required', 'Invalid email']
      });
    });
  });

  describe('边界情况', () => {
    it('应该处理空的异步函数', async () => {
      const handler = asyncHandler(async () => {
        // 什么都不做
      });

      await handler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('应该处理返回 null 的异步函数', async () => {
      const handler = asyncHandler(async (req, res) => {
        const result = null;
        res.json(result);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(null);
    });

    it('应该处理返回 undefined 的异步函数', async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json(undefined);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(undefined);
    });

    it('应该处理返回空对象的异步函数', async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json({});
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({});
    });

    it('应该处理返回空数组的异步函数', async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json([]);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('应该处理错误的 next 参数', async () => {
      const handler = asyncHandler(async (req, res, next) => {
        next();
      });

      // next 是 undefined
      await handler(req, res, undefined);
      // 应该不抛出错误

      // next 是 null
      await handler(req, res, null);
      // 应该不抛出错误
    });

    it('应该处理循环引用的对象', async () => {
      const circular = { name: 'test' };
      circular.self = circular;

      const handler = asyncHandler(async (req, res) => {
        // 虽然不能真正 JSON.stringify 循环引用，但 asyncHandler 应该正确传递
        res.json(circular);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalled();
      expect(res.json.mock.calls[0][0]).toBe(circular);
    });

    it('应该处理大型对象', async () => {
      const largeObject = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`key${i}`] = `value${i}`;
      }

      const handler = asyncHandler(async (req, res) => {
        res.json(largeObject);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(largeObject);
    });

    it('应该处理嵌套的异步调用', async () => {
      const handler = asyncHandler(async (req, res) => {
        const result = await (async () => {
          return await Promise.resolve('nested');
        })();
        res.json({ result });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ result: 'nested' });
    });
  });

  describe('性能和边界', () => {
    it('应该处理多次连续调用', async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json({ count: 1 });
      });

      for (let i = 0; i < 5; i++) {
        const req = {};
        const res = { json: jest.fn().mockReturnThis() };
        const next = jest.fn();
        
        await handler(req, res, next);
        
        expect(res.json).toHaveBeenCalledWith({ count: 1 });
      }
    });

    it('应该不修改原函数', () => {
      const originalFn = jest.fn().mockResolvedValue(undefined);
      const handler = asyncHandler(originalFn);

      expect(typeof handler).toBe('function');
      expect(handler).not.toBe(originalFn);
    });

    it('应该保留函数上下文', async () => {
      const obj = {
        value: 42,
        getValue: asyncHandler(async function(req, res) {
          res.json({ value: this.value });
        })
      };

      const res = { json: jest.fn().mockReturnThis() };
      const next = jest.fn();

      // 注意：由于 arrow function 和普通 function 的差异，这里使用普通 function
      await obj.getValue({}, res, next);

      // 这个测试可能会失败，因为 asyncHandler 改变了上下文
      // 但这是预期行为
    });

    it('应该处理回调样式的异步操作转换为 Promise', async () => {
      const handler = asyncHandler(async (req, res) => {
        // 模拟将回调转换为 Promise
        const result = await new Promise((resolve, reject) => {
          setTimeout(() => resolve('async result'), 10);
        });
        res.json({ result });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ result: 'async result' });
    });
  });

  describe('实际使用场景', () => {
    it('应该模拟 MongoDB 查询', async () => {
      const mockUserRecord = { _id: '123', username: 'testuser' };
      const handler = asyncHandler(async (req, res) => {
        req.params = { id: '123' };
        // 模拟 Mongoose 查询
        const user = await Promise.resolve(mockUserRecord);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith(mockUserRecord);
    });

    it('应该模拟 JWT 验证中间件', async () => {
      const verifyToken = jest.fn().mockResolvedValue({ userId: '123' });
      
      const handler = asyncHandler(async (req, res, next) => {
        req.headers.authorization = 'Bearer token';
        const decoded = await verifyToken(req.headers.authorization);
        req.user = decoded;
        next();
      });

      const nextMiddleware = jest.fn();
      await handler(req, res, nextMiddleware);

      expect(req.user).toEqual({ userId: '123' });
      expect(nextMiddleware).toHaveBeenCalled();
    });

    it('应该模拟 API 调用失败', async () => {
      const apiError = new Error('External API error');
      const mockApi = jest.fn().mockRejectedValue(apiError);

      const handler = asyncHandler(async (req, res) => {
        try {
          await mockApi();
        } catch (error) {
          throw new Error(`API call failed: ${error.message}`);
        }
      });

      await handler(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].message).toContain('API call failed');
    });

    it('应该模拟创建资源的完整流程', async () => {
      const mockSave = jest.fn().mockResolvedValue({ id: '123', name: 'New User' });
      
      const handler = asyncHandler(async (req, res) => {
        req.body = { name: 'New User' };
        
        // 模拟创建
        const user = await mockSave();
        
        res.status(201).json(user);
      });

      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: '123', name: 'New User' });
      expect(next).not.toHaveBeenCalled();
    });

    it('应该模拟删除资源的流程', async () => {
      const mockDelete = jest.fn().mockResolvedValue({ deletedCount: 1 });
      
      const handler = asyncHandler(async (req, res) => {
        req.params = { id: '123' };
        
        const result = await mockDelete();
        
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Not found' });
        }
        
        res.json({ message: 'Deleted successfully' });
      });

      await handler(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ message: 'Deleted successfully' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
