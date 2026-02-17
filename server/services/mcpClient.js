import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'mcp-servers.json');

// serverName → { client, transport, tools[] }
const clients = new Map();
// toolName (namespaced) → serverName
const toolRegistry = new Map();

export async function initializeMcpClients() {
  let config;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[MCP] No mcp-servers.json found — skipping MCP client initialization');
      return;
    }
    console.error('[MCP] Error reading mcp-servers.json:', err.message);
    return;
  }

  const servers = config.mcpServers || {};
  if (Object.keys(servers).length === 0) {
    console.log('[MCP] No MCP servers configured');
    return;
  }

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    try {
      let transport;
      if (serverConfig.url) {
        // HTTP-based MCP server
        const headers = serverConfig.headers || {};
        transport = new StreamableHTTPClientTransport(
          new URL(serverConfig.url),
          { requestInit: { headers } }
        );
      } else if (serverConfig.command) {
        // Stdio-based MCP server
        transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args || [],
          env: { ...process.env, ...(serverConfig.env || {}) }
        });
      } else {
        console.warn(`[MCP] "${serverName}": no "url" or "command" specified — skipping`);
        continue;
      }

      const client = new Client({
        name: 'gemini-maps-agent',
        version: '1.0.0'
      });

      await client.connect(transport);

      const { tools: mcpTools } = await client.listTools();
      const toolList = mcpTools || [];

      clients.set(serverName, { client, transport, tools: toolList });

      for (const tool of toolList) {
        const namespacedName = `${serverName}__${tool.name}`;
        toolRegistry.set(namespacedName, serverName);
      }

      console.log(`[MCP] Connected to "${serverName}": ${toolList.length} tools`);
    } catch (err) {
      console.error(`[MCP] Failed to connect to "${serverName}":`, err.message);
    }
  }
}

export function getMcpTools() {
  const geminiTools = [];

  for (const [serverName, { tools: mcpTools }] of clients) {
    for (const tool of mcpTools) {
      const namespacedName = `${serverName}__${tool.name}`;
      geminiTools.push({
        name: namespacedName,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} }
      });
    }
  }

  return geminiTools;
}

export function isMcpTool(name) {
  return toolRegistry.has(name);
}

export async function callMcpTool(name, args) {
  const serverName = toolRegistry.get(name);
  if (!serverName) {
    return { error: `Unknown MCP tool: ${name}` };
  }

  const entry = clients.get(serverName);
  if (!entry) {
    return { error: `MCP server "${serverName}" not connected` };
  }

  // Strip the serverName__ prefix to get original tool name
  const originalName = name.slice(serverName.length + 2);

  try {
    const result = await entry.client.callTool({ name: originalName, arguments: args });

    if (result.isError) {
      const errorText = result.content
        ?.filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n') || 'Unknown MCP tool error';
      return { error: errorText };
    }

    const text = result.content
      ?.filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n') || '';

    return { success: true, result: text };
  } catch (err) {
    console.error(`[MCP] Error calling ${name}:`, err.message);
    return { error: `MCP tool error: ${err.message}` };
  }
}

export async function shutdownMcpClients() {
  for (const [serverName, { client }] of clients) {
    try {
      await client.close();
      console.log(`[MCP] Disconnected from "${serverName}"`);
    } catch (err) {
      console.error(`[MCP] Error disconnecting "${serverName}":`, err.message);
    }
  }
  clients.clear();
  toolRegistry.clear();
}
