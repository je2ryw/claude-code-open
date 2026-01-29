/**
 * Unit Tests for AppError Class
 * 
 * Tests cover:
 * - Constructor with various parameter combinations
 * - Error inheritance and properties
 * - Operational vs programming error distinction
 * - Stack trace maintenance
 * - Error handling scenarios
 * - Edge cases and boundary conditions
 */

const AppError = require('./AppError');

describe('AppError', () => {
  describe('Constructor - Basic Instantiation', () => {
    it('should create an instance with message only', () => {
      const error = new AppError('Test error message');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('AppError');
    });

    it('should set default statusCode to 500 when not provided', () => {
      const error = new AppError('Test error');

      expect(error.statusCode).toBe(500);
    });

    it('should set default isOperational to true when not provided', () => {
      const error = new AppError('Test error');

      expect(error.isOperational).toBe(true);
    });

    it('should accept all three parameters', () => {
      const error = new AppError('Full parameters', 404, false);

      expect(error.message).toBe('Full parameters');
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('Constructor - StatusCode Parameter', () => {
    it('should accept custom statusCode as second parameter', () => {
      const error = new AppError('Not found error', 404);

      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true); // Should default to true
    });

    it('should accept 400 Bad Request status code', () => {
      const error = new AppError('Bad request', 400);

      expect(error.statusCode).toBe(400);
    });

    it('should accept 401 Unauthorized status code', () => {
      const error = new AppError('Unauthorized', 401);

      expect(error.statusCode).toBe(401);
    });

    it('should accept 403 Forbidden status code', () => {
      const error = new AppError('Forbidden', 403);

      expect(error.statusCode).toBe(403);
    });

    it('should accept 409 Conflict status code', () => {
      const error = new AppError('Conflict', 409);

      expect(error.statusCode).toBe(409);
    });

    it('should accept 422 Unprocessable Entity status code', () => {
      const error = new AppError('Unprocessable entity', 422);

      expect(error.statusCode).toBe(422);
    });

    it('should accept 500 Internal Server Error status code', () => {
      const error = new AppError('Internal error', 500);

      expect(error.statusCode).toBe(500);
    });

    it('should accept any numeric statusCode', () => {
      const testCodes = [200, 201, 204, 300, 301, 302, 400, 401, 403, 404, 500, 502, 503];

      testCodes.forEach((code) => {
        const error = new AppError('Test', code);
        expect(error.statusCode).toBe(code);
      });
    });
  });

  describe('Constructor - IsOperational Parameter', () => {
    it('should create operational error (isOperational = true)', () => {
      const error = new AppError('Operational error', 400, true);

      expect(error.isOperational).toBe(true);
    });

    it('should create programming error (isOperational = false)', () => {
      const error = new AppError('Programming error', 500, false);

      expect(error.isOperational).toBe(false);
    });

    it('should default to operational error when isOperational not specified', () => {
      const error = new AppError('Default operational', 400);

      expect(error.isOperational).toBe(true);
    });

    it('should distinguish between operational and programming errors', () => {
      const operational = new AppError('Expected error', 400, true);
      const programming = new AppError('Unexpected error', 500, false);

      expect(operational.isOperational).toBe(true);
      expect(programming.isOperational).toBe(false);
      expect(operational.isOperational).not.toBe(programming.isOperational);
    });
  });

  describe('Error Properties', () => {
    it('should have correct name property', () => {
      const error = new AppError('Test');

      expect(error.name).toBe('AppError');
      expect(error.name).toEqual(error.constructor.name);
    });

    it('should preserve message through instance', () => {
      const message = 'User not found in database';
      const error = new AppError(message, 404);

      expect(error.message).toBe(message);
    });

    it('should have stack trace property', () => {
      const error = new AppError('Stack trace test');

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('should contain class name in stack trace', () => {
      const error = new AppError('Stack trace test');

      expect(error.stack).toContain('AppError');
    });

    it('should have all required properties', () => {
      const error = new AppError('Complete error', 404, false);

      expect(Object.prototype.hasOwnProperty.call(error, 'message')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(error, 'name')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(error, 'statusCode')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(error, 'isOperational')).toBe(true);
    });
  });

  describe('Error Inheritance', () => {
    it('should be instance of Error', () => {
      const error = new AppError('Test');

      expect(error instanceof Error).toBe(true);
    });

    it('should be instance of AppError', () => {
      const error = new AppError('Test');

      expect(error instanceof AppError).toBe(true);
    });

    it('should inherit Error methods', () => {
      const error = new AppError('Test');

      expect(typeof error.toString).toBe('function');
      expect(error.toString()).toContain('AppError');
    });

    it('should have Error properties accessible', () => {
      const error = new AppError('Test error message');

      expect(error.message).toBeDefined();
      expect(error.stack).toBeDefined();
      expect(error.name).toBeDefined();
    });
  });

  describe('Throwing and Catching', () => {
    it('should be throwable', () => {
      const throwFn = () => {
        throw new AppError('Throwable error', 400);
      };

      expect(throwFn).toThrow();
    });

    it('should be catchable as AppError', () => {
      const throwFn = () => {
        throw new AppError('Specific error', 404);
      };

      expect(throwFn).toThrow(AppError);
    });

    it('should be catchable with specific message', () => {
      const message = 'Specific error message';
      const throwFn = () => {
        throw new AppError(message, 400);
      };

      expect(throwFn).toThrow(message);
    });

    it('should be caught and inspected', () => {
      try {
        throw new AppError('Caught error', 403);
      } catch (err) {
        expect(err instanceof AppError).toBe(true);
        expect(err.statusCode).toBe(403);
        expect(err.message).toBe('Caught error');
        expect(err.isOperational).toBe(true);
      }
    });

    it('should maintain properties when caught', () => {
      const originalStatusCode = 409;
      const originalIsOperational = false;
      const originalMessage = 'Original message';

      try {
        throw new AppError(originalMessage, originalStatusCode, originalIsOperational);
      } catch (err) {
        expect(err.message).toBe(originalMessage);
        expect(err.statusCode).toBe(originalStatusCode);
        expect(err.isOperational).toBe(originalIsOperational);
      }
    });

    it('should work with try-catch-finally', () => {
      let finallyExecuted = false;

      try {
        throw new AppError('Test error', 500);
      } catch (err) {
        expect(err.statusCode).toBe(500);
      } finally {
        finallyExecuted = true;
      }

      expect(finallyExecuted).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should have serializable properties', () => {
      const error = new AppError('Serialization test', 400, true);

      const serialized = {
        message: error.message,
        statusCode: error.statusCode,
        isOperational: error.isOperational,
        name: error.name
      };

      expect(serialized.message).toBe('Serialization test');
      expect(serialized.statusCode).toBe(400);
      expect(serialized.isOperational).toBe(true);
    });

    it('should be JSON serializable via custom object', () => {
      const error = new AppError('JSON test', 404);

      const jsonObj = {
        status: 'error',
        statusCode: error.statusCode,
        message: error.message,
        isOperational: error.isOperational
      };

      const json = JSON.stringify(jsonObj);

      expect(json).toContain('"status":"error"');
      expect(json).toContain('"statusCode":404');
      expect(json).toContain('"message":"JSON test"');
    });

    it('should support converting to plain object', () => {
      const error = new AppError('Object conversion', 401, false);

      const plain = {
        message: error.message,
        statusCode: error.statusCode,
        isOperational: error.isOperational
      };

      expect(plain).toEqual({
        message: 'Object conversion',
        statusCode: 401,
        isOperational: false
      });
    });
  });

  describe('Error Message Edge Cases', () => {
    it('should handle empty string message', () => {
      const error = new AppError('', 400);

      expect(error.message).toBe('');
    });

    it('should handle very long message', () => {
      const longMessage = 'A'.repeat(1000);
      const error = new AppError(longMessage, 400);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(1000);
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Error: $pecial !@#$%^&*() characters';
      const error = new AppError(specialMessage, 400);

      expect(error.message).toBe(specialMessage);
    });

    it('should handle unicode characters in message', () => {
      const unicodeMessage = '错误: 用户未找到 🚀';
      const error = new AppError(unicodeMessage, 404);

      expect(error.message).toBe(unicodeMessage);
    });

    it('should handle newlines in message', () => {
      const multilineMessage = 'Error on\nmultiple\nlines';
      const error = new AppError(multilineMessage, 400);

      expect(error.message).toBe(multilineMessage);
    });
  });

  describe('StatusCode Edge Cases', () => {
    it('should accept zero as statusCode', () => {
      const error = new AppError('Zero status', 0);

      expect(error.statusCode).toBe(0);
    });

    it('should accept negative statusCode', () => {
      const error = new AppError('Negative status', -1);

      expect(error.statusCode).toBe(-1);
    });

    it('should accept large statusCode', () => {
      const error = new AppError('Large status', 999);

      expect(error.statusCode).toBe(999);
    });

    it('should preserve statusCode type as number', () => {
      const error = new AppError('Type check', 404);

      expect(typeof error.statusCode).toBe('number');
    });
  });

  describe('IsOperational Edge Cases', () => {
    it('should handle isOperational as true boolean', () => {
      const error = new AppError('Test', 400, true);

      expect(error.isOperational).toBe(true);
      expect(typeof error.isOperational).toBe('boolean');
    });

    it('should handle isOperational as false boolean', () => {
      const error = new AppError('Test', 500, false);

      expect(error.isOperational).toBe(false);
      expect(typeof error.isOperational).toBe('boolean');
    });

    it('should be truthy for operational error', () => {
      const error = new AppError('Test', 400, true);

      expect(error.isOperational).toBeTruthy();
    });

    it('should be falsy for programming error', () => {
      const error = new AppError('Test', 500, false);

      expect(error.isOperational).toBeFalsy();
    });
  });

  describe('Multiple Error Instances', () => {
    it('should create independent error instances', () => {
      const error1 = new AppError('Error 1', 400);
      const error2 = new AppError('Error 2', 404);

      expect(error1.message).toBe('Error 1');
      expect(error2.message).toBe('Error 2');
      expect(error1).not.toBe(error2);
    });

    it('should not share properties between instances', () => {
      const error1 = new AppError('Error 1', 400, true);
      const error2 = new AppError('Error 2', 500, false);

      expect(error1.statusCode).not.toBe(error2.statusCode);
      expect(error1.isOperational).not.toBe(error2.isOperational);
      expect(error1.message).not.toBe(error2.message);
    });

    it('should support creating array of errors', () => {
      const errors = [
        new AppError('Error 1', 400),
        new AppError('Error 2', 404),
        new AppError('Error 3', 500)
      ];

      expect(errors.length).toBe(3);
      expect(errors[0].statusCode).toBe(400);
      expect(errors[1].statusCode).toBe(404);
      expect(errors[2].statusCode).toBe(500);
    });
  });

  describe('Real World Scenarios', () => {
    it('should handle validation error scenario', () => {
      const validationError = new AppError('Email is required', 400, true);

      expect(validationError.statusCode).toBe(400);
      expect(validationError.isOperational).toBe(true);
      expect(validationError.message).toContain('Email');
    });

    it('should handle resource not found scenario', () => {
      const notFoundError = new AppError('User with ID 123 not found', 404, true);

      expect(notFoundError.statusCode).toBe(404);
      expect(notFoundError.isOperational).toBe(true);
    });

    it('should handle duplicate resource scenario', () => {
      const duplicateError = new AppError('Email already registered', 409, true);

      expect(duplicateError.statusCode).toBe(409);
      expect(duplicateError.isOperational).toBe(true);
    });

    it('should handle authentication error scenario', () => {
      const authError = new AppError('Authentication token required', 401, true);

      expect(authError.statusCode).toBe(401);
      expect(authError.isOperational).toBe(true);
    });

    it('should handle authorization error scenario', () => {
      const authzError = new AppError('You do not have permission to access this resource', 403, true);

      expect(authzError.statusCode).toBe(403);
      expect(authzError.isOperational).toBe(true);
    });

    it('should handle database error scenario', () => {
      const dbError = new AppError('Database connection failed', 500, false);

      expect(dbError.statusCode).toBe(500);
      expect(dbError.isOperational).toBe(false);
    });

    it('should handle business logic error scenario', () => {
      const businessError = new AppError('Invalid state transition', 400, true);

      expect(businessError.statusCode).toBe(400);
      expect(businessError.isOperational).toBe(true);
    });
  });

  describe('Stack Trace', () => {
    it('should have defined stack property', () => {
      const error = new AppError('Stack test');

      expect(error.stack).toBeDefined();
    });

    it('should contain AppError in stack', () => {
      const error = new AppError('Stack test');

      expect(error.stack).toContain('AppError');
    });

    it('should include file information in stack', () => {
      const error = new AppError('Stack test');

      expect(error.stack).toContain('at');
    });

    it('should maintain different stacks for different errors', () => {
      const error1 = new AppError('Error 1');
      const error2 = new AppError('Error 2');

      expect(error1.stack).not.toBe(error2.stack);
    });
  });

  describe('Type Checking', () => {
    it('should be identifiable by instanceof', () => {
      const error = new AppError('Test');

      expect(error instanceof AppError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('should have correct constructor reference', () => {
      const error = new AppError('Test');

      expect(error.constructor.name).toBe('AppError');
    });

    it('should support Object.getPrototypeOf', () => {
      const error = new AppError('Test');
      const proto = Object.getPrototypeOf(error);

      expect(proto.constructor.name).toBe('AppError');
    });
  });

  describe('Integration Scenarios', () => {
    it('should work in Promise rejection', (done) => {
      const promise = Promise.reject(new AppError('Promise error', 500));

      promise.catch((err) => {
        expect(err instanceof AppError).toBe(true);
        expect(err.statusCode).toBe(500);
        done();
      });
    });

    it('should work in async/await scenario', async () => {
      async function throwError() {
        throw new AppError('Async error', 404);
      }

      try {
        await throwError();
      } catch (err) {
        expect(err instanceof AppError).toBe(true);
        expect(err.statusCode).toBe(404);
      }
    });

    it('should work with error checking in conditional', () => {
      const error = new AppError('Conditional check', 400, true);

      if (error instanceof AppError && error.isOperational) {
        expect(error.statusCode).toBe(400);
      } else {
        fail('Should reach operational error branch');
      }
    });

    it('should work with error checking for programming errors', () => {
      const error = new AppError('Programming error', 500, false);

      if (error instanceof AppError && !error.isOperational) {
        expect(error.statusCode).toBe(500);
      } else {
        fail('Should reach programming error branch');
      }
    });
  });

  describe('Constructor Parameter Combinations', () => {
    it('should handle all parameters as positional arguments', () => {
      const error = new AppError('Full params', 403, true);

      expect(error.message).toBe('Full params');
      expect(error.statusCode).toBe(403);
      expect(error.isOperational).toBe(true);
    });

    it('should handle message and statusCode only', () => {
      const error = new AppError('Two params', 401);

      expect(error.message).toBe('Two params');
      expect(error.statusCode).toBe(401);
      expect(error.isOperational).toBe(true);
    });

    it('should handle message only', () => {
      const error = new AppError('One param');

      expect(error.message).toBe('One param');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    it('should preserve parameter order importance', () => {
      const error1 = new AppError('Msg', 400, true);
      const error2 = new AppError('Msg', 400, false);

      expect(error1.isOperational).not.toBe(error2.isOperational);
    });
  });

  describe('Error Comparison', () => {
    it('should compare operational errors correctly', () => {
      const error1 = new AppError('Error', 404, true);
      const error2 = new AppError('Error', 404, true);

      expect(error1.statusCode).toBe(error2.statusCode);
      expect(error1.isOperational).toBe(error2.isOperational);
      expect(error1.message).toBe(error2.message);
    });

    it('should distinguish different status codes', () => {
      const error1 = new AppError('Error', 400);
      const error2 = new AppError('Error', 404);

      expect(error1.statusCode).not.toBe(error2.statusCode);
    });

    it('should distinguish operational from programming', () => {
      const operational = new AppError('Error', 400, true);
      const programming = new AppError('Error', 400, false);

      expect(operational.isOperational).not.toBe(programming.isOperational);
    });
  });
});
