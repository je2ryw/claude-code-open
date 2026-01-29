const { body, validationResult } = require('express-validator');
const { validateTodoUpdate, validateTodoCreate } = require('../todoValidator');

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

describe('todoValidator - validateTodoUpdate', () => {
  describe('Title validation', () => {
    test('should pass when title is not provided', async () => {
      const req = createMockRequest({});
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with valid title', async () => {
      const req = createMockRequest({
        title: 'Buy groceries'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when title is empty string', async () => {
      const req = createMockRequest({
        title: ''
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const titleErrors = errors.array().filter(e => e.param === 'title');
      expect(titleErrors[0].msg).toBe('Title cannot be empty');
    });

    test('should pass with title of 1 character', async () => {
      const req = createMockRequest({
        title: 'A'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with title of 200 characters', async () => {
      const req = createMockRequest({
        title: 'a'.repeat(200)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when title exceeds 200 characters', async () => {
      const req = createMockRequest({
        title: 'a'.repeat(201)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const titleErrors = errors.array().filter(e => e.param === 'title');
      expect(titleErrors[0].msg).toContain('between 1 and 200');
    });

    test('should trim whitespace from title', async () => {
      const req = createMockRequest({
        title: '  Buy groceries  '
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass when title is null', async () => {
      const req = createMockRequest({
        title: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Description validation', () => {
    test('should pass when description is not provided', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with valid description', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: 'This is a task description'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with empty description string', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: ''
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with description of max length (2000)', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: 'a'.repeat(2000)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when description exceeds 2000 characters', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: 'a'.repeat(2001)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const descErrors = errors.array().filter(e => e.param === 'description');
      expect(descErrors[0].msg).toContain('must not exceed 2000');
    });

    test('should trim whitespace from description', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: '  Description text  '
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass when description is null', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Completed validation', () => {
    test('should pass when completed is not provided', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with completed true', async () => {
      const req = createMockRequest({
        title: 'Task',
        completed: true
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with completed false', async () => {
      const req = createMockRequest({
        title: 'Task',
        completed: false
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when completed is not a boolean', async () => {
      const req = createMockRequest({
        title: 'Task',
        completed: 'true'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const completedErrors = errors.array().filter(e => e.param === 'completed');
      expect(completedErrors[0].msg).toContain('must be a boolean');
    });

    test('should fail when completed is a number', async () => {
      const req = createMockRequest({
        title: 'Task',
        completed: 1
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should pass when completed is null', async () => {
      const req = createMockRequest({
        title: 'Task',
        completed: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Priority validation', () => {
    test('should pass when priority is not provided', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with priority low', async () => {
      const req = createMockRequest({
        title: 'Task',
        priority: 'low'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with priority medium', async () => {
      const req = createMockRequest({
        title: 'Task',
        priority: 'medium'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with priority high', async () => {
      const req = createMockRequest({
        title: 'Task',
        priority: 'high'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail with invalid priority', async () => {
      const req = createMockRequest({
        title: 'Task',
        priority: 'urgent'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const priorityErrors = errors.array().filter(e => e.param === 'priority');
      expect(priorityErrors[0].msg).toContain('one of: low, medium, high');
    });

    test('should pass when priority is null', async () => {
      const req = createMockRequest({
        title: 'Task',
        priority: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('DueDate validation', () => {
    test('should pass when dueDate is not provided', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with valid ISO date string', async () => {
      const req = createMockRequest({
        title: 'Task',
        dueDate: '2024-12-31T23:59:59Z'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with Date object', async () => {
      const req = createMockRequest({
        title: 'Task',
        dueDate: new Date('2024-12-31')
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail with invalid date string', async () => {
      const req = createMockRequest({
        title: 'Task',
        dueDate: 'invalid-date'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const dueDateErrors = errors.array().filter(e => e.param === 'dueDate');
      expect(dueDateErrors[0].msg).toContain('valid date');
    });

    test('should fail when dueDate is a number', async () => {
      const req = createMockRequest({
        title: 'Task',
        dueDate: 123456
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
    });

    test('should pass when dueDate is null', async () => {
      const req = createMockRequest({
        title: 'Task',
        dueDate: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Tags validation', () => {
    test('should pass when tags is not provided', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with empty tags array', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: []
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with single tag', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: ['work']
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with multiple tags', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: ['work', 'urgent', 'project-a']
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with 10 tags', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: Array.from({ length: 10 }, (_, i) => `tag${i}`)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when tags exceed 10 items', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const tagsErrors = errors.array().filter(e => e.param === 'tags');
      expect(tagsErrors[0].msg).toContain('must not exceed 10');
    });

    test('should fail when tags is not an array', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: 'work'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const tagsErrors = errors.array().filter(e => e.param === 'tags');
      expect(tagsErrors[0].msg).toContain('must be an array');
    });

    test('should fail when tag is not a string', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: ['work', 123]
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const tagsErrors = errors.array().filter(e => e.param === 'tags');
      expect(tagsErrors[0].msg).toContain('Each tag must be a string');
    });

    test('should fail when tag is empty string', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: ['work', '']
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const tagsErrors = errors.array().filter(e => e.param === 'tags');
      expect(tagsErrors[0].msg).toContain('cannot be empty');
    });

    test('should fail when tag exceeds 50 characters', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: ['a'.repeat(51)]
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const tagsErrors = errors.array().filter(e => e.param === 'tags');
      expect(tagsErrors[0].msg).toContain('must not exceed 50');
    });

    test('should pass with tag of 50 characters', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: ['a'.repeat(50)]
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass when tags is null', async () => {
      const req = createMockRequest({
        title: 'Task',
        tags: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Category validation', () => {
    test('should pass when category is not provided', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with valid category', async () => {
      const req = createMockRequest({
        title: 'Task',
        category: 'Work'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with category of 50 characters', async () => {
      const req = createMockRequest({
        title: 'Task',
        category: 'a'.repeat(50)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when category exceeds 50 characters', async () => {
      const req = createMockRequest({
        title: 'Task',
        category: 'a'.repeat(51)
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const categoryErrors = errors.array().filter(e => e.param === 'category');
      expect(categoryErrors[0].msg).toContain('between 1 and 50');
    });

    test('should fail when category is empty string', async () => {
      const req = createMockRequest({
        title: 'Task',
        category: ''
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      const categoryErrors = errors.array().filter(e => e.param === 'category');
      expect(categoryErrors[0].msg).toContain('between 1 and 50');
    });

    test('should trim whitespace from category', async () => {
      const req = createMockRequest({
        title: 'Task',
        category: '  Work  '
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass when category is null', async () => {
      const req = createMockRequest({
        title: 'Task',
        category: null
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });
  });

  describe('Combined field validation for update', () => {
    test('should pass with multiple valid fields', async () => {
      const req = createMockRequest({
        title: 'Updated Task',
        description: 'Updated description',
        completed: true,
        priority: 'high'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with all fields provided', async () => {
      const req = createMockRequest({
        title: 'Complete Task',
        description: 'Full update',
        completed: true,
        priority: 'high',
        dueDate: '2024-12-31',
        tags: ['work', 'urgent'],
        category: 'Personal'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with only one field', async () => {
      const req = createMockRequest({
        completed: true
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with empty update (no fields)', async () => {
      const req = createMockRequest({});
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when multiple fields are invalid', async () => {
      const req = createMockRequest({
        title: '',
        priority: 'invalid',
        tags: 'not-array'
      });
      const errors = await runValidation(req, validateTodoUpdate);
      expect(errors.isEmpty()).toBe(false);
      expect(errors.array().length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('todoValidator - validateTodoCreate', () => {
  describe('Title validation', () => {
    test('should pass with valid title', async () => {
      const req = createMockRequest({
        title: 'Buy groceries'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when title is not provided', async () => {
      const req = createMockRequest({});
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(false);
      const titleErrors = errors.array().filter(e => e.param === 'title');
      expect(titleErrors[0].msg).toBe('Title is required');
    });

    test('should fail when title is empty', async () => {
      const req = createMockRequest({
        title: ''
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(false);
      const titleErrors = errors.array().filter(e => e.param === 'title');
      expect(titleErrors.length).toBeGreaterThan(0);
    });

    test('should pass with title of 1 character', async () => {
      const req = createMockRequest({
        title: 'A'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with title of 200 characters', async () => {
      const req = createMockRequest({
        title: 'a'.repeat(200)
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when title exceeds 200 characters', async () => {
      const req = createMockRequest({
        title: 'a'.repeat(201)
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(false);
    });
  });

  describe('Optional fields in create', () => {
    test('should pass with only title (required)', async () => {
      const req = createMockRequest({
        title: 'Task'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with title and description', async () => {
      const req = createMockRequest({
        title: 'Task',
        description: 'Task description'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with title and priority', async () => {
      const req = createMockRequest({
        title: 'Task',
        priority: 'high'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should pass with all fields', async () => {
      const req = createMockRequest({
        title: 'New Task',
        description: 'A new task description',
        completed: false,
        priority: 'medium',
        dueDate: '2024-12-31',
        tags: ['work'],
        category: 'Personal'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(true);
    });

    test('should fail when title is missing but other fields present', async () => {
      const req = createMockRequest({
        description: 'Description without title',
        priority: 'high'
      });
      const errors = await runValidation(req, validateTodoCreate);
      expect(errors.isEmpty()).toBe(false);
      const titleErrors = errors.array().filter(e => e.param === 'title');
      expect(titleErrors[0].msg).toBe('Title is required');
    });
  });
});
