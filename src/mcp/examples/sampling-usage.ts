/**
 * MCP Sampling Usage Examples
 *
 * This file demonstrates how to use the MCP Sampling feature,
 * which allows MCP servers to request LLM completions from the client.
 *
 * Based on MCP Specification 2024-11-05
 */

import {
  McpSamplingManager,
  CreateMessageParams,
  CreateMessageResult,
  createTextContent,
  createSamplingRequest,
  createModelPreferences,
} from '../sampling.js';
import { createClientWithModel } from '../../core/client.js';
import type { Message, ContentBlock } from '../../types/index.js';
import type { ModelPreferences, SamplingMessageContent } from '../protocol.js';

// ============ Example 1: Basic Sampling Setup ============

/**
 * Example: Setting up a sampling manager and registering a callback
 */
function example1_BasicSetup() {
  // Create a sampling manager
  const samplingManager = new McpSamplingManager({
    defaultTimeout: 60000, // 60 seconds
    maxConcurrentRequests: 5,
  });

  // Register a callback for a specific server
  samplingManager.registerCallback('my-mcp-server', async (params) => {
    console.log('Received sampling request:', params);

    // 根据 modelPreferences 选择合适的模型
    // intelligencePriority 越高，选择越强的模型
    const modelAlias = selectModelByPreferences(params.modelPreferences);

    // 创建 Claude 客户端实例
    const client = createClientWithModel(modelAlias);

    // 将 MCP 消息格式转换为 Claude API 消息格式
    const messages = convertMcpMessagesToClaudeFormat(params.messages);

    // 调用 Claude API
    const response = await client.createMessage(
      messages,
      undefined,  // 不使用工具
      params.systemPrompt,
      {
        enableThinking: false,  // MCP sampling 通常不需要思考功能
      }
    );

    // 提取响应文本
    const responseText = extractTextFromContent(response.content);

    // 将 Claude 响应转换为 MCP 格式
    const result: CreateMessageResult = {
      role: 'assistant',
      content: {
        type: 'text',
        text: responseText,
      },
      model: response.model,
      stopReason: convertStopReason(response.stopReason),
    };

    return result;
  });

  // Listen to events
  samplingManager.on('request:start', ({ requestId, serverName }) => {
    console.log(`Sampling request started: ${requestId} from ${serverName}`);
  });

  samplingManager.on('request:complete', ({ requestId, result }) => {
    console.log(`Sampling request completed: ${requestId}`, result);
  });

  samplingManager.on('request:error', ({ requestId, error }) => {
    console.error(`Sampling request failed: ${requestId}`, error);
  });

  return samplingManager;
}

// ============ Example 2: Handling Sampling Requests ============

/**
 * Example: Handling a sampling request from an MCP server
 */
async function example2_HandleRequest() {
  const manager = example1_BasicSetup();

  // Simulate receiving a sampling request from the server
  const samplingRequest: CreateMessageParams = {
    messages: [
      createTextContent('What is the capital of France?'),
    ],
    maxTokens: 100,
    systemPrompt: 'You are a helpful geography assistant.',
    temperature: 0.7,
    modelPreferences: createModelPreferences({
      intelligencePriority: 0.8, // Prefer more capable models
      costPriority: 0.3, // Less concerned about cost
      speedPriority: 0.5, // Moderate speed preference
    }),
  };

  try {
    const result = await manager.handleSamplingRequest(
      'my-mcp-server',
      samplingRequest
    );
    console.log('Sampling result:', result);
  } catch (error) {
    console.error('Sampling failed:', error);
  }
}

// ============ Example 3: Creating Sampling Requests ============

/**
 * Example: Creating various types of sampling requests
 */
