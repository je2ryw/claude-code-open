/**
 * asyncHandler - 异步路由处理器包装函数
 * 自动捕获异步中间件和路由处理器中的错误，避免重复的try-catch代码
 * 
 * 使用方法:
 * app.post('/route', asyncHandler(async (req, res, next) => {
 *   // 任何错误都会被自动捕获并传递给错误处理中间件
 *   const result = await someAsyncOperation();
 *   res.json(result);
 * }));
 */

/**
 * 创建一个包装异步路由处理器的中间件函数
 * @param {Function} fn - 异步路由处理函数 (req, res, next) => Promise
 * @returns {Function} 返回一个标准的Express中间件函数
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    // 执行异步函数并捕获任何错误
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler;
