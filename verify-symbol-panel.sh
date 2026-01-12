#!/bin/bash

echo "======================================"
echo "符号详情面板组件验证脚本"
echo "======================================"
echo ""

# 1. 检查文件是否存在
echo "1. 检查文件结构..."
files=(
  "src/web/client/src/components/swarm/ProjectNavigator/SymbolDetailPanel.tsx"
  "src/web/client/src/components/swarm/ProjectNavigator/SymbolDetailPanel.module.css"
  "src/web/client/src/components/swarm/ProjectNavigator/views/ClassStructureView.tsx"
  "src/web/client/src/components/swarm/ProjectNavigator/views/InterfaceStructureView.tsx"
  "src/web/client/src/components/swarm/ProjectNavigator/views/FunctionDetailView.tsx"
  "src/web/client/src/components/swarm/ProjectNavigator/views/DataSymbolView.tsx"
  "src/web/client/src/components/swarm/ProjectNavigator/views/TypeDefinitionView.tsx"
)

all_exist=true
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✓ $file"
  else
    echo "  ✗ $file (不存在)"
    all_exist=false
  fi
done

if [ "$all_exist" = true ]; then
  echo "  ✓ 所有文件都已创建"
else
  echo "  ✗ 部分文件缺失"
  exit 1
fi

echo ""

# 2. 统计代码行数
echo "2. 代码统计..."
total_lines=$(wc -l src/web/client/src/components/swarm/ProjectNavigator/SymbolDetailPanel.tsx src/web/client/src/components/swarm/ProjectNavigator/views/*.tsx | tail -1 | awk '{print $1}')
echo "  总代码行数: $total_lines"

echo ""

# 3. 检查导出
echo "3. 检查导出..."
if grep -q "export { SymbolDetailPanel }" src/web/client/src/components/swarm/ProjectNavigator/index.ts; then
  echo "  ✓ SymbolDetailPanel 已在 index.ts 中导出"
else
  echo "  ✗ SymbolDetailPanel 未在 index.ts 中导出"
fi

echo ""

# 4. 检查 TypeScript 类型
echo "4. 检查 TypeScript 类型..."
cd src/web/client
if npx tsc --noEmit 2>&1 | grep -q "SymbolDetailPanel\|ClassStructureView\|InterfaceStructureView\|FunctionDetailView\|DataSymbolView\|TypeDefinitionView"; then
  echo "  ✗ 发现 TypeScript 错误"
  npx tsc --noEmit 2>&1 | grep "SymbolDetailPanel\|ClassStructureView\|InterfaceStructureView\|FunctionDetailView\|DataSymbolView\|TypeDefinitionView"
else
  echo "  ✓ 没有 TypeScript 类型错误"
fi

cd ../../../

echo ""
echo "======================================"
echo "验证完成！"
echo "======================================"