function example3_CreateRequests() {
  // Simple text request
  const simpleRequest = createSamplingRequest([
    createTextContent('Hello, how are you?'),
  ]);

  // Request with system prompt and options
  const detailedRequest = createSamplingRequest(
    [
      createTextContent('Explain quantum computing in simple terms.'),
    ],
    {
      systemPrompt: 'You are a physics teacher explaining concepts to beginners.',
      maxTokens: 500,
      temperature: 0.5,
      modelPreferences: {
        intelligencePriority: 0.9, // Need a smart model
        costPriority: 0.2,
        speedPriority: 0.3,
      },
      includeContext: 'thisServer',
    }
  );

  // Multi-turn conversation request
  const conversationRequest = createSamplingRequest([
    createTextContent('What is TypeScript?'),
    // In a real scenario, you might have previous assistant responses here
  ]);

  return {
    simpleRequest,
    detailedRequest,
    conversationRequest,
  };
}

// ============ Example 4: Integration with Anthropic Claude ============

/**
 * Example: Integrating sampling with Anthropic's Claude API
 *
 * 本示例展示如何将 MCP Sampling 与 Claude API 集成
 * 使用项目中的 createClientWithModel 函数来调用 Claude
 */
async function example4_ClaudeIntegration() {
  const manager = new McpSamplingManager();

  // 注册调用 Claude API 的回调函数
  manager.registerCallback('my-server', async (params) => {
    // 根据 modelPreferences 选择合适的模型
    // 利用辅助函数自动处理模型选择逻辑
    const modelAlias = selectModelByPreferences(params.modelPreferences);

    // 创建 Claude 客户端实例
    // createClientWithModel 会自动处理认证（API Key 或 OAuth）
    const client = createClientWithModel(modelAlias);

    // 将 MCP 消息格式转换为 Claude API 消息格式
    // MCP sampling 中 messages 是内容数组，需要转换为 Claude 的 Message[] 格式
    const messages = convertMcpMessagesToClaudeFormat(params.messages);

    // 调用 Claude API
    // 注意：MCP sampling 场景通常不需要工具调用功能
    const response = await client.createMessage(
      messages,
      undefined,  // 不使用工具
      params.systemPrompt,
      {
        enableThinking: false,  // MCP sampling 通常不需要思考功能
      }
    );

    // 从 Claude 响应中提取文本内容
    // Claude 响应可能包含多个 content block，这里合并所有文本
    const responseText = extractTextFromContent(response.content);

    // 将 Claude 响应转换为 MCP CreateMessageResult 格式
    const result: CreateMessageResult = {
      role: 'assistant',
      content: {
        type: 'text',
        text: responseText,
      },
      model: response.model,
      // 转换停止原因：Claude 使用 snake_case，MCP 使用 camelCase
      stopReason: convertStopReason(response.stopReason),
    };

    return result;
  });
}

// ============ Example 5: Security and Human-in-the-Loop ============

/**
 * Example: Implementing security checks and human review
 */
async function example5_SecurityChecks() {
  const manager = new McpSamplingManager();

  manager.registerCallback('untrusted-server', async (params) => {
    // Security Check 1: Review system prompt for prompt injection
    if (params.systemPrompt && containsSuspiciousContent(params.systemPrompt)) {
      throw new Error('Suspicious system prompt detected. Request rejected.');
    }

    // Security Check 2: Review messages for harmful content
    for (const message of params.messages) {
      if (message.type === 'text' && message.text) {
        if (containsSuspiciousContent(message.text)) {
          throw new Error('Suspicious message content detected. Request rejected.');
        }
      }
    }

    // Security Check 3: Limit token usage to prevent abuse
    if (params.maxTokens > 2000) {
      console.warn('High token request detected. Capping at 2000 tokens.');
      params.maxTokens = 2000;
    }

    // Human-in-the-Loop: For sensitive requests, require approval
    // (In a real implementation, this would show a UI prompt)
    const humanApproved = await requestHumanApproval(params);
    if (!humanApproved) {
      throw new Error('Human reviewer rejected the sampling request.');
    }

    // 安全检查通过后，执行实际的 LLM 调用
    // 根据 modelPreferences 选择合适的模型
    const modelAlias = selectModelByPreferences(params.modelPreferences);

    // 创建 Claude 客户端实例
    const client = createClientWithModel(modelAlias);

    // 将 MCP 消息格式转换为 Claude API 消息格式
    const messages = convertMcpMessagesToClaudeFormat(params.messages);

    // 调用 Claude API
    const response = await client.createMessage(
      messages,
      undefined,  // 安全场景通常不需要工具
      params.systemPrompt,
      {
        enableThinking: false,  // MCP sampling 通常不需要思考功能
      }
    );

    // 提取响应文本
    const responseText = extractTextFromContent(response.content);

    // 将 Claude 响应转换为 MCP 格式并返回
    return {
      role: 'assistant' as const,
      content: { type: 'text', text: responseText },
      model: response.model,
      stopReason: convertStopReason(response.stopReason),
    };
  });
}

