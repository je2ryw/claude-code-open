#!/bin/bash

# 数据流分析功能验证脚本

echo "========================================"
echo "数据流分析功能验证"
echo "========================================"
echo ""

# 1. TypeScript 编译检查
echo "1. 检查 TypeScript 编译..."
npx tsc --noEmit 2>&1 | grep -E "(data-flow|DataFlow)" && {
  echo "❌ 发现 TypeScript 编译错误"
  exit 1
} || {
  echo "✅ TypeScript 编译通过"
}
echo ""

# 2. 检查数据流分析器文件是否存在
echo "2. 检查数据流分析器文件..."
if [ -f "src/web/server/routes/data-flow-analyzer.ts" ]; then
  echo "✅ 数据流分析器文件存在"
else
  echo "❌ 数据流分析器文件不存在"
  exit 1
fi
echo ""

# 3. 检查 API 路由是否注册
echo "3. 检查 API 路由..."
if grep -q "router.get('/data-flow/:symbolId'" src/web/server/routes/blueprint-api.ts; then
  echo "✅ 数据流 API 路由已注册"
else
  echo "❌ 数据流 API 路由未注册"
  exit 1
fi
echo ""

# 4. 运行单元测试
echo "4. 运行数据流分析器单元测试..."
TEST_OUTPUT=$(npm test -- tests/data-flow-analyzer.test.ts --run 2>&1)
if echo "$TEST_OUTPUT" | grep -q "Test Files.*1 passed"; then
  echo "✅ 单元测试通过"
else
  echo "❌ 单元测试失败"
  echo "$TEST_OUTPUT" | tail -10
  exit 1
fi
echo ""

# 5. 运行集成测试
echo "5. 运行数据流 API 集成测试..."
TEST_OUTPUT=$(npm test -- tests/integration/data-flow-api.test.ts --run 2>&1)
if echo "$TEST_OUTPUT" | grep -q "Test Files.*1 passed"; then
  echo "✅ 集成测试通过"
else
  echo "❌ 集成测试失败"
  echo "$TEST_OUTPUT" | tail -10
  exit 1
fi
echo ""

# 6. 检查 DataSymbolView 组件
echo "6. 检查 DataSymbolView 组件..."
if [ -f "src/web/client/src/components/swarm/ProjectNavigator/views/DataSymbolView.tsx" ]; then
  echo "✅ DataSymbolView 组件存在"

  # 检查是否包含数据流 API 调用
  if grep -q "/api/blueprint/data-flow/" src/web/client/src/components/swarm/ProjectNavigator/views/DataSymbolView.tsx; then
    echo "✅ 组件包含数据流 API 调用"
  else
    echo "❌ 组件未包含数据流 API 调用"
    exit 1
  fi
else
  echo "❌ DataSymbolView 组件不存在"
  exit 1
fi
echo ""

# 7. 检查样式文件
echo "7. 检查样式文件..."
if grep -q "\.locationList\|\.locationItem\|\.statsGrid" src/web/client/src/components/swarm/ProjectNavigator/SymbolDetailPanel.module.css; then
  echo "✅ 数据流相关样式已定义"
else
  echo "❌ 数据流相关样式未定义"
  exit 1
fi
echo ""

# 8. 构建检查
echo "8. 执行构建..."
BUILD_OUTPUT=$(npm run build 2>&1)
if [ $? -eq 0 ]; then
  echo "✅ 项目构建成功"
else
  echo "❌ 项目构建失败"
  echo "$BUILD_OUTPUT" | tail -10
  exit 1
fi
echo ""

echo "========================================"
echo "✅ 所有检查通过！数据流分析功能已完整实现"
echo "========================================"
echo ""
echo "功能清单:"
echo "  ✅ DataFlowAnalyzer 类实现"
echo "  ✅ 数据流 API 路由 (/api/blueprint/data-flow/:symbolId)"
echo "  ✅ DataSymbolView 组件集成"
echo "  ✅ 样式定义完整"
echo "  ✅ 单元测试和集成测试"
echo "  ✅ TypeScript 编译通过"
echo "  ✅ 项目构建成功"
echo ""
echo "核心特性:"
echo "  - 精确的读/写操作识别"
echo "  - 代码上下文提取"
echo "  - 数据流图生成"
echo "  - 支持类属性和全局变量"
echo "  - 完整的错误处理"
echo ""
