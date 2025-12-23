/**
 * 计划模式工具
 * EnterPlanMode 和 ExitPlanMode
 */

import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition, ExitPlanModeInput } from '../types/index.js';

// 计划模式状态管理
let planModeActive = false;
let currentPlanFile: string | null = null;

export function isPlanModeActive(): boolean {
  return planModeActive;
}

export function getPlanFile(): string | null {
  return currentPlanFile;
}

export function setPlanMode(active: boolean, planFile?: string): void {
  planModeActive = active;
  currentPlanFile = planFile || null;
}

export class EnterPlanModeTool extends BaseTool<Record<string, unknown>, ToolResult> {
  name = 'EnterPlanMode';
  description = `Use this tool when you encounter a complex task that requires careful planning and exploration before implementation.

## When to Use This Tool

Use EnterPlanMode when ANY of these conditions apply:

1. **Multiple Valid Approaches**: The task can be solved in several different ways, each with trade-offs
2. **Significant Architectural Decisions**: The task requires choosing between architectural patterns
3. **Large-Scale Changes**: The task touches many files or systems
4. **Unclear Requirements**: You need to explore before understanding the full scope
5. **User Input Needed**: You'll need to ask clarifying questions before starting

## When NOT to Use This Tool

Do NOT use EnterPlanMode for:
- Simple, straightforward tasks with obvious implementation
- Small bug fixes where the solution is clear
- Adding a single function or small feature
- Tasks you're already confident how to implement
- Research-only tasks

## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Exit plan mode with ExitPlanMode when ready to implement`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  async execute(_input: Record<string, unknown>): Promise<ToolResult> {
    if (planModeActive) {
      return {
        success: false,
        error: 'Already in plan mode. Use ExitPlanMode to exit first.',
      };
    }

    planModeActive = true;

    return {
      success: true,
      output: `Entered plan mode.

You are now in planning mode. In this mode:
- Explore the codebase thoroughly using Read, Glob, and Grep tools
- Understand existing patterns and architecture
- Design your implementation approach
- Write your plan to a file
- Use ExitPlanMode when ready for user approval

Focus on understanding the problem before proposing solutions.`,
    };
  }
}

export class ExitPlanModeTool extends BaseTool<ExitPlanModeInput, ToolResult> {
  name = 'ExitPlanMode';
  description = `Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to the plan file
- This tool signals that you're done planning and ready for the user to review and approve
- The user will see the contents of your plan file when they review it

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code.

## Handling Ambiguity in Plans
Before using this tool, ensure your plan is clear and unambiguous.`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  async execute(_input: ExitPlanModeInput): Promise<ToolResult> {
    if (!planModeActive) {
      return {
        success: false,
        error: 'Not in plan mode. Use EnterPlanMode first.',
      };
    }

    planModeActive = false;
    const planFile = currentPlanFile;
    currentPlanFile = null;

    return {
      success: true,
      output: planFile
        ? `Exited plan mode. Plan file: ${planFile}\n\nAwaiting user approval to proceed with implementation.`
        : `Exited plan mode. Awaiting user approval to proceed with implementation.`,
    };
  }
}
