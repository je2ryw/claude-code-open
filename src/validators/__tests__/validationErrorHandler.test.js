const { validationResult } = require('express-validator');
const {
  handleValidationErrors,
  formatValidationErrors,
  buildValidationErrorResponse
} = require('../validationErrorHandler');
const AppError = require('../../utils/errors');

/**
 * 模拟Express的res对象
 */
const createMockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis()
});

/**
 * 模拟Express的next函数
 */
const createMockNext = () => jest.fn();

/**
 * 模拟Express的request对象
 */
const createMockRequest = (bodyData = {}) => ({
  body: bodyData
});

describe('validationErrorHandler - formatValidationErrors', () => {
  test('should format single error for a field', () => {
    const errors = [
      { param: 'email', msg: 'Invalid email' }
    ];
    const result = formatValidationErrors(errors);
    expect(result).toEqual({
      email: ['Invalid email']
    });
  });

  test('should format multiple errors for same field', () => {
    const errors = [
      { param: 'password', msg: 'Password too short' },
      { param: 'password', msg: 'Must contain a number' }
    ];
    const result = formatValidationErrors(errors);
    expect(result).toEqual({
      password: ['Password too short', 'Must contain a number']
    });
  });

  test('should format errors for multiple fields', () => {
    const errors = [
      { param: 'email', msg: 'Invalid email' },
      { param: 'username', msg: 'Username too short' },
      { param: 'password', msg: 'Password too short' }
    ];
    const result = formatValidationErrors(errors);
    expect(result).toEqual({
      email: ['Invalid email'],
      username: ['Username too short'],
      password: ['Password too short']
    });
  });

  test('should handle mixed single and multiple errors', () => {
    const errors = [
      { param: 'email', msg: 'Invalid email' },
      { param: 'password', msg: 'Password too short' },
      { param: 'password', msg: 'Must contain a number' }
    ];
    const result = formatValidationErrors(errors);
    expect(result).toEqual({
      email: ['Invalid email'],
      password: ['Password too short', 'Must contain a number']
    });
  });

  test('should handle empty errors array', () => {
    const errors = [];
    const result = formatValidationErrors(errors);
    expect(result).toEqual({});
  });

  test('should handle errors with additional properties', () => {
    const errors = [
      { param: 'email', msg: 'Invalid email', value: 'invalid' },
      { param: 'username', msg: 'Too short', value: 'ab', location: 'body' }
    ];
    const result = formatValidationErrors(errors);
    expect(result).toEqual({
      email: ['Invalid email'],
      username: ['Too short']
    });
  });
});

describe('validationErrorHandler - buildValidationErrorResponse', () => {
  test('should build error response with status 422', () => {
    const error = AppError.validationError('Validation Error');
    error.validationErrors = {
      email: ['Invalid email'],
      password: ['Too short']
    };
    const response = buildValidationErrorResponse(error);
    
    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(422);
    expect(response.message).toBe('Validation Error');
    expect(response.errors).toEqual({
      email: ['Invalid email'],
      password: ['Too short']
    });
  });

  test('should build error response with custom message', () => {
    const error = new AppError('Custom validation failed', 422, true);
    error.validationErrors = {
      field: ['Error message']
    };
    const response = buildValidationErrorResponse(error);
    
    expect(response.message).toBe('Custom validation failed');
    expect(response.statusCode).toBe(422);
  });

  test('should handle error without validation errors property', () => {
    const error = AppError.validationError('Validation Error');
    const response = buildValidationErrorResponse(error);
    
    expect(response.errors).toEqual({});
  });

  test('should use error statusCode if available', () => {
    const error = new AppError('Test error', 400, true);
    error.validationErrors = {};
    const response = buildValidationErrorResponse(error);
    
    expect(response.statusCode).toBe(400);
  });

  test('should default statusCode to 422 if not specified', () => {
    const error = new Error('Generic error');
    error.statusCode = undefined;
    error.validationErrors = {};
    const response = buildValidationErrorResponse(error);
    
    expect(response.statusCode).toBe(422);
  });
});

