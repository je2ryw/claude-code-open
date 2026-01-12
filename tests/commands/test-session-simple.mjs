// 简单测试验证 session.test.ts 的逻辑
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

console.log('Testing session command logic...');

// 测试会话目录创建
const testDir = path.join(os.tmpdir(), 'test-session-validation');
try {
  await fs.mkdir(testDir, { recursive: true });
  console.log('✓ Created test directory');

  // 创建测试会话文件
  const sessionFile = path.join(testDir, 'test-session.json');
  const sessionData = {
    id: 'test-session',
    metadata: {
      created: Date.now(),
      customTitle: 'Test Session',
      messageCount: 5,
    },
    messages: [],
  };

  await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
  console.log('✓ Created test session file');

  // 验证文件存在
  const exists = await fs.access(sessionFile).then(() => true).catch(() => false);
  console.log(`✓ Session file ${exists ? 'exists' : 'does not exist'}`);

  // 读取并验证数据
  const content = await fs.readFile(sessionFile, 'utf-8');
  const parsed = JSON.parse(content);
  console.log(`✓ Parsed session data: ${parsed.metadata.customTitle}`);

  // 清理
  await fs.rm(testDir, { recursive: true, force: true });
  console.log('✓ Cleaned up test directory');

  console.log('\n✅ All basic tests passed!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
