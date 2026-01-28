/**
 * AppError 错误类的测试文件
 * 验证所有工厂方法和错误属性的正确性
 */

import { describe, it, expect } from 'vitest';
import AppError from './errors.js';

describe('AppError Class', () => {
  describe('Constructor', () => {
    it('should create an AppError with default values', () => {
      const error = new AppError('Test error');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create an AppError with custom statusCode', () => {
      const error = new AppError('Not found', 404);
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.isOperational).toBe(true);
    });

    it('should create an AppError with isOperational=false', () => {
      const error = new AppError('Server error', 500, false);
      
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
      expect(error.stack).toContain('errors.test.js');
    });
  });

  describe('toJSON method', () => {
    it('should convert error to JSON without stack in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new AppError('Test error', 400);
      const json = error.toJSON();
      
      expect(json).toEqual({
        name: 'AppError',
        message: 'Test error',
        statusCode: 400,
        isOperational: true
      });
      expect(json.stack).toBeUndefined();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include stack in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new AppError('Test error', 400);
      const json = error.toJSON();
      
      expect(json.stack).toBeDefined();
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Factory Methods - HTTP Status Errors', () => {
    it('badRequest should create 400 error', () => {
      const error = AppError.badRequest('Invalid input');
      
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.isOperational).toBe(true);
    });

    it('unauthorized should create 401 error', () => {
      const error = AppError.unauthorized('Invalid credentials');
      
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid credentials');
      expect(error.isOperational).toBe(true);
    });

    it('forbidden should create 403 error', () => {
      const error = AppError.forbidden('Access denied');
      
      expect(error.statusCode).toBe(403);
      expect(error.message).toBe('Access denied');
      expect(error.isOperational).toBe(true);
    });

    it('notFound should create 404 error', () => {
      const error = AppError.notFound('User not found');
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('User not found');
      expect(error.isOperational).toBe(true);
    });

    it('conflict should create 409 error', () => {
      const error = AppError.conflict('Email already exists');
      
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('Email already exists');
      expect(error.isOperational).toBe(true);
    });

    it('validationError should create 422 error', () => {
      const error = AppError.validationError('Invalid format');
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Invalid format');
      expect(error.isOperational).toBe(true);
    });

    it('tooManyRequests should create 429 error', () => {
      const error = AppError.tooManyRequests('Rate limit exceeded');
      
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.isOperational).toBe(true);
    });

    it('internalServerError should create 500 error with isOperational=false', () => {
      const error = AppError.internalServerError('Database connection failed');
      
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Database connection failed');
      expect(error.isOperational).toBe(false);
    });

    it('serviceUnavailable should create 503 error', () => {
      const error = AppError.serviceUnavailable('Service is down');
      
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe('Service is down');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('Factory Methods - Specific Errors', () => {
    it('databaseError should create 500 operational error', () => {
      const error = AppError.databaseError('MongoDB connection failed');
      
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('MongoDB connection failed');
      expect(error.isOperational).toBe(false);
    });

    it('authenticationError should create 401 error', () => {
      const error = AppError.authenticationError('Invalid JWT');
      
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid JWT');
      expect(error.isOperational).toBe(true);
    });

    it('fieldDuplicate should create conflict error with formatted message', () => {
      const error = AppError.fieldDuplicate('email', 'test@example.com');
      
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe('email "test@example.com" already exists');
      expect(error.isOperational).toBe(true);
    });

    it('fieldMissing should create 400 error', () => {
      const error = AppError.fieldMissing('username');
      
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('username is required');
      expect(error.isOperational).toBe(true);
    });

    it('fieldInvalid should create 400 error with format', () => {
      const error = AppError.fieldInvalid('email', 'a valid email address');
      
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('email must be a valid email address');
      expect(error.isOperational).toBe(true);
    });

    it('resourceNotFound should create 404 error', () => {
      const error = AppError.resourceNotFound('User', '507f1f77bcf86cd799439011');
      
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain('User');
      expect(error.message).toContain('507f1f77bcf86cd799439011');
      expect(error.isOperational).toBe(true);
    });

    it('insufficientPermission should create 403 error', () => {
      const error = AppError.insufficientPermission('delete this post');
      
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain('permission');
      expect(error.message).toContain('delete this post');
      expect(error.isOperational).toBe(true);
    });

    it('invalidToken should create 401 error', () => {
      const error = AppError.invalidToken('Malformed token');
      
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Malformed token');
      expect(error.isOperational).toBe(true);
    });

    it('tokenExpired should create 401 error', () => {
      const error = AppError.tokenExpired();
      
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Token has expired');
      expect(error.isOperational).toBe(true);
    });

    it('operationFailed should create 400 error', () => {
      const error = AppError.operationFailed('User update', 'Duplicate email');
      
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('User update');
      expect(error.message).toContain('Duplicate email');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('fromValidationErrors method', () => {
    it('should handle array of error objects from express-validator', () => {
      const validationErrors = [
        { param: 'email', msg: 'Invalid email' },
        { param: 'password', msg: 'Too short' }
      ];
      
      const error = AppError.fromValidationErrors(validationErrors);
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toContain('email: Invalid email');
      expect(error.message).toContain('password: Too short');
      expect(error.isOperational).toBe(true);
    });

    it('should handle array of strings', () => {
      const errors = ['Email is invalid', 'Password too short'];
      
      const error = AppError.fromValidationErrors(errors);
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Email is invalid, Password too short');
      expect(error.isOperational).toBe(true);
    });

    it('should handle string error message', () => {
      const error = AppError.fromValidationErrors('Invalid input');
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Invalid input');
      expect(error.isOperational).toBe(true);
    });

    it('should handle empty array', () => {
      const error = AppError.fromValidationErrors([]);
      
      expect(error.statusCode).toBe(422);
      expect(error.message).toBe('Validation Error');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('Default messages', () => {
    it('should provide default messages when not specified', () => {
      expect(AppError.badRequest().message).toBe('Bad Request');
      expect(AppError.unauthorized().message).toBe('Unauthorized');
      expect(AppError.forbidden().message).toBe('Forbidden');
      expect(AppError.notFound().message).toBe('Not Found');
      expect(AppError.conflict().message).toBe('Conflict');
      expect(AppError.validationError().message).toBe('Validation Error');
      expect(AppError.tooManyRequests().message).toBe('Too Many Requests');
      expect(AppError.internalServerError().message).toBe('Internal Server Error');
      expect(AppError.serviceUnavailable().message).toBe('Service Unavailable');
    });
  });

  describe('Inheritance and instanceof', () => {
    it('should be instance of both AppError and Error', () => {
      const error = new AppError('Test');
      
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
    });

    it('factory methods should return AppError instances', () => {
      const errors = [
        AppError.badRequest(),
        AppError.unauthorized(),
        AppError.notFound(),
        AppError.conflict(),
        AppError.fieldDuplicate('field', 'value'),
        AppError.invalidToken(),
        AppError.tokenExpired()
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(Error);
      });
    });
  });
});
