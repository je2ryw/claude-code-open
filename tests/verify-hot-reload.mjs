/**
 * 手动验证热重载功能
 * 检查热重载是否被正确调用
 */

import { toolRegistry } from '../dist/tools/index.js';
import {
  isHotReloadEnabled,
  getAllSkills,
  initializeSkills,
} from '../dist/tools/skill.js';

console.log('=== 技能热重载验证 ===\n');

// 1. 检查工具是否已注册
const tools = toolRegistry.getAll();
console.log(`✓ 已注册 ${tools.length} 个工具`);
console.log(`  工具列表: ${tools.map(t => t.name).join(', ')}\n`);

// 2. 检查 Skill 工具是否存在
const skillTool = toolRegistry.get('Skill');
if (skillTool) {
  console.log('✓ Skill 工具已注册\n');
} else {
  console.log('✗ Skill 工具未注册\n');
}

// 3. 等待异步初始化完成
console.log('等待技能初始化...');
await new Promise(resolve => setTimeout(resolve, 1000));

// 4. 检查热重载状态
const hotReloadStatus = isHotReloadEnabled();
console.log(`热重载状态: ${hotReloadStatus ? '✓ 已启用' : '✗ 未启用'}\n`);

// 5. 检查已加载的技能
const skills = getAllSkills();
console.log(`已加载技能数量: ${skills.length}`);
if (skills.length > 0) {
  console.log('技能列表:');
  for (const skill of skills) {
    console.log(`  - ${skill.skillName} (${skill.source})`);
  }
} else {
  console.log('  (无技能)\n');
}

// 6. 总结
console.log('\n=== 验证结果 ===');
if (hotReloadStatus) {
  console.log('✓ 技能热重载功能正常工作');
} else {
  console.log('✗ 技能热重载功能未启用');
  console.log('  可能原因：');
  console.log('  1. initializeSkills() 是异步的，尚未完成');
  console.log('  2. enableSkillHotReload() 未被调用');
  console.log('  3. chokidar 未安装或监听目录不存在');
}

process.exit(hotReloadStatus ? 0 : 1);
