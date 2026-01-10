# 蓝图分析缓存系统

## 概述

为了避免每次都重新分析未变化的代码，我们实现了一个基于文件内容哈希的智能缓存系统。

## 工作原理

### 缓存键生成
- **文件**: 使用文件内容的 MD5 哈希
- **目录**: 使用子文件列表的 MD5 哈希

### 缓存失效
缓存在以下情况下会失效：
1. **文件内容变化**: MD5 哈希不匹配
2. **目录结构变化**: 子文件列表变化
3. **缓存过期**: 超过 30 天未访问

## 文件结构

```
~/.claude/blueprint-cache/
├── <path-hash-1>.json   # 缓存文件 1
├── <path-hash-2>.json   # 缓存文件 2
└── ...
```

### 缓存文件格式

```json
{
  "path": "src/agents",
  "hash": "5d41402abc4b2a76b9719d911017c592",
  "analysis": {
    "path": "src/agents",
    "name": "agents",
    "type": "directory",
    "summary": "Agent 模块",
    "description": "...",
    "responsibilities": ["..."],
    "techStack": ["TypeScript"]
  },
  "createdAt": "2026-01-10T12:00:00.000Z",
  "lastAccessedAt": "2026-01-10T12:30:00.000Z"
}
```

## API 使用

### 后端 API

#### 分析节点（自动使用缓存）
```bash
POST /api/blueprint/analyze-node
{
  "path": "src/agents"
}

# 响应
{
  "success": true,
  "data": {
    ...analysis...,
    "fromCache": true  # 标志：是否来自缓存
  }
}
```

#### 获取缓存统计
```bash
GET /api/blueprint/cache/stats

# 响应
{
  "success": true,
  "data": {
    "total": 15,           # 总缓存数
    "size": 245760,        # 缓存大小（字节）
    "hits": 10,            # 命中次数
    "misses": 5,           # 未命中次数
    "hitRate": 0.67        # 命中率 (67%)
  }
}
```

#### 清除所有缓存
```bash
DELETE /api/blueprint/cache

# 响应
{
  "success": true,
  "message": "已清除 15 个缓存文件"
}
```

#### 清除过期缓存
```bash
DELETE /api/blueprint/cache/expired

# 响应
{
  "success": true,
  "message": "已清除 3 个过期缓存"
}
```

#### 清除指定路径的缓存
```bash
DELETE /api/blueprint/cache/path
{
  "path": "src/agents"
}

# 响应
{
  "success": true,
  "message": "缓存已清除"
}
```

#### 重置统计信息
```bash
POST /api/blueprint/cache/reset-stats

# 响应
{
  "success": true,
  "message": "统计已重置"
}
```

### 前端 API

```typescript
import { cacheApi } from '@/api/blueprint';

// 获取统计
const stats = await cacheApi.getStats();
console.log(`命中率: ${stats.hitRate * 100}%`);

// 清除所有缓存
await cacheApi.clearAll();

// 清除过期缓存
await cacheApi.clearExpired();

// 清除指定路径
await cacheApi.clearPath('src/agents');

// 重置统计
await cacheApi.resetStats();
```

## UI 显示

### 分析结果页面

分析结果底部会显示缓存状态：

- **⚡ 缓存**: 结果来自缓存（蓝色徽章）
- **✨ 新分析**: 结果是新生成的（绿色徽章）

### 状态栏

底部状态栏显示已分析的节点数量：`15 已分析`

## 性能优势

### 对比测试

| 场景 | 无缓存 | 有缓存 | 提升 |
|------|--------|--------|------|
| 首次分析 | 3-5秒 | 3-5秒 | - |
| 重复分析（文件未变） | 3-5秒 | <50ms | **60-100倍** |
| 重复分析（文件已变） | 3-5秒 | 3-5秒 | - |

### 节省成本

假设每次 AI 分析成本 $0.001：
- 100 次重复分析无缓存：$0.10
- 100 次重复分析有缓存：$0.001 + 99 × $0.00001 = **$0.002**
- **节省 98% 的 API 费用**

## 缓存策略

### 自动清理

系统会在以下时机自动清理过期缓存：
- 应用启动时（后台任务）
- 每 24 小时（定时任务）

### 手动清理

建议定期清理缓存：
```bash
# 清除过期缓存（推荐）
DELETE /api/blueprint/cache/expired

# 完全清除（谨慎使用）
DELETE /api/blueprint/cache
```

## 注意事项

1. **文件变化检测**: 基于内容哈希，不依赖文件修改时间
2. **目录变化**: 只检测子文件列表，不递归检测子目录内容
3. **缓存大小**: 默认无限制，建议监控 `~/.claude/blueprint-cache/` 目录大小
4. **并发安全**: 当前实现为单进程安全，多进程环境需要加锁

## 未来优化

- [ ] 添加缓存大小限制（LRU 策略）
- [ ] 支持递归目录内容哈希
- [ ] 添加缓存预热功能
- [ ] 支持多进程并发访问
- [ ] 添加缓存导入/导出功能
