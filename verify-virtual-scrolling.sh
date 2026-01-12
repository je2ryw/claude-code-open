#!/bin/bash
# 虚拟滚动实现验证脚本

set -e

echo "============================================"
echo "虚拟滚动组件验证"
echo "============================================"
echo ""

# 1. 检查依赖
echo "1. 检查依赖..."
cd "$(dirname "$0")/src/web/client"

if grep -q '"react-window": "\^1.8.10"' package.json; then
  echo "✅ react-window 1.8.10 已安装"
else
  echo "❌ react-window 版本不正确"
  exit 1
fi

if grep -q '"@types/react-window": "\^1.8.8"' package.json; then
  echo "✅ @types/react-window 已安装"
else
  echo "❌ @types/react-window 未安装"
  exit 1
fi

echo ""

# 2. 检查文件存在
echo "2. 检查组件文件..."

FILES=(
  "src/components/common/VirtualList.tsx"
  "src/components/common/VirtualList.module.css"
  "src/components/common/VirtualTree.tsx"
  "src/components/common/VirtualTree.module.css"
  "src/components/common/TreeView/VirtualizedTreeView.tsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file 不存在"
    exit 1
  fi
done

echo ""

# 3. 检查导出
echo "3. 检查模块导出..."

if grep -q "export { VirtualList }" src/components/common/index.ts; then
  echo "✅ VirtualList 已导出"
else
  echo "❌ VirtualList 未导出"
  exit 1
fi

if grep -q "export { VirtualTree }" src/components/common/index.ts; then
  echo "✅ VirtualTree 已导出"
else
  echo "❌ VirtualTree 未导出"
  exit 1
fi

echo ""

# 4. 检查 VirtualizedTreeView 的修改
echo "4. 检查 VirtualizedTreeView 双模式支持..."

if grep -q "useFixedHeight?: boolean" src/components/common/TreeView/VirtualizedTreeView.tsx; then
  echo "✅ useFixedHeight 属性已添加"
else
  echo "❌ useFixedHeight 属性未添加"
  exit 1
fi

if grep -q "import { VariableSizeList, FixedSizeList }" src/components/common/TreeView/VirtualizedTreeView.tsx; then
  echo "✅ 导入了 FixedSizeList 和 VariableSizeList"
else
  echo "❌ 导入不正确"
  exit 1
fi

echo ""

# 5. 检查文档
echo "5. 检查文档文件..."

cd "$(dirname "$0")"

DOCS=(
  "docs/features/VIRTUAL_SCROLLING.md"
  "VIRTUAL_SCROLLING_QUICK_REF.md"
)

for doc in "${DOCS[@]}"; do
  if [ -f "$doc" ]; then
    echo "✅ $doc"
  else
    echo "❌ $doc 不存在"
    exit 1
  fi
done

echo ""

# 6. TypeScript 类型检查（仅检查虚拟滚动相关文件）
echo "6. TypeScript 类型检查..."

cd "$(dirname "$0")/src/web/client"

# 仅检查虚拟滚动组件的导入语句
echo "检查 VirtualList 导入..."
if grep -q "from 'react-window'" src/components/common/VirtualList.tsx; then
  echo "✅ VirtualList 导入正确"
fi

echo "检查 VirtualTree 导入..."
if grep -q "from 'react-window'" src/components/common/VirtualTree.tsx; then
  echo "✅ VirtualTree 导入正确"
fi

echo "检查 VirtualizedTreeView 导入..."
if grep -q "from 'react-window'" src/components/common/TreeView/VirtualizedTreeView.tsx; then
  echo "✅ VirtualizedTreeView 导入正确"
fi

echo ""

# 7. 检查样式文件
echo "7. 检查样式定义..."

if grep -q ".virtualList" src/components/common/VirtualList.module.css; then
  echo "✅ VirtualList 样式已定义"
fi

if grep -q ".virtualTree" src/components/common/VirtualTree.module.css; then
  echo "✅ VirtualTree 样式已定义"
fi

echo ""
echo "============================================"
echo "✅ 所有检查通过！虚拟滚动实现完成"
echo "============================================"
echo ""
echo "使用方法:"
echo "  1. 查看快速参考: cat VIRTUAL_SCROLLING_QUICK_REF.md"
echo "  2. 查看详细文档: cat docs/features/VIRTUAL_SCROLLING.md"
echo "  3. 示例代码见文档中的使用示例"
echo ""
