/**
 * Chrome MCP 工具定义
 * 与官方 Claude Code 保持一致的 17 个工具
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * 所有 Chrome MCP 工具定义
 */
export const CHROME_MCP_TOOLS: McpTool[] = [
  {
    name: 'javascript_tool',
    description: `Execute JavaScript code in the context of the current page. The code runs in the page's context and can interact with the DOM, window object, and page variables. Returns the result of the last expression or any thrown errors. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: "Must be set to 'javascript_exec'"
        },
        text: {
          type: 'string',
          description: `The JavaScript code to execute. The code will be evaluated in the page context. The result of the last expression will be returned automatically. Do NOT use 'return' statements - just write the expression you want to evaluate (e.g., 'window.myData.value' not 'return window.myData.value'). You can access and modify the DOM, call page functions, and interact with page variables.`
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to execute the code in. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['action', 'text', 'tabId']
    }
  },
  {
    name: 'read_page',
    description: `Get an accessibility tree representation of elements on the page. By default returns all elements including non-visible ones. Output is limited to 50000 characters. If the output exceeds this limit, you will receive an error asking you to specify a smaller depth or focus on a specific element using ref_id. Optionally filter for only interactive elements. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['interactive', 'all'],
          description: 'Filter elements: "interactive" for buttons/links/inputs only, "all" for all elements including non-visible ones (default: all elements)'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to read from. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        },
        depth: {
          type: 'number',
          description: 'Maximum depth of the tree to traverse (default: 15). Use a smaller depth if output is too large.'
        },
        ref_id: {
          type: 'string',
          description: 'Reference ID of a parent element to read. Will return the specified element and all its children. Use this to focus on a specific part of the page when output is too large.'
        }
      },
      required: ['tabId']
    }
  },
  {
    name: 'find',
    description: `Find elements on the page using natural language. Can search for elements by their purpose (e.g., "search bar", "login button") or by text content (e.g., "organic mango product"). Returns up to 20 matching elements with references that can be used with other tools. If more than 20 matches exist, you'll be notified to use a more specific query. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of what to find (e.g., "search bar", "add to cart button", "product title containing organic")'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to search in. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['query', 'tabId']
    }
  },
  {
    name: 'form_input',
    description: `Fill in form fields on the page. Can fill text inputs, textareas, select dropdowns, checkboxes, and radio buttons. Use ref_id from read_page or find to target specific elements. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        ref_id: {
          type: 'string',
          description: 'Reference ID of the form element to fill'
        },
        value: {
          type: 'string',
          description: 'Value to fill in the form field'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID containing the form. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['ref_id', 'value', 'tabId']
    }
  },
  {
    name: 'computer',
    description: `Perform mouse and keyboard actions on the page. Supports clicking, typing, scrolling, and key combinations. Use ref_id from read_page or find to target specific elements for clicking. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['click', 'type', 'scroll', 'key', 'move', 'drag'],
          description: 'Action to perform'
        },
        ref_id: {
          type: 'string',
          description: 'Reference ID of element to interact with (for click, move, drag)'
        },
        text: {
          type: 'string',
          description: 'Text to type (for type action) or key combination (for key action, e.g., "Enter", "Ctrl+A")'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          description: 'Absolute [x, y] coordinate for click/move/drag actions'
        },
        direction: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right'],
          description: 'Scroll direction'
        },
        amount: {
          type: 'number',
          description: 'Scroll amount in pixels'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to perform action in. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['action', 'tabId']
    }
  },
  {
    name: 'navigate',
    description: `Navigate to a URL or perform browser navigation actions (back, forward, reload). If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to'
        },
        action: {
          type: 'string',
          enum: ['goto', 'back', 'forward', 'reload'],
          description: 'Navigation action (default: goto)'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to navigate. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['tabId']
    }
  },
  {
    name: 'resize_window',
    description: `Resize the browser window to specific dimensions. Useful for testing responsive designs or capturing screenshots at specific sizes. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          description: 'Window width in pixels'
        },
        height: {
          type: 'number',
          description: 'Window height in pixels'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to resize. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['width', 'height', 'tabId']
    }
  },
  {
    name: 'gif_creator',
    description: `Manage GIF recording and export for browser automation sessions. Control when to start/stop recording browser actions (clicks, scrolls, navigation), then export as an animated GIF file.`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop', 'capture', 'export', 'status'],
          description: 'GIF recording action'
        },
        filename: {
          type: 'string',
          description: 'Filename for the exported GIF (for export action)'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to record. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'upload_image',
    description: `Upload an image to a file input element on the page. Can upload from a local file path or base64-encoded image data. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        ref_id: {
          type: 'string',
          description: 'Reference ID of the file input element'
        },
        image_data: {
          type: 'string',
          description: 'Base64-encoded image data'
        },
        file_path: {
          type: 'string',
          description: 'Local file path to upload'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID containing the file input. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['ref_id', 'tabId']
    }
  },
  {
    name: 'get_page_text',
    description: `Get the text content of the current page. Returns all visible text on the page, which can be useful for understanding page content without the full accessibility tree. If you don't have a valid tab ID, use tabs_context_mcp first to get available tabs.`,
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID to get text from. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['tabId']
    }
  },
  {
    name: 'tabs_context_mcp',
    description: `Get information about currently open browser tabs. Returns tab IDs, URLs, and titles for tabs in the current tab group. IMPORTANT: Call this first at the start of any browser automation session to understand what tabs are available. Each conversation should create its own new tab (using tabs_create_mcp) rather than reusing existing tabs, unless the user explicitly asks to use an existing tab.`,
    inputSchema: {
      type: 'object',
      properties: {
        createIfEmpty: {
          type: 'boolean',
          description: 'Creates a new tab if no tabs exist. If true and tabs exist, this parameter has no effect.'
        }
      },
      required: []
    }
  },
  {
    name: 'tabs_create_mcp',
    description: `Creates a new empty tab in the MCP tab group. CRITICAL: You must get the context using tabs_context_mcp at least once before using other browser automation tools. Use this to create a fresh tab for your automation session.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Optional URL to navigate to after creating the tab'
        }
      },
      required: []
    }
  },
  {
    name: 'update_plan',
    description: `Update the current automation plan displayed to the user. Use this to keep the user informed about what steps you're taking and what's coming next.`,
    inputSchema: {
      type: 'object',
      properties: {
        plan: {
          type: 'string',
          description: 'The updated plan text to display'
        }
      },
      required: ['plan']
    }
  },
  {
    name: 'read_console_messages',
    description: `Read console messages from the browser developer tools. Returns console.log, console.warn, console.error, and other console output. Useful for debugging JavaScript code or monitoring page behavior. Use the pattern parameter to filter results efficiently.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to filter console messages. Only messages matching this pattern will be returned.'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to read console from. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 100)'
        }
      },
      required: ['tabId']
    }
  },
  {
    name: 'read_network_requests',
    description: `Read network requests made by the page. Returns information about XHR, fetch, and other network requests including URLs, methods, status codes, and timing. Useful for debugging API calls or monitoring network activity.`,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to filter network requests by URL'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to read network requests from. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of requests to return (default: 100)'
        }
      },
      required: ['tabId']
    }
  },
  {
    name: 'shortcuts_list',
    description: `List available keyboard shortcuts defined for the current page or web application.`,
    inputSchema: {
      type: 'object',
      properties: {
        tabId: {
          type: 'number',
          description: 'Tab ID to list shortcuts from. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['tabId']
    }
  },
  {
    name: 'shortcuts_execute',
    description: `Execute a keyboard shortcut on the page. Use shortcuts_list first to see available shortcuts.`,
    inputSchema: {
      type: 'object',
      properties: {
        shortcut: {
          type: 'string',
          description: 'Keyboard shortcut to execute (e.g., "Ctrl+S", "Cmd+Shift+P")'
        },
        tabId: {
          type: 'number',
          description: 'Tab ID to execute shortcut in. Must be a tab in the current group. Use tabs_context_mcp first if you don\'t have a valid tab ID.'
        }
      },
      required: ['shortcut', 'tabId']
    }
  }
];

/**
 * 获取工具名称列表（带 MCP 前缀）
 */
export function getToolNamesWithPrefix(): string[] {
  return CHROME_MCP_TOOLS.map(tool => `mcp__claude-in-chrome__${tool.name}`);
}
