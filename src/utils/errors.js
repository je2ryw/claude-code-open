/**
 * 自定义错误类和工厂方法
 * 
 * AppError - 应用程序自定义错误基类
 * 提供statusCode、isOperational等属性，用于区分可预测的操作错误和未知错误
 * 
 * 使用方法:
 * throw new AppError('Invalid input', 400);
 * throw AppError.badRequest('Email already exists');
 * throw AppError.unauthorized('Invalid token');
 * throw AppError.notFound('User not found');
 */

/**
 * 自定义错误类 - 继承自Error
 * 
 * @class AppError
 * @extends {Error}
 * @property {number} statusCode - HTTP状态码
 * @property {boolean} isOperational - 是否为操作性错误（true时可安全返回给客户端）
 * @property {string} message - 错误消息
 */
class AppError extends Error {
  /**
   * 创建AppError实例
   * @param {string} message - 错误消息
   * @param {number} statusCode - HTTP状态码，默认为500
   * @param {boolean} isOperational - 是否为操作性错误，默认为true
   */
  constructor(message, statusCode = 500, isOperational = true) {
    // 调用父类Error的构造函数
    super(message);
    
    // 设置属性
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    // 捕获错误堆栈信息
    Error.captureStackTrace(this, this.constructor);
    
    // 设置错误名称为类名，便于调试
    this.name = this.constructor.name;
  }

  /**
   * 将错误转换为JSON格式
   * @returns {Object} 错误的JSON表示
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }
}

/**
 * 工厂方法集合 - 创建常见的标准错误
 */

/**
 * 400 Bad Request - 请求参数无效
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.badRequest = (message = 'Bad Request') => {
  return new AppError(message, 400, true);
};

/**
 * 401 Unauthorized - 未授权，需要身份验证
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.unauthorized = (message = 'Unauthorized') => {
  return new AppError(message, 401, true);
};

/**
 * 403 Forbidden - 禁止访问，已认证但权限不足
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.forbidden = (message = 'Forbidden') => {
  return new AppError(message, 403, true);
};

/**
 * 404 Not Found - 资源不存在
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.notFound = (message = 'Not Found') => {
  return new AppError(message, 404, true);
};

/**
 * 409 Conflict - 资源冲突，如唯一性约束冲突
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.conflict = (message = 'Conflict') => {
  return new AppError(message, 409, true);
};

/**
 * 422 Unprocessable Entity - 验证错误，无法处理请求实体
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.validationError = (message = 'Validation Error') => {
  return new AppError(message, 422, true);
};

/**
 * 429 Too Many Requests - 请求过于频繁
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.tooManyRequests = (message = 'Too Many Requests') => {
  return new AppError(message, 429, true);
};

/**
 * 500 Internal Server Error - 服务器内部错误
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.internalServerError = (message = 'Internal Server Error') => {
  return new AppError(message, 500, false);
};

/**
 * 503 Service Unavailable - 服务不可用
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.serviceUnavailable = (message = 'Service Unavailable') => {
  return new AppError(message, 503, true);
};

/**
 * 数据库错误 - 用于处理MongoDB或其他数据库错误
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.databaseError = (message = 'Database Error') => {
  return new AppError(message, 500, false);
};

/**
 * 认证错误 - JWT或其他认证相关错误
 * @param {string} message - 错误消息
 * @returns {AppError}
 */
AppError.authenticationError = (message = 'Authentication Failed') => {
  return new AppError(message, 401, true);
};

/**
 * 创建验证错误，支持传入字段验证结果
 * @param {string|Array} errors - 错误消息或验证错误数组
 * @returns {AppError}
 */
AppError.fromValidationErrors = (errors) => {
  let message = 'Validation Error';
  
  if (Array.isArray(errors)) {
    // 如果是express-validator的结果
    if (errors.length > 0 && errors[0].msg) {
      message = errors.map(err => `${err.param}: ${err.msg}`).join(', ');
    } else {
      message = errors.join(', ');
    }
  } else if (typeof errors === 'string') {
    message = errors;
  }
  
  return new AppError(message, 422, true);
};

/**
 * 创建字段重复错误
 * @param {string} field - 字段名称
 * @param {string} value - 字段值
 * @returns {AppError}
 */
AppError.fieldDuplicate = (field, value) => {
  const message = `${field} "${value}" already exists`;
  return new AppError(message, 409, true);
};

/**
 * 创建字段不存在错误
 * @param {string} field - 字段名称
 * @returns {AppError}
 */
AppError.fieldMissing = (field) => {
  const message = `${field} is required`;
  return new AppError(message, 400, true);
};

/**
 * 创建字段格式无效错误
 * @param {string} field - 字段名称
 * @param {string} expectedFormat - 期望的格式
 * @returns {AppError}
 */
AppError.fieldInvalid = (field, expectedFormat = '') => {
  const message = expectedFormat 
    ? `${field} must be ${expectedFormat}`
    : `${field} is invalid`;
  return new AppError(message, 400, true);
};

/**
 * 创建资源不存在错误
 * @param {string} resource - 资源类型
 * @param {string|number} id - 资源ID
 * @returns {AppError}
 */
AppError.resourceNotFound = (resource, id) => {
  const message = `${resource} with id "${id}" not found`;
  return new AppError(message, 404, true);
};

/**
 * 创建权限不足错误
 * @param {string} action - 操作描述
 * @returns {AppError}
 */
AppError.insufficientPermission = (action = 'access this resource') => {
  const message = `You do not have permission to ${action}`;
  return new AppError(message, 403, true);
};

/**
 * 创建令牌无效错误
 * @param {string} reason - 原因（过期、格式错误等）
 * @returns {AppError}
 */
AppError.invalidToken = (reason = 'Invalid token') => {
  return new AppError(reason, 401, true);
};

/**
 * 创建令牌过期错误
 * @returns {AppError}
 */
AppError.tokenExpired = () => {
  return new AppError('Token has expired', 401, true);
};

/**
 * 创建操作失败错误
 * @param {string} operation - 操作描述
 * @param {string} reason - 失败原因
 * @returns {AppError}
 */
AppError.operationFailed = (operation, reason = '') => {
  const message = reason 
    ? `${operation} failed: ${reason}`
    : `${operation} failed`;
  return new AppError(message, 400, true);
};

module.exports = AppError;
