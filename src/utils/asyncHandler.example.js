/**
 * asyncHandler - 实际使用示例
 * 展示如何在Express应用中使用asyncHandler包装异步路由处理器
 */

// 导入asyncHandler
const asyncHandler = require('./asyncHandler');
// const express = require('express');
// const { validationResult } = require('express-validator');
// const router = express.Router();

/**
 * 示例1: 简单的GET请求 - 获取所有用户
 * 
 * 使用前（没有asyncHandler）:
 * router.get('/users', async (req, res, next) => {
 *   try {
 *     const users = await User.find();
 *     res.json(users);
 *   } catch (error) {
 *     next(error);
 *   }
 * });
 * 
 * 使用后（有asyncHandler）:
 */
// router.get('/users', asyncHandler(async (req, res) => {
//   const users = await User.find();
//   res.json(users);
// }));

/**
 * 示例2: GET请求 - 获取单个用户
 */
// router.get('/users/:id', asyncHandler(async (req, res) => {
//   const user = await User.findById(req.params.id);
//   
//   if (!user) {
//     return res.status(404).json({ error: 'User not found' });
//   }
//   
//   res.json(user);
// }));

/**
 * 示例3: POST请求 - 创建新用户
 */
// router.post('/users', 
//   validateUserRegistration,  // 验证中间件
//   asyncHandler(async (req, res) => {
//     // 验证
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }
//     
//     const { username, email, password } = req.body;
//     
//     // 检查用户是否已存在
//     const existingUser = await User.findOne({
//       $or: [{ email }, { username }]
//     });
//     
//     if (existingUser) {
//       return res.status(409).json({ 
//         error: 'User with this email or username already exists' 
//       });
//     }
//     
//     // 创建新用户
//     const user = new User({ username, email, password });
//     await user.save();
//     
//     res.status(201).json({
//       message: 'User created successfully',
//       user: {
//         id: user._id,
//         username: user.username,
//         email: user.email
//       }
//     });
//   })
// );

/**
 * 示例4: PUT请求 - 更新用户
 */
// router.put('/users/:id',
//   asyncHandler(async (req, res) => {
//     const user = await User.findByIdAndUpdate(
//       req.params.id,
//       req.body,
//       { new: true, runValidators: true }
//     );
//     
//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }
//     
//     res.json({
//       message: 'User updated successfully',
//       user
//     });
//   })
// );

/**
 * 示例5: DELETE请求 - 删除用户
 */
// router.delete('/users/:id',
//   asyncHandler(async (req, res) => {
//     const user = await User.findByIdAndDelete(req.params.id);
//     
//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }
//     
//     res.json({ 
//       message: 'User deleted successfully',
//       user
//     });
//   })
// );

/**
 * 示例6: 处理复杂的异步操作
 */
// router.post('/posts',
//   asyncHandler(async (req, res) => {
//     const { title, content, userId } = req.body;
//     
//     // 验证用户存在
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }
//     
//     // 创建文章
//     const post = new Post({ title, content, userId });
//     await post.save();
//     
//     // 更新用户的文章计数
//     user.postCount = (user.postCount || 0) + 1;
//     await user.save();
//     
//     res.status(201).json({
//       message: 'Post created successfully',
//       post
//     });
//   })
// );

/**
 * 示例7: 使用JWT认证的中间件
 */
// const authenticateToken = asyncHandler(async (req, res, next) => {
//   const token = req.header('Authorization')?.split(' ')[1];
//   
//   if (!token) {
//     return res.status(401).json({ 
//       error: 'Access token is required' 
//     });
//   }
//   
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = await User.findById(decoded.userId);
//     
//     if (!req.user) {
//       return res.status(401).json({ error: 'User not found' });
//     }
//     
//     next();
//   } catch (error) {
//     return res.status(403).json({ error: 'Invalid token' });
//   }
// });

/**
 * 示例8: 使用JWT认证的受保护路由
 */
// router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
//   res.json({
//     message: 'User profile retrieved successfully',
//     user: req.user
//   });
// }));

/**
 * 示例9: 登录路由 - 返回JWT令牌
 */
// router.post('/login',
//   validateUserLogin,
//   asyncHandler(async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }
//     
//     const { identifier, password } = req.body;
//     
//     // 根据邮箱或用户名查找用户
//     const user = await User.findOne({
//       $or: [{ email: identifier }, { username: identifier }]
//     });
//     
//     if (!user) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }
//     
//     // 验证密码
//     const isPasswordValid = await user.comparePassword(password);
//     if (!isPasswordValid) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }
//     
//     // 生成JWT令牌
//     const token = jwt.sign(
//       { userId: user._id },
//       process.env.JWT_SECRET,
//       { expiresIn: '24h' }
//     );
//     
//     res.json({
//       message: 'Login successful',
//       token,
//       user: {
//         id: user._id,
//         username: user.username,
//         email: user.email
//       }
//     });
//   })
// );

/**
 * 示例10: 全局错误处理中间件
 * （在所有路由之后添加）
 */
// app.use((error, req, res, next) => {
//   // 记录错误到控制台或日志文件
//   console.error('Error:', {
//     message: error.message,
//     stack: error.stack,
//     url: req.originalUrl,
//     method: req.method
//   });
//   
//   // 处理验证错误
//   if (error.name === 'ValidationError') {
//     return res.status(400).json({
//       error: 'Validation failed',
//       details: error.message
//     });
//   }
//   
//   // 处理MongoDB重复键错误
//   if (error.name === 'MongoError' && error.code === 11000) {
//     const field = Object.keys(error.keyValue)[0];
//     return res.status(409).json({
//       error: `Duplicate ${field}`,
//       field
//     });
//   }
//   
//   // 处理JWT错误
//   if (error.name === 'JsonWebTokenError') {
//     return res.status(403).json({
//       error: 'Invalid token'
//     });
//   }
//   
//   // 处理token过期
//   if (error.name === 'TokenExpiredError') {
//     return res.status(403).json({
//       error: 'Token expired'
//     });
//   }
//   
//   // 默认错误响应
//   const status = error.status || 500;
//   const message = error.message || 'Internal server error';
//   
//   res.status(status).json({
//     error: message,
//     ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
//   });
// });

/**
 * asyncHandler的工作原理：
 * 
 * 1. asyncHandler接收一个异步函数
 * 2. 返回一个标准的Express中间件函数
 * 3. 当中间件执行时，它会：
 *    - 调用异步函数，获得一个Promise
 *    - 使用Promise.resolve()包装结果
 *    - 使用.catch(next)捕获任何错误
 *    - 将错误传递给Express的错误处理中间件
 * 
 * 这样做的好处：
 * - 不需要在每个异步函数中手动添加try-catch
 * - 所有错误都被一致地处理
 * - 代码更简洁，更易于阅读
 * - 减少了由于忘记处理错误而导致的bug
 */

// 导出asyncHandler供其他模块使用
module.exports = asyncHandler;
