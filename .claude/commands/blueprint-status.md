# 查看蓝图执行状态

使用 Blueprint 工具查看当前蓝图的执行状态。

请依次执行：

1. 调用 Blueprint 工具，action: "status" - 查看总体状态
2. 调用 Blueprint 工具，action: "get_workers" - 查看 Worker 状态
3. 调用 Blueprint 工具，action: "list_checkpoints" - 查看检查点

将结果整理后向用户报告：
- 当前执行进度
- 活跃的 Worker 数量和状态
- 可用的检查点（用于时光倒流）
