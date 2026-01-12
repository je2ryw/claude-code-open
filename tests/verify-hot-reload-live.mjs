/**
 * 实时验证热重载功能
 * 创建、修改、删除技能文件，观察热重载行为
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 动态导入（ESM）
const { getAllSkills, clearSkillCache, initializeSkills } = await import('../dist/tools/skill.js');

// 测试目录
const testDir = path.join(process.cwd(), '.claude', 'skills');
const testSkillDir = path.join(testDir, 'test-hot-reload-skill');
const skillFile = path.join(testSkillDir, 'SKILL.md');

console.log('=== 技能热重载实时测试 ===\n');
console.log(`测试目录: ${testDir}\n`);

// 确保测试目录存在
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
  console.log('✓ 创建测试目录\n');
}

// 清理旧的测试技能
if (fs.existsSync(testSkillDir)) {
  fs.rmSync(testSkillDir, { recursive: true, force: true });
  console.log('✓ 清理旧的测试技能\n');
}

// 重新加载技能
clearSkillCache();
await initializeSkills();

// 获取初始技能列表
const initialSkills = getAllSkills();
console.log(`初始技能数量: ${initialSkills.length}\n`);

// 步骤 1: 创建新技能
console.log('📝 步骤 1: 创建新技能...');
fs.mkdirSync(testSkillDir, { recursive: true });
fs.writeFileSync(
  skillFile,
  `---
name: Hot Reload Test v1
description: Testing hot reload functionality
---

# Version 1

This is the initial version of the test skill.
`
);
console.log(`✓ 创建文件: ${skillFile}`);
console.log('⏳ 等待热重载（500ms）...\n');

await new Promise(resolve => setTimeout(resolve, 500));

// 检查技能是否被加载
clearSkillCache();
await initializeSkills();
let skills = getAllSkills();
let testSkill = skills.find(s => s.skillName.includes('test-hot-reload-skill'));

if (testSkill) {
  console.log('✓ 新技能已加载');
  console.log(`  名称: ${testSkill.displayName}`);
  console.log(`  描述: ${testSkill.description}`);
  console.log(`  内容预览: ${testSkill.markdownContent.substring(0, 50)}...\n`);
} else {
  console.log('✗ 新技能未被加载（可能需要重启）\n');
}

// 步骤 2: 修改技能
console.log('📝 步骤 2: 修改技能内容...');
fs.writeFileSync(
  skillFile,
  `---
name: Hot Reload Test v2
description: Updated via hot reload
---

# Version 2

This is the **updated** version with new content!

## New Features
- Feature A
- Feature B
`
);
console.log('✓ 修改文件内容');
console.log('⏳ 等待热重载（500ms）...\n');

await new Promise(resolve => setTimeout(resolve, 500));

// 检查技能是否被更新
clearSkillCache();
await initializeSkills();
skills = getAllSkills();
testSkill = skills.find(s => s.skillName.includes('test-hot-reload-skill'));

if (testSkill) {
  console.log('✓ 技能已更新');
  console.log(`  名称: ${testSkill.displayName}`);
  console.log(`  描述: ${testSkill.description}`);
  const hasNewContent = testSkill.markdownContent.includes('Version 2') &&
                        testSkill.markdownContent.includes('Feature A');
  console.log(`  内容已更新: ${hasNewContent ? '✓' : '✗'}`);
  if (hasNewContent) {
    console.log('  ✓ 热重载工作正常！\n');
  } else {
    console.log('  ✗ 内容未更新（热重载可能未触发）\n');
  }
} else {
  console.log('✗ 技能未找到\n');
}

// 步骤 3: 删除技能
console.log('📝 步骤 3: 删除技能...');
fs.rmSync(testSkillDir, { recursive: true, force: true });
console.log('✓ 删除技能目录');
console.log('⏳ 等待热重载（500ms）...\n');

await new Promise(resolve => setTimeout(resolve, 500));

// 检查技能是否被移除
clearSkillCache();
await initializeSkills();
skills = getAllSkills();
testSkill = skills.find(s => s.skillName.includes('test-hot-reload-skill'));

if (!testSkill) {
  console.log('✓ 技能已移除\n');
} else {
  console.log('✗ 技能仍然存在（缓存未清理）\n');
}

// 总结
const finalSkills = getAllSkills();
console.log('=== 测试完成 ===');
console.log(`初始技能数: ${initialSkills.length}`);
console.log(`最终技能数: ${finalSkills.length}`);
console.log(`差异: ${finalSkills.length - initialSkills.length}`);

if (finalSkills.length === initialSkills.length) {
  console.log('\n✓ 所有测试通过！热重载功能正常工作');
  process.exit(0);
} else {
  console.log('\n⚠ 技能数量不匹配，可能存在缓存问题');
  process.exit(1);
}
