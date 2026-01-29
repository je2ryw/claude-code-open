const { body, validationResult } = require('express-validator');

/**
 * Todo更新验证规则
 * 允许部分字段更新，验证提供的字段格式
 * 可选字段：title, description, completed, priority, dueDate, tags, category
 */
const validateTodoUpdate = [
  // 验证title（可选，如果提供则验证）
  body('title')
    .if(body => body.title !== undefined && body.title !== null)
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),

  // 验证description（可选，如果提供则验证）
  body('description')
    .if(body => body.description !== undefined && body.description !== null)
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must not exceed 2000 characters'),

  // 验证completed（可选，如果提供则验证）
  body('completed')
    .if(body => body.completed !== undefined && body.completed !== null)
    .isBoolean()
    .withMessage('Completed must be a boolean value'),

  // 验证priority（可选，如果提供则验证）
  body('priority')
    .if(body => body.priority !== undefined && body.priority !== null)
    .isIn(['low', 'medium', 'high'])
    .withMessage('Priority must be one of: low, medium, high'),

  // 验证dueDate（可选，如果提供则验证）
  body('dueDate')
    .if(body => body.dueDate !== undefined && body.dueDate !== null)
    .custom((value) => {
      if (typeof value !== 'string' && !(value instanceof Date)) {
        throw new Error('Due date must be a valid date string or Date object');
      }
      const date = typeof value === 'string' ? new Date(value) : value;
      if (isNaN(date.getTime())) {
        throw new Error('Due date must be a valid date');
      }
      return true;
    }),

  // 验证tags（可选，如果提供则验证）
  body('tags')
    .if(body => body.tags !== undefined && body.tags !== null)
    .custom((value) => {
      if (!Array.isArray(value)) {
        throw new Error('Tags must be an array');
      }
      if (value.length > 10) {
        throw new Error('Tags must not exceed 10 items');
      }
      // 验证每个tag是否为字符串且长度合法
      for (const tag of value) {
        if (typeof tag !== 'string') {
          throw new Error('Each tag must be a string');
        }
        if (tag.trim().length === 0) {
          throw new Error('Tags cannot be empty strings');
        }
        if (tag.length > 50) {
          throw new Error('Each tag must not exceed 50 characters');
        }
      }
      return true;
    }),

  // 验证category（可选，如果提供则验证）
  body('category')
    .if(body => body.category !== undefined && body.category !== null)
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be between 1 and 50 characters')
];

/**
 * Todo创建验证规则
 * 验证必填字段和格式
 */
const validateTodoCreate = [
  // 验证title（必填）
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),

  // 验证description（可选）
  body('description')
    .if(body => body.description !== undefined && body.description !== null)
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description must not exceed 2000 characters'),

  // 验证completed（可选，默认为false）
  body('completed')
    .if(body => body.completed !== undefined && body.completed !== null)
    .isBoolean()
    .withMessage('Completed must be a boolean value'),

  // 验证priority（可选，默认为medium）
  body('priority')
    .if(body => body.priority !== undefined && body.priority !== null)
    .isIn(['low', 'medium', 'high'])
    .withMessage('Priority must be one of: low, medium, high'),

  // 验证dueDate（可选）
  body('dueDate')
    .if(body => body.dueDate !== undefined && body.dueDate !== null)
    .custom((value) => {
      if (typeof value !== 'string' && !(value instanceof Date)) {
        throw new Error('Due date must be a valid date string or Date object');
      }
      const date = typeof value === 'string' ? new Date(value) : value;
      if (isNaN(date.getTime())) {
        throw new Error('Due date must be a valid date');
      }
      return true;
    }),

  // 验证tags（可选）
  body('tags')
    .if(body => body.tags !== undefined && body.tags !== null)
    .custom((value) => {
      if (!Array.isArray(value)) {
        throw new Error('Tags must be an array');
      }
      if (value.length > 10) {
        throw new Error('Tags must not exceed 10 items');
      }
      // 验证每个tag是否为字符串且长度合法
      for (const tag of value) {
        if (typeof tag !== 'string') {
          throw new Error('Each tag must be a string');
        }
        if (tag.trim().length === 0) {
          throw new Error('Tags cannot be empty strings');
        }
        if (tag.length > 50) {
          throw new Error('Each tag must not exceed 50 characters');
        }
      }
      return true;
    }),

  // 验证category（可选）
  body('category')
    .if(body => body.category !== undefined && body.category !== null)
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category must be between 1 and 50 characters')
];

module.exports = {
  validateTodoUpdate,
  validateTodoCreate
};
