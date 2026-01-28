/**
 * app.integration.example.js
 * 
 * 这是一个完整的Express应用示例，展示如何集成asyncHandler和其他组件
 * 这只是示例代码，不应直接在生产环境中使用
 */

// ==================== 导入依赖 ====================
const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const asyncHandler = require('./asyncHandler');

// ==================== 配置 ====================
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ==================== 中间件 ====================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== 验证规则 ====================
const validateUserRegistration = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
];

const validateUserLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// ==================== 身份验证中间件 ====================
/**
 * JWT认证中间件
 * 验证请求头中的JWT令牌
 */
const authenticateToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Access token is required' 
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ 
      error: 'Invalid or expired token' 
    });
  }
});

// ==================== 路由 ====================

/**
 * 健康检查端点
 */
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

/**
 * 用户注册端点
 * 
 * Request:
 * {
 *   "username": "john_doe",
 *   "email": "john@example.com",
 *   "password": "password123"
 * }
 * 
 * Response (201):
 * {
 *   "message": "User registered successfully",
 *   "user": {
 *     "id": "user_id",
 *     "username": "john_doe",
 *     "email": "john@example.com"
 *   },
 *   "token": "jwt_token"
 * }
 */
app.post('/api/auth/register',
  validateUserRegistration,
  asyncHandler(async (req, res) => {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }
    
    const { username, email, password } = req.body;
    
    // 模拟数据库查询 - 检查用户是否已存在
    // const existingUser = await User.findOne({ 
    //   $or: [{ email }, { username }] 
    // });
    // if (existingUser) {
    //   return res.status(409).json({ 
    //     error: 'User already exists' 
    //   });
    // }
    
    // 模拟创建用户
    // const user = new User({ username, email, password });
    // await user.save();
    const userId = `user_${Date.now()}`;
    
    // 生成JWT令牌
    const token = jwt.sign(
      { userId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        username,
        email
      },
      token
    });
  })
);

/**
 * 用户登录端点
 * 
 * Request:
 * {
 *   "email": "john@example.com",
 *   "password": "password123"
 * }
 * 
 * Response (200):
 * {
 *   "message": "Login successful",
 *   "token": "jwt_token",
 *   "user": {
 *     "id": "user_id",
 *     "username": "john_doe",
 *     "email": "john@example.com"
 *   }
 * }
 */
app.post('/api/auth/login',
  validateUserLogin,
  asyncHandler(async (req, res) => {
    // 验证输入
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }
    
    const { email, password } = req.body;
    
    // 模拟数据库查询
    // const user = await User.findOne({ email });
    // if (!user || !await user.comparePassword(password)) {
    //   return res.status(401).json({ error: 'Invalid credentials' });
    // }
    
    // 模拟成功登录
    const userId = `user_${email.split('@')[0]}`;
    
    // 生成JWT令牌
    const token = jwt.sign(
      { userId },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: userId,
        email
      }
    });
  })
);

/**
 * 获取当前用户信息（受保护的路由）
 * 
 * Headers:
 * Authorization: Bearer <jwt_token>
 * 
 * Response (200):
 * {
 *   "message": "User profile retrieved successfully",
 *   "user": {
 *     "id": "user_id",
 *     "email": "john@example.com"
 *   }
 * }
 */
app.get('/api/auth/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 模拟从数据库获取用户
    // const user = await User.findById(req.userId);
    // if (!user) {
    //   return res.status(404).json({ error: 'User not found' });
    // }
    
    res.json({
      message: 'User profile retrieved successfully',
      user: {
        id: req.userId,
        email: 'user@example.com'
      }
    });
  })
);

/**
 * 获取所有用户（受保护的路由）
 * 
 * Headers:
 * Authorization: Bearer <jwt_token>
 * 
 * Response (200):
 * {
 *   "message": "Users retrieved successfully",
 *   "count": 2,
 *   "users": [...]
 * }
 */
app.get('/api/users',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 模拟从数据库获取用户列表
    // const users = await User.find();
    
    const users = [
      { id: 'user_1', email: 'user1@example.com' },
      { id: 'user_2', email: 'user2@example.com' }
    ];
    
    res.json({
      message: 'Users retrieved successfully',
      count: users.length,
      users
    });
  })
);

/**
 * 获取单个用户（受保护的路由）
 * 
 * Headers:
 * Authorization: Bearer <jwt_token>
 * 
 * Response (200):
 * {
 *   "message": "User retrieved successfully",
 *   "user": { ... }
 * }
 */
app.get('/api/users/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // 模拟从数据库获取用户
    // const user = await User.findById(id);
    // if (!user) {
    //   return res.status(404).json({ error: 'User not found' });
    // }
    
    res.json({
      message: 'User retrieved successfully',
      user: {
        id,
        email: `user_${id}@example.com`
      }
    });
  })
);

/**
 * 更新用户（受保护的路由）
 * 
 * Headers:
 * Authorization: Bearer <jwt_token>
 * 
 * Request:
 * {
 *   "email": "newemail@example.com"
 * }
 * 
 * Response (200):
 * {
 *   "message": "User updated successfully",
 *   "user": { ... }
 * }
 */
app.put('/api/users/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;
    
    // 验证是否是自己的用户信息
    if (req.userId !== id) {
      return res.status(403).json({ 
        error: 'You can only update your own profile' 
      });
    }
    
    // 模拟更新数据库
    // const user = await User.findByIdAndUpdate(id, { email }, { new: true });
    // if (!user) {
    //   return res.status(404).json({ error: 'User not found' });
    // }
    
    res.json({
      message: 'User updated successfully',
      user: {
        id,
        email
      }
    });
  })
);

/**
 * 删除用户（受保护的路由）
 * 
 * Headers:
 * Authorization: Bearer <jwt_token>
 * 
 * Response (200):
 * {
 *   "message": "User deleted successfully"
 * }
 */
app.delete('/api/users/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // 验证是否是自己的用户信息
    if (req.userId !== id) {
      return res.status(403).json({ 
        error: 'You can only delete your own profile' 
      });
    }
    
    // 模拟删除数据库记录
    // const user = await User.findByIdAndDelete(id);
    // if (!user) {
    //   return res.status(404).json({ error: 'User not found' });
    // }
    
    res.json({
      message: 'User deleted successfully'
    });
  })
);

// ==================== 404处理 ====================
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// ==================== 错误处理中间件 ====================
/**
 * 全局错误处理中间件
 * 注意：必须放在所有路由之后
 * 必须有4个参数(err, req, res, next)
 */
app.use((error, req, res, next) => {
  // 记录错误信息
  console.error('=== ERROR ===');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Message:', error.message);
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack:', error.stack);
  }
  console.error('=============');
  
  // 获取状态码
  const status = error.status || error.statusCode || 500;
  
  // 返回错误响应
  res.status(status).json({
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { 
      stack: error.stack,
      details: error
    })
  });
});

// ==================== 启动服务器 ====================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('API Endpoints:');
    console.log('  POST   /api/auth/register - Register new user');
    console.log('  POST   /api/auth/login    - Login user');
    console.log('  GET    /api/auth/me       - Get current user (protected)');
    console.log('  GET    /api/users         - List all users (protected)');
    console.log('  GET    /api/users/:id     - Get user by ID (protected)');
    console.log('  PUT    /api/users/:id     - Update user (protected)');
    console.log('  DELETE /api/users/:id     - Delete user (protected)');
  });
}

module.exports = app;
