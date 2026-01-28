/**
 * 数据库连接模块使用示例
 * 这个文件展示了如何在实际应用中使用 db.js 模块
 */

const { 
  connectDB, 
  disconnectDB, 
  getConnectionStatus, 
  getConnectionInfo,
  clearDatabase 
} = require('../models/db');

/**
 * 示例 1: 基本连接和断开连接
 */
async function example1_basicConnection() {
  console.log('\n=== 示例 1: 基本连接和断开连接 ===');
  
  try {
    // 连接到数据库
    await connectDB();
    console.log('✓ 数据库连接成功');
    
    // 执行某些操作...
    console.log('执行业务操作...');
    
    // 断开连接
    await disconnectDB();
    console.log('✓ 数据库断开连接');
  } catch (error) {
    console.error('✗ 错误:', error.message);
  }
}

/**
 * 示例 2: 检查连接状态
 */
async function example2_checkConnectionStatus() {
  console.log('\n=== 示例 2: 检查连接状态 ===');
  
  try {
    await connectDB();
    
    const status = getConnectionStatus();
    console.log('当前连接状态:', status);
    
    // 根据状态进行不同的处理
    if (status === 'connected') {
      console.log('✓ 数据库已连接，可以执行操作');
    } else if (status === 'connecting') {
      console.log('⏳ 正在连接中...');
    } else {
      console.log('✗ 数据库未连接');
    }
    
    await disconnectDB();
  } catch (error) {
    console.error('✗ 错误:', error.message);
  }
}

/**
 * 示例 3: 获取详细的连接信息
 */
async function example3_getConnectionInfo() {
  console.log('\n=== 示例 3: 获取详细的连接信息 ===');
  
  try {
    await connectDB();
    
    const info = getConnectionInfo();
    console.log('连接信息:', {
      状态: info.status,
      主机: info.host,
      端口: info.port,
      数据库名: info.name,
      就绪状态: info.readyState,
      集合数量: info.collections,
    });
    
    await disconnectDB();
  } catch (error) {
    console.error('✗ 错误:', error.message);
  }
}

/**
 * 示例 4: 使用 Mongoose 进行数据库操作
 */
async function example4_mongooseOperations() {
  console.log('\n=== 示例 4: 使用 Mongoose 进行数据库操作 ===');
  
  try {
    const mongoose = require('mongoose');
    await connectDB();
    
    // 定义简单的 Schema
    const userSchema = new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, unique: true, required: true },
      createdAt: { type: Date, default: Date.now },
    });
    
    const User = mongoose.model('User', userSchema);
    
    // 创建用户
    const user = new User({
      name: 'John Doe',
      email: 'john@example.com',
    });
    
    await user.save();
    console.log('✓ 用户创建成功:', user._id);
    
    // 查询用户
    const foundUser = await User.findById(user._id);
    console.log('✓ 查询到用户:', foundUser.name);
    
    // 删除用户
    await User.deleteOne({ _id: user._id });
    console.log('✓ 用户删除成功');
    
    await disconnectDB();
  } catch (error) {
    console.error('✗ 错误:', error.message);
  }
}

/**
 * 示例 5: 错误处理和重连
 */
async function example5_errorHandlingAndRetry() {
  console.log('\n=== 示例 5: 错误处理和重连 ===');
  console.log('模块已内置自动重连逻辑');
  console.log('配置:');
  console.log('  - 最大重试次数: 5');
  console.log('  - 初始重试延迟: 5秒');
  console.log('  - 延迟递增: 每次加5秒');
  console.log('  - 超过最大重试次数后自动退出进程');
  
  try {
    // connectDB 会自动处理连接失败和重连
    await connectDB();
    console.log('✓ 连接成功，自动重连逻辑已启用');
    await disconnectDB();
  } catch (error) {
    console.error('✗ 连接失败:', error.message);
  }
}

/**
 * 示例 6: 清空数据库（仅开发环境）
 */
async function example6_clearDatabase() {
  console.log('\n=== 示例 6: 清空数据库（仅开发环境）===');
  
  try {
    // 设置开发环境变量
    process.env.NODE_ENV = 'development';
    
    await connectDB();
    
    console.log('⚠️  即将清空所有数据库数据...');
    console.log('清空数据库...');
    await clearDatabase();
    console.log('✓ 数据库清空成功');
    
    await disconnectDB();
  } catch (error) {
    if (error.message.includes('development')) {
      console.warn('⚠️  只能在开发环境中清空数据库');
    } else {
      console.error('✗ 错误:', error.message);
    }
  }
}

/**
 * 示例 7: 监听连接事件
 */
async function example7_connectionEvents() {
  console.log('\n=== 示例 7: 监听连接事件 ===');
  console.log('事件已在 db.js 中配置并自动监听');
  console.log('监听的事件:');
  console.log('  - connected: 成功连接');
  console.log('  - disconnected: 连接断开');
  console.log('  - reconnected: 重新连接成功');
  console.log('  - error: 连接错误');
  console.log('  - open: 连接打开');
  console.log('  - fullsetup: 副本集完全连接');
  
  try {
    await connectDB();
    console.log('✓ 连接成功，事件监听已启用');
    
    // 模拟等待一段时间以观察事件
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await disconnectDB();
  } catch (error) {
    console.error('✗ 错误:', error.message);
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('########################################');
  console.log('  数据库连接模块使用示例');
  console.log('########################################');
  
  // 注意：这里仅演示代码结构，实际运行时可能需要调整
  
  // 取消注释要运行的示例
  // await example1_basicConnection();
  // await example2_checkConnectionStatus();
  // await example3_getConnectionInfo();
  // await example4_mongooseOperations();
  // await example5_errorHandlingAndRetry();
  // await example6_clearDatabase();
  // await example7_connectionEvents();
  
  console.log('\n请根据需要取消注释相应的示例进行运行');
}

/**
 * 在 Express 应用中使用的完整示例
 */
async function expressApplicationExample() {
  console.log('\n=== Express 应用中的使用示例 ===');
  
  const express = require('express');
  const app = express();
  
  // 中间件：检查数据库连接状态
  app.use((req, res, next) => {
    const status = getConnectionStatus();
    
    if (status !== 'connected') {
      return res.status(503).json({
        error: '数据库连接不可用',
        status: status,
      });
    }
    
    next();
  });
  
  // 路由：获取连接信息
  app.get('/api/db/status', (req, res) => {
    res.json(getConnectionInfo());
  });
  
  console.log('✓ Express 应用示例已配置');
  console.log('  - 中间件: 检查数据库连接状态');
  console.log('  - 路由: GET /api/db/status');
}

// 导出示例函数
module.exports = {
  example1_basicConnection,
  example2_checkConnectionStatus,
  example3_getConnectionInfo,
  example4_mongooseOperations,
  example5_errorHandlingAndRetry,
  example6_clearDatabase,
  example7_connectionEvents,
  runAllExamples,
  expressApplicationExample,
};

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}
