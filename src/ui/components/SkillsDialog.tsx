/**
 * SkillsDialog 组件 - 官方风格的 Skills 对话框
 * 显示可用的 skills，按来源分组
 */

import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Skill 来源类型
type SkillSource = 'policySettings' | 'userSettings' | 'projectSettings' | 'localSettings' | 'flagSettings' | 'plugin' | 'builtin';

// Skill 信息
interface SkillInfo {
  name: string;
  source: SkillSource;
  description?: string;
  contentLength?: number;
  filePath?: string;
}

interface SkillsDialogProps {
  onClose: () => void;
  cwd: string;
}

// 来源显示名称
const SOURCE_LABELS: Record<SkillSource, string> = {
  policySettings: 'Enterprise Policy',
  userSettings: 'User Settings',
  projectSettings: 'Project',
  localSettings: 'Local',
  flagSettings: 'Flag Settings',
  plugin: 'Plugins',
  builtin: 'Built-in',
};

// 来源路径提示
const SOURCE_PATHS: Record<SkillSource, string> = {
  policySettings: '',
  userSettings: '~/.claude/skills/',
  projectSettings: '.claude/commands/',
  localSettings: '.claude/skills/',
  flagSettings: '',
  plugin: '~/.claude/plugins/',
  builtin: '',
};

// 格式化 token 数
function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

// 扫描目录中的 skills
function scanSkillsDir(dir: string, source: SkillSource): SkillInfo[] {
  const skills: SkillInfo[] = [];

  if (!fs.existsSync(dir)) return skills;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(dir, file);
        const name = file.replace('.md', '');

        let contentLength = 0;
        try {
          const stat = fs.statSync(filePath);
          contentLength = stat.size;
        } catch {
          // ignore
        }

        skills.push({
          name,
          source,
          contentLength,
          filePath,
        });
      }
    }
  } catch {
    // ignore
  }

  return skills;
}

// 获取所有可用的 skills
function getAllSkills(cwd: string): SkillInfo[] {
  const skills: SkillInfo[] = [];

  // 内置 skills
  const builtinSkills: SkillInfo[] = [
    { name: 'pdf', source: 'builtin', description: 'Extract and analyze PDF documents' },
    { name: 'xlsx', source: 'builtin', description: 'Read and process Excel files' },
    { name: 'csv', source: 'builtin', description: 'Parse and analyze CSV data' },
    { name: 'json', source: 'builtin', description: 'Format and validate JSON' },
    { name: 'html', source: 'builtin', description: 'Parse HTML documents' },
    { name: 'review-pr', source: 'builtin', description: 'Review pull requests' },
  ];
  skills.push(...builtinSkills);

  // User skills (~/.claude/skills/)
  const userSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  skills.push(...scanSkillsDir(userSkillsDir, 'userSettings'));

  // Project skills (.claude/commands/)
  const projectSkillsDir = path.join(cwd, '.claude', 'commands');
  skills.push(...scanSkillsDir(projectSkillsDir, 'projectSettings'));

  // Local skills (.claude/skills/)
  const localSkillsDir = path.join(cwd, '.claude', 'skills');
  skills.push(...scanSkillsDir(localSkillsDir, 'localSettings'));

  return skills;
}

export const SkillsDialog: React.FC<SkillsDialogProps> = ({ onClose, cwd }) => {
  // 处理键盘输入
  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === 'q') {
      onClose();
    }
  });

  // 获取并分组 skills
  const skills = useMemo(() => getAllSkills(cwd), [cwd]);

  const groupedSkills = useMemo(() => {
    const groups: Record<SkillSource, SkillInfo[]> = {
      policySettings: [],
      userSettings: [],
      projectSettings: [],
      localSettings: [],
      flagSettings: [],
      plugin: [],
      builtin: [],
    };

    for (const skill of skills) {
      if (skill.source in groups) {
        groups[skill.source].push(skill);
      }
    }

    return groups;
  }, [skills]);

  // 渲染单个 skill
  const renderSkill = (skill: SkillInfo) => {
    const tokens = skill.contentLength ? Math.ceil(skill.contentLength / 4) : undefined;
    const tokenStr = tokens ? formatTokens(tokens) : '';

    return (
      <Box key={`${skill.name}-${skill.source}`}>
        <Text>{skill.name}</Text>
        {tokenStr && <Text dimColor> · {tokenStr} tokens</Text>}
      </Box>
    );
  };

  // 渲染分组
  const renderGroup = (source: SkillSource) => {
    const items = groupedSkills[source];
    if (items.length === 0) return null;

    const label = SOURCE_LABELS[source];
    const pathHint = SOURCE_PATHS[source];

    return (
      <Box flexDirection="column" key={source} marginBottom={1}>
        <Box>
          <Text bold dimColor>{label}</Text>
          {pathHint && <Text dimColor> ({pathHint})</Text>}
        </Box>
        <Box flexDirection="column" marginLeft={2}>
          {items.map(renderSkill)}
        </Box>
      </Box>
    );
  };

  // 无 skills 时的显示
  if (skills.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
      >
        <Box marginBottom={1}>
          <Text bold color="cyan">Skills</Text>
          <Text dimColor> · No skills found</Text>
        </Box>

        <Text dimColor>Create skills in .claude/skills/ or ~/.claude/skills/</Text>

        <Box marginTop={1}>
          <Text dimColor italic>Esc to close</Text>
        </Box>
      </Box>
    );
  }

  // 正常显示
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Skills</Text>
        <Text dimColor> · {skills.length} skill{skills.length === 1 ? '' : 's'}</Text>
      </Box>

      <Box flexDirection="column">
        {renderGroup('builtin')}
        {renderGroup('policySettings')}
        {renderGroup('userSettings')}
        {renderGroup('projectSettings')}
        {renderGroup('localSettings')}
        {renderGroup('plugin')}
      </Box>

      <Box marginTop={1}>
        <Text dimColor italic>Esc to close</Text>
      </Box>
    </Box>
  );
};

export default SkillsDialog;