describe('validationErrorHandler - handleValidationErrors middleware', () => {
  test('should call next() when there are no validation errors', () => {
    const req = createMockRequest({ email: 'valid@example.com' });
    const res = createMockResponse();
    const next = createMockNext();
    
    // Mock validationResult to return no errors
    jest.mock('express-validator', () => ({
      ...jest.requireActual('express-validator'),
      validationResult: jest.fn(() => ({
        isEmpty: () => true,
        array: () => []
      }))
    }));

    handleValidationErrors(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('should pass error to next when validation fails', () => {
    const req = createMockRequest({ email: 'invalid' });
    const res = createMockResponse();
    const next = createMockNext();

    // Create mock validation result with errors
    const mockErrors = {
      isEmpty: () => false,
      array: () => [
        { param: 'email', msg: 'Invalid email' }
      ]
    };

    // Mock validationResult
    jest.spyOn(require('express-validator'), 'validationResult').mockReturnValue(mockErrors);

    handleValidationErrors(req, res, next);

    expect(next).toHaveBeenCalled();
    const passedError = next.mock.calls[0][0];
    expect(passedError).toBeInstanceOf(AppError);
    expect(passedError.statusCode).toBe(422);
  });

  test('should format validation errors before passing to next', () => {
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();

    const mockErrors = {
      isEmpty: () => false,
      array: () => [
        { param: 'email', msg: 'Email is required' },
        { param: 'password', msg: 'Password is required' }
      ]
    };

    jest.spyOn(require('express-validator'), 'validationResult').mockReturnValue(mockErrors);

    handleValidationErrors(req, res, next);

    const passedError = next.mock.calls[0][0];
    expect(passedError.validationErrors).toEqual({
      email: ['Email is required'],
      password: ['Password is required']
    });
  });

  test('should handle multiple errors for same field', () => {
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();

    const mockErrors = {
      isEmpty: () => false,
      array: () => [
        { param: 'password', msg: 'Too short' },
        { param: 'password', msg: 'Must contain a number' }
      ]
    };

    jest.spyOn(require('express-validator'), 'validationResult').mockReturnValue(mockErrors);

    handleValidationErrors(req, res, next);

    const passedError = next.mock.calls[0][0];
    expect(passedError.validationErrors.password).toEqual([
      'Too short',
      'Must contain a number'
    ]);
  });

  test('should not call next after error when validation fails', () => {
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();

    const mockErrors = {
      isEmpty: () => false,
      array: () => [{ param: 'email', msg: 'Invalid' }]
    };

    jest.spyOn(require('express-validator'), 'validationResult').mockReturnValue(mockErrors);

    handleValidationErrors(req, res, next);

    // next should be called with error, not without arguments
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0].length).toBe(1);
  });

  test('should return when errors are empty (no further processing)', () => {
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();

    const mockErrors = {
      isEmpty: () => true,
      array: () => []
    };

    jest.spyOn(require('express-validator'), 'validationResult').mockReturnValue(mockErrors);

    const result = handleValidationErrors(req, res, next);

    // When errors are empty, next() is called and undefined is returned
    expect(next).toHaveBeenCalledWith();
  });

  test('should pass AppError instance with correct statusCode', () => {
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();

    const mockErrors = {
      isEmpty: () => false,
      array: () => [
        { param: 'email', msg: 'Invalid email' }
      ]
    };

    jest.spyOn(require('express-validator'), 'validationResult').mockReturnValue(mockErrors);

    handleValidationErrors(req, res, next);

    const passedError = next.mock.calls[0][0];
    expect(passedError.statusCode).toBe(422);
    expect(passedError.isOperational).toBe(true);
  });
});

describe('validationErrorHandler - Integration scenarios', () => {
  test('should handle typical user registration validation failures', () => {
    const errors = [
      { param: 'username', msg: 'Username is required' },
      { param: 'email', msg: 'Invalid email' },
      { param: 'password', msg: 'Password too short' }
    ];

    const formatted = formatValidationErrors(errors);
    const appError = AppError.fromValidationErrors(errors);
    appError.validationErrors = formatted;
    const response = buildValidationErrorResponse(appError);

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(422);
    expect(Object.keys(response.errors).length).toBe(3);
    expect(response.errors.username).toContain('Username is required');
    expect(response.errors.email).toContain('Invalid email');
    expect(response.errors.password).toContain('Password too short');
  });

  test('should handle single field with multiple validation rules failing', () => {
    const errors = [
      { param: 'password', msg: 'Too short' },
      { param: 'password', msg: 'Must contain uppercase' },
      { param: 'password', msg: 'Must contain number' }
    ];

    const formatted = formatValidationErrors(errors);
    expect(formatted.password).toHaveLength(3);
    expect(formatted.password).toEqual([
      'Too short',
      'Must contain uppercase',
      'Must contain number'
    ]);
  });

  test('should handle complex validation with multiple errors per field', () => {
    const errors = [
      { param: 'email', msg: 'Email is required' },
      { param: 'email', msg: 'Invalid email format' },
      { param: 'password', msg: 'Password is required' },
      { param: 'confirmPassword', msg: 'Passwords do not match' }
    ];

    const formatted = formatValidationErrors(errors);
    const response = buildValidationErrorResponse(
      AppError.validationError('Multiple validation errors')
    );
    response.errors = formatted;

    expect(Object.keys(formatted).length).toBe(3);
    expect(formatted.email).toHaveLength(2);
    expect(formatted.password).toHaveLength(1);
    expect(formatted.confirmPassword).toHaveLength(1);
  });
});
