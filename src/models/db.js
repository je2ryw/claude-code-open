const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * 数据库连接配置
 */
const dbConfig = {
  maxPoolSize: 10,
  minPoolSize: 5,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  w: 'majority',
};

/**
 * 连接重试配置
 */
const retryConfig = {
  maxRetries: 5,
  retryDelay: 5000, // 5秒
  baseDelay: 5000,
};

let connectionAttempts = 0;

/**
 * 连接到MongoDB数据库
 * @returns {Promise<void>}
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/oneapi';

    console.log('[DB] Connecting to MongoDB:', mongoUri.replace(/([^:]*):([^@]*)@/, '$1:****@'));

    await mongoose.connect(mongoUri, {
      ...dbConfig,
    });

    // 重置连接计数器
    connectionAttempts = 0;

    console.log('[DB] ✓ MongoDB connected successfully');
    logger.info('Database connection established');

    // 监听连接事件
    setupConnectionListeners();

  } catch (error) {
    connectionAttempts++;
    console.error('[DB] ✗ MongoDB connection failed:', error.message);
    logger.error('Database connection error:', error);

    // 重连逻辑
    if (connectionAttempts < retryConfig.maxRetries) {
      const delay = retryConfig.baseDelay * connectionAttempts;
      console.log(`[DB] Retrying in ${delay / 1000}s... (Attempt ${connectionAttempts}/${retryConfig.maxRetries})`);
      
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          connectDB().then(resolve).catch(reject);
        }, delay);
      });
    } else {
      console.error('[DB] ✗ Failed to connect after', retryConfig.maxRetries, 'attempts');
      logger.error('Failed to connect to database after maximum retry attempts');
      process.exit(1);
    }
  }
};

/**
 * 设置MongoDB连接监听器
 */
const setupConnectionListeners = () => {
  const db = mongoose.connection;

  // 连接成功事件
  db.on('connected', () => {
    console.log('[DB] ✓ Mongoose connected to MongoDB');
    logger.info('Mongoose connected to MongoDB');
  });

  // 断开连接事件
  db.on('disconnected', () => {
    console.warn('[DB] ⚠ Mongoose disconnected from MongoDB');
    logger.warn('Mongoose disconnected from MongoDB');
  });

  // 重新连接事件
  db.on('reconnected', () => {
    console.log('[DB] ✓ Mongoose reconnected to MongoDB');
    logger.info('Mongoose reconnected to MongoDB');
    connectionAttempts = 0;
  });

  // 连接错误事件
  db.on('error', (error) => {
    console.error('[DB] ✗ Mongoose connection error:', error.message);
    logger.error('Mongoose connection error:', error);
  });

  // 服务器打开事件
  db.on('open', () => {
    console.log('[DB] ✓ MongoDB connection is open');
  });

  // 全连接事件
  db.on('fullsetup', () => {
    console.log('[DB] ✓ MongoDB replica set fully connected');
    logger.info('MongoDB replica set fully connected');
  });
};

/**
 * 断开数据库连接
 * @returns {Promise<void>}
 */
const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('[DB] ✓ MongoDB disconnected');
    logger.info('Database disconnected');
  } catch (error) {
    console.error('[DB] ✗ Error disconnecting from MongoDB:', error.message);
    logger.error('Error disconnecting from database:', error);
    throw error;
  }
};

/**
 * 获取连接状态
 * @returns {string} 连接状态
 */
const getConnectionStatus = () => {
  const states = [
    'disconnected',
    'connected',
    'connecting',
    'disconnecting',
    'authorized',
    'authenticating',
    'authenticated',
    'default',
  ];
  return states[mongoose.connection.readyState] || 'unknown';
};

/**
 * 获取连接信息
 * @returns {Object} 连接信息
 */
const getConnectionInfo = () => {
  const db = mongoose.connection;
  return {
    status: getConnectionStatus(),
    host: db.host,
    port: db.port,
    name: db.name,
    readyState: db.readyState,
    collections: Object.keys(db.collections).length,
  };
};

/**
 * 清除所有数据库数据（仅开发环境使用）
 * @returns {Promise<void>}
 */
const clearDatabase = async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('clearDatabase can only be used in development environment');
  }

  try {
    const db = mongoose.connection;
    const collections = Object.keys(db.collections);

    for (const collection of collections) {
      await db.collections[collection].deleteMany({});
    }

    console.log('[DB] ✓ Database cleared');
    logger.info('Database cleared');
  } catch (error) {
    console.error('[DB] ✗ Error clearing database:', error.message);
    logger.error('Error clearing database:', error);
    throw error;
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  getConnectionStatus,
  getConnectionInfo,
  clearDatabase,
};
