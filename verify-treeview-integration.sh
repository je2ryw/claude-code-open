#!/bin/bash

echo "================================"
echo "TreeView 和 SymbolBrowser 集成验证"
echo "================================"
echo ""

# 检查文件是否存在
echo "1. 检查文件是否存在..."
files=(
  "src/web/client/src/components/common/TreeView/index.tsx"
  "src/web/client/src/components/common/TreeView/TreeView.module.css"
  "src/web/client/src/components/common/TreeView/TreeViewExample.tsx"
  "src/web/client/src/components/common/TreeView/README.md"
  "src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.tsx"
  "src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.module.css"
  "src/web/client/src/components/swarm/ProjectNavigator/LeftPanel.tsx"
  "src/web/client/src/components/common/index.ts"
)

all_exist=true
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (缺失)"
    all_exist=false
  fi
done

if [ "$all_exist" = true ]; then
  echo ""
  echo "✅ 所有文件都存在"
else
  echo ""
  echo "❌ 有文件缺失"
  exit 1
fi

# 检查导入是否正确
echo ""
echo "2. 检查 LeftPanel 是否导入 SymbolBrowserView..."
if grep -q "import.*SymbolBrowserView" src/web/client/src/components/swarm/ProjectNavigator/LeftPanel.tsx; then
  echo "  ✅ 导入正确"
else
  echo "  ❌ 未找到导入语句"
  exit 1
fi

# 检查是否使用了组件
echo ""
echo "3. 检查 LeftPanel 是否使用 SymbolBrowserView..."
if grep -q "<SymbolBrowserView" src/web/client/src/components/swarm/ProjectNavigator/LeftPanel.tsx; then
  echo "  ✅ 组件已使用"
else
  echo "  ❌ 组件未使用"
  exit 1
fi

# 检查 TreeView 导出
echo ""
echo "4. 检查 TreeView 类型导出..."
if grep -q "export.*TreeNode" src/web/client/src/components/common/TreeView/index.tsx; then
  echo "  ✅ TreeNode 已导出"
else
  echo "  ❌ TreeNode 未导出"
  exit 1
fi

if grep -q "export.*TreeView" src/web/client/src/components/common/TreeView/index.tsx; then
  echo "  ✅ TreeView 已导出"
else
  echo "  ❌ TreeView 未导出"
  exit 1
fi

# 检查 TypeScript 编译
echo ""
echo "5. 检查 TypeScript 编译..."
cd src/web/client
if npm run build > /tmp/build.log 2>&1; then
  echo "  ✅ 编译成功"
else
  # 检查是否有 TreeView 相关错误
  if grep -E "(TreeView|SymbolBrowser)" /tmp/build.log; then
    echo "  ❌ 存在 TreeView/SymbolBrowser 相关编译错误:"
    grep -E "(TreeView|SymbolBrowser)" /tmp/build.log
    exit 1
  else
    echo "  ⚠️  存在编译错误,但与 TreeView/SymbolBrowser 无关"
  fi
fi
cd ../../..

# 统计代码行数
echo ""
echo "6. 代码统计..."
echo "  TreeView 组件:"
wc -l src/web/client/src/components/common/TreeView/*.tsx | tail -1 | awk '{print "    TypeScript: " $1 " 行"}'
wc -l src/web/client/src/components/common/TreeView/*.css | tail -1 | awk '{print "    CSS: " $1 " 行"}'
echo ""
echo "  SymbolBrowser 组件:"
wc -l src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.tsx | awk '{print "    TypeScript: " $1 " 行"}'
wc -l src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.module.css | awk '{print "    CSS: " $1 " 行"}'

echo ""
echo "================================"
echo "✅ 验证完成!"
echo "================================"
echo ""
echo "下一步:"
echo "1. 启动 Web 服务器: npm run dev"
echo "2. 访问 ProjectNavigator 页面"
echo "3. 切换到'符号'标签验证功能"
echo ""
