const fs = require('fs');
const path = require('path');

/**
 * 简单的日志工具
 */

// 创建日志目录
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 日志级别
const levels = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

/**
 * 获取日志前缀
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

/**
 * 格式化日志消息
 */
const formatMessage = (level, message, data) => {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${level}]`;
  const content = data ? `${message} ${JSON.stringify(data)}` : message;
  return `${prefix} ${content}`;
};

/**
 * 写入日志文件
 */
const writeLog = (level, message, data) => {
  const logFile = path.join(logsDir, `${level.toLowerCase()}.log`);
  const formattedMessage = formatMessage(level, message, data);
  
  try {
    fs.appendFileSync(logFile, formattedMessage + '\n', 'utf8');
  } catch (error) {
    console.error('[Logger] Error writing log:', error.message);
  }
};

/**
 * 日志对象
 */
const logger = {
  error: (message, data) => {
    writeLog(levels.ERROR, message, data);
  },
  warn: (message, data) => {
    writeLog(levels.WARN, message, data);
  },
  info: (message, data) => {
    writeLog(levels.INFO, message, data);
  },
  debug: (message, data) => {
    writeLog(levels.DEBUG, message, data);
  },
};

module.exports = logger;
