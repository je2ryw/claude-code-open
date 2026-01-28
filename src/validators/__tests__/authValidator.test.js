const { body, validationResult } = require('express-validator');
const { validateUserRegistration, validateUserLogin } = require('../authValidator');

/**
 * 模拟请求对象的助手函数
 */
const createMockRequest = (bodyData) => ({
  body: bodyData
});

/**
 * 运行验证规则并返回错误
 */
const runValidation = async (req, rules) => {
  // 运行所有验证规则
  await Promise.all(rules.map(rule => rule.run(req)));
  
  // 获取验证结果
  const errors = validationResult(req);
  return errors;
};

describe('authValidator - validateUserRegistration', () => {
  describe('Username validation', () => {
    test('should pass with valid username', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when username is empty', async () => {
      const req = createMockRequest({
        username: '',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()[0].param).toBe('username');
      expect(errors.array()[0].msg).toBe('Username is required');
    });

    test('should fail when username is not provided', async () => {
      const req = createMockRequest({
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array()[0].param).toBe('username');
    });

    test('should fail when username is less than 3 characters', async () => {
      const req = createMockRequest({
        username: 'ab',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const usernameErrors = errors.array().filter(e => e.param === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
      expect(usernameErrors[0].msg).toContain('between 3 and 30');
    });

    test('should fail when username exceeds 30 characters', async () => {
      const req = createMockRequest({
        username: 'a'.repeat(31),
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const usernameErrors = errors.array().filter(e => e.param === 'username');
      expect(usernameErrors.length).toBeGreaterThan(0);
      expect(usernameErrors[0].msg).toContain('between 3 and 30');
    });

    test('should fail when username contains invalid characters (@)', async () => {
      const req = createMockRequest({
        username: 'john@doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const usernameErrors = errors.array().filter(e => e.param === 'username');
      expect(usernameErrors[0].msg).toContain('letters, numbers, underscores, and hyphens');
    });

    test('should fail when username contains invalid characters (space)', async () => {
      const req = createMockRequest({
        username: 'john doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should fail when username contains invalid characters (special chars)', async () => {
      const req = createMockRequest({
        username: 'john!@#$',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should pass with username containing hyphens', async () => {
      const req = createMockRequest({
        username: 'john-doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with username containing underscores', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with username containing numbers', async () => {
      const req = createMockRequest({
        username: 'john123',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with username containing mixed case', async () => {
      const req = createMockRequest({
        username: 'JohnDoe123',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with minimum valid username length (3 chars)', async () => {
      const req = createMockRequest({
        username: 'abc',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with maximum valid username length (30 chars)', async () => {
      const req = createMockRequest({
        username: 'a'.repeat(30),
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should trim whitespace from username', async () => {
      const req = createMockRequest({
        username: '  john_doe  ',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      // After trim, it should be valid
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Email validation', () => {
    test('should pass with valid email', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when email is empty', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: '',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const emailErrors = errors.array().filter(e => e.param === 'email');
      expect(emailErrors[0].msg).toBe('Email is required');
    });

    test('should fail when email is not provided', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const emailErrors = errors.array().filter(e => e.param === 'email');
      expect(emailErrors.length).toBeGreaterThan(0);
    });

    test('should fail with invalid email format (missing @)', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john.example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const emailErrors = errors.array().filter(e => e.param === 'email');
      expect(emailErrors[0].msg).toContain('valid email');
    });

    test('should fail with invalid email format (missing domain)', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should fail with invalid email format (missing local part)', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: '@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should pass with email containing dot in local part', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john.doe@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with email containing subdomain', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@mail.example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with email containing plus sign', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john+tag@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with uppercase email (converted to lowercase)', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'John@Example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should trim whitespace from email', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: '  john@example.com  ',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Password validation', () => {
    test('should pass with valid password', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when password is empty', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: ''
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors[0].msg).toBe('Password is required');
    });

    test('should fail when password is not provided', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors.length).toBeGreaterThan(0);
    });

    test('should fail when password is less than 6 characters', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass1'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors[0].msg).toContain('at least 6 characters');
    });

    test('should fail when password contains only letters', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Password'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors[0].msg).toContain('at least one letter and one number');
    });

    test('should fail when password contains only numbers', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: '123456'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors[0].msg).toContain('at least one letter and one number');
    });

    test('should pass with password containing letters and numbers', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with minimum valid password length (6 chars with letter and number)', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass1'
      });
      const errors = await runValidation(req, validateUserRegistration);
      // This should fail due to length requirement
      expect(errors.isEmpty()).toBe(false);
    });

    test('should pass with minimum valid password length (6 chars: a + 5 digits)', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'a12345'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with password containing special characters', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass@123!#$'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with long password', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'VerySecurePassword123WithManyCharacters'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with password containing uppercase and lowercase', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'MyPassword123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with password containing only one lowercase letter and numbers', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'p123456'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('ConfirmPassword validation', () => {
    test('should pass when confirmPassword matches password', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123',
        confirmPassword: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass when confirmPassword is not provided', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when confirmPassword does not match password', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123',
        confirmPassword: 'Pass456'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      const confirmPasswordErrors = errors.array().filter(e => e.param === 'confirmPassword');
      expect(confirmPasswordErrors[0].msg).toContain('do not match');
    });

    test('should fail when confirmPassword is empty but provided', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123',
        confirmPassword: ''
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should fail when confirmPassword differs only in case', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123',
        confirmPassword: 'pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Combined field validation', () => {
    test('should fail when multiple fields are invalid', async () => {
      const req = createMockRequest({
        username: 'ab',
        email: 'invalid-email',
        password: '123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array().length).toBeGreaterThan(1);
    });

    test('should pass when all fields are valid', async () => {
      const req = createMockRequest({
        username: 'valid_user_123',
        email: 'valid@example.com',
        password: 'SecurePass456',
        confirmPassword: 'SecurePass456'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with all optional fields', async () => {
      const req = createMockRequest({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'Pass123',
        confirmPassword: 'Pass123'
      });
      const errors = await runValidation(req, validateUserRegistration);
      expect(errors.isEmpty()).toBe(true);
    });
  });
});

describe('authValidator - validateUserLogin', () => {
  describe('Identifier validation', () => {
    test('should pass with valid email identifier', async () => {
      const req = createMockRequest({
        identifier: 'john@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with valid username identifier', async () => {
      const req = createMockRequest({
        identifier: 'john_doe',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when identifier is empty', async () => {
      const req = createMockRequest({
        identifier: '',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(false);
      const identifierErrors = errors.array().filter(e => e.param === 'identifier');
      expect(identifierErrors[0].msg).toContain('Email or username is required');
    });

    test('should fail when identifier is not provided', async () => {
      const req = createMockRequest({
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(false);
      const identifierErrors = errors.array().filter(e => e.param === 'identifier');
      expect(identifierErrors.length).toBeGreaterThan(0);
    });

    test('should trim whitespace from identifier', async () => {
      const req = createMockRequest({
        identifier: '  john_doe  ',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with identifier containing special email characters', async () => {
      const req = createMockRequest({
        identifier: 'john+tag@example.com',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Password validation', () => {
    test('should pass with valid password', async () => {
      const req = createMockRequest({
        identifier: 'john_doe',
        password: 'Pass123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when password is empty', async () => {
      const req = createMockRequest({
        identifier: 'john_doe',
        password: ''
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors[0].msg).toBe('Password is required');
    });

    test('should fail when password is not provided', async () => {
      const req = createMockRequest({
        identifier: 'john_doe'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(false);
      const passwordErrors = errors.array().filter(e => e.param === 'password');
      expect(passwordErrors.length).toBeGreaterThan(0);
    });

    test('should pass with password containing any characters', async () => {
      const req = createMockRequest({
        identifier: 'john_doe',
        password: '123456'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with long password', async () => {
      const req = createMockRequest({
        identifier: 'john_doe',
        password: 'VeryLongPasswordWithManyCharacters@#$%^&*()'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Combined field validation', () => {
    test('should fail when both fields are empty', async () => {
      const req = createMockRequest({
        identifier: '',
        password: ''
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array().length).toBeGreaterThan(0);
    });

    test('should fail when both fields are not provided', async () => {
      const req = createMockRequest({});
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array().length).toBeGreaterThan(0);
    });

    test('should pass when all fields are valid with email', async () => {
      const req = createMockRequest({
        identifier: 'user@example.com',
        password: 'MyPassword123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass when all fields are valid with username', async () => {
      const req = createMockRequest({
        identifier: 'john_doe-123',
        password: 'MyPassword123'
      });
      const errors = await runValidation(req, validateUserLogin);
      expect(errors.isEmpty()).toBe(true);
    });
  });
});