// Helper functions for security example
function containsSuspiciousContent(text: string): boolean {
  // Simplified detection logic
  const suspiciousPatterns = [
    /ignore previous instructions/i,
    /disregard all rules/i,
    /pretend you are/i,
    // Add more patterns as needed
  ];

  return suspiciousPatterns.some(pattern => pattern.test(text));
}

async function requestHumanApproval(params: CreateMessageParams): Promise<boolean> {
  // In a real implementation, this would show a UI dialog
  // and wait for human approval
  console.log('Requesting human approval for:', params);
  return true; // Auto-approve for demo
}

// ============ Example 6: Error Handling ============

/**
 * Example: Proper error handling for sampling requests
 */
async function example6_ErrorHandling() {
  const manager = new McpSamplingManager();

  manager.registerCallback('my-server', async (params) => {
    try {
      // 执行实际的 LLM 调用
      // 根据 modelPreferences 选择合适的模型
      const modelAlias = selectModelByPreferences(params.modelPreferences);

      // 创建 Claude 客户端实例
      const client = createClientWithModel(modelAlias);

      // 将 MCP 消息格式转换为 Claude API 消息格式
      const messages = convertMcpMessagesToClaudeFormat(params.messages);

      // 调用 Claude API
      const response = await client.createMessage(
        messages,
        undefined,  // 错误处理示例不需要工具
        params.systemPrompt,
        {
          enableThinking: false,
        }
      );

      // 提取响应文本
      const responseText = extractTextFromContent(response.content);

      // 返回 MCP 格式的响应
      return {
        role: 'assistant' as const,
        content: { type: 'text', text: responseText },
        model: response.model,
        stopReason: convertStopReason(response.stopReason),
      };
    } catch (error) {
      // Log the error
      console.error('LLM call failed:', error);

      // Re-throw with more context
      throw new Error(
        `Failed to complete sampling request: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  });

  // Handle errors at the manager level
  try {
    const request = createSamplingRequest([
      createTextContent('Test message'),
    ]);

    const result = await manager.handleSamplingRequest('my-server', request);
    console.log('Success:', result);
  } catch (error) {
    console.error('Sampling request failed:', error);

    // Implement retry logic, fallback mechanisms, etc.
    // ...
  }
}

// ============ LLM 调用辅助函数 ============

/**
 * 根据 MCP 模型偏好选择合适的 Claude 模型
 *
 * 模型选择逻辑：
 * - intelligencePriority >= 0.8: 使用 opus (最强模型)
 * - intelligencePriority >= 0.5: 使用 sonnet (均衡模型)
 * - 其他情况: 使用 haiku (快速/低成本模型)
 *
 * 同时考虑 costPriority 和 speedPriority：
 * - 如果 costPriority 很高 (>0.7) 或 speedPriority 很高 (>0.8)，优先选择 haiku
 */
function selectModelByPreferences(preferences?: ModelPreferences): string {
  if (!preferences) {
    // 默认使用 sonnet
    return 'sonnet';
  }

  const {
    intelligencePriority = 0.5,
    costPriority = 0.5,
    speedPriority = 0.5,
  } = preferences;

  // 如果非常注重成本或速度，使用 haiku
  if (costPriority > 0.7 || speedPriority > 0.8) {
    return 'haiku';
  }

  // 如果非常注重智能程度，使用 opus
  if (intelligencePriority >= 0.8) {
    return 'opus';
  }

  // 中等智能需求，使用 sonnet
  if (intelligencePriority >= 0.5) {
    return 'sonnet';
  }

  // 低智能需求，使用 haiku
  return 'haiku';
}

/**
 * 将 MCP 消息内容数组转换为 Claude API 消息格式
 *
 * MCP sampling 协议中，messages 是内容数组 (SamplingMessageContent[])
 * 需要转换为 Claude 的 Message[] 格式
 *
 * 转换规则：
 * - 所有内容都作为 user 角色的单条消息
 * - 文本内容直接映射
 * - 图片内容转换为 image content block
 */
function convertMcpMessagesToClaudeFormat(
  mcpMessages: SamplingMessageContent[]
): Message[] {
  // MCP sampling 中，messages 实际上是单个用户请求的内容数组
  // 将其合并为一条 user 消息
  const contentBlocks: Array<{ type: string; text?: string; [key: string]: unknown }> = [];

  for (const content of mcpMessages) {
    if (content.type === 'text' && content.text) {
      contentBlocks.push({
        type: 'text',
        text: content.text,
      });
    } else if (content.type === 'image') {
      // 处理图片内容（如果有）
      contentBlocks.push({
        type: 'image',
        source: content.source || content.data,
      });
    } else {
      // 其他类型直接传递
      contentBlocks.push(content);
    }
  }

  // 如果只有一个文本块，简化为字符串
  if (contentBlocks.length === 1 && contentBlocks[0].type === 'text') {
    return [
      {
        role: 'user',
        content: contentBlocks[0].text || '',
      },
    ];
  }

  // 返回包含多个内容块的消息
  return [
    {
      role: 'user',
      content: contentBlocks as any,
    },
  ];
}

/**
 * 从 Claude 响应内容中提取文本
 *
 * Claude 响应可能包含多个 content block：
 * - text: 文本响应
 * - tool_use: 工具调用（在 sampling 场景中通常不使用）
 */
function extractTextFromContent(content: ContentBlock[]): string {
  const textParts: string[] = [];

  for (const block of content) {
    if (block.type === 'text' && 'text' in block) {
      textParts.push(block.text);
    }
  }

  return textParts.join('\n');
}

/**
 * 将 Claude 停止原因转换为 MCP 格式
 *
 * Claude API 停止原因：
 * - 'end_turn': 正常结束
 * - 'max_tokens': 达到 token 限制
 * - 'stop_sequence': 遇到停止序列
 * - 'tool_use': 工具调用（在 sampling 中不常见）
 *
 * MCP 停止原因：
 * - 'endTurn': 正常结束
 * - 'maxTokens': 达到 token 限制
 * - 'stopSequence': 遇到停止序列
 */
function convertStopReason(
  claudeReason: string
): 'endTurn' | 'maxTokens' | 'stopSequence' | string {
  switch (claudeReason) {
    case 'end_turn':
      return 'endTurn';
    case 'max_tokens':
      return 'maxTokens';
    case 'stop_sequence':
      return 'stopSequence';
    default:
      // 其他原因直接返回
      return claudeReason;
  }
}

// ============ Export Examples ============

export {
  example1_BasicSetup,
  example2_HandleRequest,
  example3_CreateRequests,
  example4_ClaudeIntegration,
  example5_SecurityChecks,
  example6_ErrorHandling,
  // 导出辅助函数供外部使用
  selectModelByPreferences,
  convertMcpMessagesToClaudeFormat,
  extractTextFromContent,
  convertStopReason,
};
