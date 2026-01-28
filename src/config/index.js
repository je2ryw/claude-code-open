/**
 * 应用配置管理
 * 支持开发、测试、生产环境
 */

const path = require('path');

// 加载环境变量
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

const env = process.env.NODE_ENV || 'development';

/**
 * 通用配置
 */
const commonConfig = {
  env,
  isDev: env === 'development',
  isTest: env === 'test',
  isProd: env === 'production',
};

/**
 * 数据库配置
 */
const databaseConfig = {
  development: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/oneapi',
    options: {
      maxPoolSize: 10,
      minPoolSize: 5,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    },
  },
  test: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/oneapi-test',
    options: {
      maxPoolSize: 5,
      minPoolSize: 1,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    },
  },
  production: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 20,
      minPoolSize: 10,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      w: 'majority',
    },
  },
};

/**
 * 服务器配置
 */
const serverConfig = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
};

/**
 * JWT 配置
 */
const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  algorithm: 'HS256',
};

/**
 * 日志配置
 */
const logConfig = {
  level: process.env.LOG_LEVEL || 'info',
  dir: path.resolve(__dirname, '../../logs'),
  maxFiles: 14, // 保留 14 天的日志
  maxSize: '100m',
};

/**
 * 应用配置
 */
const appConfig = {
  name: 'OneAPI',
  version: '1.0.0',
  description: 'MongoDB Express REST API',
};

/**
 * 安全配置
 */
const securityConfig = {
  corsOrigin: process.env.CORS_ORIGIN || '*',
  rateLimitWindowMs: 15 * 60 * 1000, // 15 分钟
  rateLimitMaxRequests: 100, // 每个窗口最多 100 个请求
};

/**
 * 重连配置
 */
const retryConfig = {
  maxRetries: env === 'production' ? 10 : 5,
  retryDelay: 5000,
  baseDelay: 5000,
};

/**
 * 获取当前环境的配置
 */
const getConfig = () => ({
  ...commonConfig,
  db: databaseConfig[env],
  server: serverConfig,
  jwt: jwtConfig,
  log: logConfig,
  app: appConfig,
  security: securityConfig,
  retry: retryConfig,
});

/**
 * 验证必需的环境变量
 */
const validateConfig = () => {
  if (env === 'production') {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required in production');
    }
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required in production');
    }
  }
};

// 验证配置
try {
  validateConfig();
} catch (error) {
  console.error('配置验证失败:', error.message);
  process.exit(1);
}

const config = getConfig();

// 冻结配置对象，防止修改
Object.freeze(config);

module.exports = config;
