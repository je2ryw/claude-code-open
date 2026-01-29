/**
 * 验证错误处理中间件
 * 
 * handleValidationErrors - 检查express-validator的验证结果
 * 如果存在验证错误，则格式化错误信息并传递给错误处理中间件
 * 
 * 使用方法:
 * app.post('/route', validateUserRegistration, handleValidationErrors, controller);
 */

const { validationResult } = require('express-validator');
const AppError = require('../utils/errors');

/**
 * 验证错误处理中间件
 * 检查请求中的验证结果，如果有错误则格式化并抛出
 * 
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件函数
 * @throws {AppError} 当存在验证错误时抛出422 Unprocessable Entity错误
 */
const handleValidationErrors = (req, res, next) => {
  // 获取验证结果
  const errors = validationResult(req);
  
  // 如果没有验证错误，继续处理
  if (errors.isEmpty()) {
    return next();
  }
  
  // 格式化验证错误信息
  const formattedErrors = formatValidationErrors(errors.array());
  
  // 创建AppError并传递给错误处理中间件
  const error = AppError.fromValidationErrors(errors.array());
  
  // 将格式化后的错误信息附加到error对象上，便于错误处理中间件使用
  error.validationErrors = formattedErrors;
  
  // 传递给错误处理中间件
  next(error);
};

/**
 * 格式化验证错误信息
 * 将express-validator的错误数组转换为易读的格式
 * 
 * @param {Array} errors - express-validator的错误数组，每个元素包含 param、msg、value 等属性
 * @returns {Object} 格式化后的错误对象，key为字段名，value为错误消息数组
 * 
 * @example
 * // 输入: [
 * //   { param: 'email', msg: 'Invalid email' },
 * //   { param: 'password', msg: 'Password too short' }
 * // ]
 * // 输出: {
 * //   email: ['Invalid email'],
 * //   password: ['Password too short']
 * // }
 */
const formatValidationErrors = (errors) => {
  const formatted = {};
  
  errors.forEach(error => {
    const { param, msg } = error;
    
    // 如果该字段还没有错误数组，创建一个
    if (!formatted[param]) {
      formatted[param] = [];
    }
    
    // 将错误消息添加到该字段的错误数组中
    formatted[param].push(msg);
  });
  
  return formatted;
};

/**
 * 构建验证错误响应体
 * 用于在错误处理中间件中返回验证错误时使用
 * 
 * @param {AppError} error - AppError实例
 * @returns {Object} 验证错误响应对象
 * 
 * @example
 * // 返回:
 * // {
 * //   success: false,
 * //   statusCode: 422,
 * //   message: 'Validation Error',
 * //   errors: {
 * //     email: ['Invalid email'],
 * //     password: ['Password too short']
 * //   }
 * // }
 */
const buildValidationErrorResponse = (error) => {
  return {
    success: false,
    statusCode: error.statusCode || 422,
    message: error.message || 'Validation Error',
    errors: error.validationErrors || {}
  };
};

module.exports = {
  handleValidationErrors,
  formatValidationErrors,
  buildValidationErrorResponse
};
