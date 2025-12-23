/**
 * Web 工具
 * WebFetch 和 WebSearch
 */

import axios from 'axios';
import { BaseTool } from './base.js';
import type { WebFetchInput, WebSearchInput, ToolResult, ToolDefinition } from '../types/index.js';

export class WebFetchTool extends BaseTool<WebFetchInput, ToolResult> {
  name = 'WebFetch';
  description = `Fetches content from a specified URL and processes it.

- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt
- Use this tool when you need to retrieve and analyze web content
- HTTP URLs will be automatically upgraded to HTTPS`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'The URL to fetch content from',
        },
        prompt: {
          type: 'string',
          description: 'The prompt to run on the fetched content',
        },
      },
      required: ['url', 'prompt'],
    };
  }

  async execute(input: WebFetchInput): Promise<ToolResult> {
    let { url, prompt } = input;

    // 升级 HTTP 到 HTTPS
    if (url.startsWith('http://')) {
      url = url.replace('http://', 'https://');
    }

    try {
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClaudeCode/2.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        maxRedirects: 5,
      });

      const contentType = response.headers['content-type'] || '';
      let content = '';

      if (contentType.includes('text/html')) {
        // 简化的 HTML 到文本转换
        content = this.htmlToText(response.data);
      } else if (contentType.includes('application/json')) {
        content = JSON.stringify(response.data, null, 2);
      } else {
        content = String(response.data);
      }

      // 截断过长的内容
      const maxLength = 50000;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + '\n\n... [content truncated]';
      }

      return {
        success: true,
        output: `URL: ${url}\nPrompt: ${prompt}\n\n--- Content ---\n${content}`,
      };
    } catch (err: any) {
      if (err.response?.status === 301 || err.response?.status === 302) {
        const redirectUrl = err.response.headers.location;
        return {
          success: false,
          error: `Redirected to: ${redirectUrl}. Please fetch the new URL.`,
        };
      }
      return { success: false, error: `Fetch error: ${err.message}` };
    }
  }

  private htmlToText(html: string): string {
    // 简化的 HTML 清理
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}

export class WebSearchTool extends BaseTool<WebSearchInput, ToolResult> {
  name = 'WebSearch';
  description = `Search the web and use results to inform responses.

- Provides up-to-date information for current events
- Returns search result information with links
- Use for information beyond Claude's knowledge cutoff
- MUST include a "Sources:" section with URLs after answering`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 2,
          description: 'The search query to use',
        },
        allowed_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only include results from these domains',
        },
        blocked_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Never include results from these domains',
        },
      },
      required: ['query'],
    };
  }

  async execute(input: WebSearchInput): Promise<ToolResult> {
    const { query, allowed_domains, blocked_domains } = input;

    // 注意：实际的 web search 需要集成搜索 API
    // 这里提供一个模拟实现的框架

    try {
      // 可以集成 DuckDuckGo、Bing、Google 等 API
      // 这里返回一个提示消息
      return {
        success: true,
        output: `Web search for: "${query}"

Note: Web search requires API integration (e.g., DuckDuckGo, Bing, Google).
Please configure a search API to enable this feature.

Query parameters:
- Allowed domains: ${allowed_domains?.join(', ') || 'all'}
- Blocked domains: ${blocked_domains?.join(', ') || 'none'}`,
      };
    } catch (err) {
      return { success: false, error: `Search error: ${err}` };
    }
  }
}
