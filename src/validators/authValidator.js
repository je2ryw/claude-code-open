const { body, validationResult } = require('express-validator');

/**
 * 用户注册验证规则
 * 验证username, email, password的格式和长度要求
 */
const validateUserRegistration = [
  // 验证username
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),

  // 验证email
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail()
    .toLowerCase(),

  // 验证password
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),

  // 验证密码确认（如果提供）
  body('confirmPassword')
    .if(body => body.confirmPassword !== undefined)
    .notEmpty()
    .withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

/**
 * 用户登录验证规则
 * 验证email/username和password
 */
const validateUserLogin = [
  // 验证email或username
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Email or username is required'),

  // 验证password
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

module.exports = {
  validateUserRegistration,
  validateUserLogin
};
