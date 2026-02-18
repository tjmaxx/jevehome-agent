import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getMcpServers } from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '..', 'mcp-servers.json');

// serverName → { client, transport, tools[] }
const clients = new Map();
// sanitizedGeminiName → { serverName, originalName }
const toolRegistry = new Map();

// Gemini tool names: must start with letter/underscore, only [a-zA-Z0-9_.:-], max 64 chars
function sanitizeToolName(name) {
  let s = name.replace(/[^a-zA-Z0-9_.:\-]/g, '_');
  if (!/^[a-zA-Z_]/.test(s)) s = '_' + s;
  return s.slice(0, 64);
}

export async function initializeMcpClients() {
  let servers = {};
  
  // First try to load from JSON file for backward compatibility
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    servers = config.mcpServers || {};
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[MCP] Error reading mcp-servers.json:', err.message);
    }
  }
  
  // If no servers in JSON, try loading from database
  if (Object.keys(servers).length === 0) {
    try {
      const dbServers = getMcpServers();
      if (dbServers && dbServers.length > 0) {
        console.log(`[MCP] Loading ${dbServers.length} server(s) from database`);
        for (const dbServer of dbServers) {
          servers[dbServer.name] = {
            url: dbServer.url,
            headers: dbServer.access_token ? { 'Authorization': `Bearer ${dbServer.access_token}` } : {}
          };
        }
      }
    } catch (err) {
      console.error('[MCP] Error loading servers from database:', err.message);
    }
  }
  
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
        const sanitized = sanitizeToolName(`${serverName}__${tool.name}`);
        toolRegistry.set(sanitized, { serverName, originalName: tool.name });
      }

      console.log(`[MCP] Connected to "${serverName}": ${toolList.length} tools`);
    } catch (err) {
      console.error(`[MCP] Failed to connect to "${serverName}":`, err.message);
    }
  }
}

// Gemini function declarations only support a restricted JSON Schema subset.
// Strip unsupported fields recursively before passing inputSchema to Gemini.
const GEMINI_ALLOWED_FIELDS = new Set([
  'type', 'description', 'properties', 'items', 'enum', 'required',
  'nullable', 'format', 'minimum', 'maximum', 'minLength', 'maxLength',
  'minItems', 'maxItems', 'pattern'
]);

function sanitizeForGemini(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;

  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!GEMINI_ALLOWED_FIELDS.has(k)) continue;
    if (k === 'properties' && v && typeof v === 'object') {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) {
        out.properties[pk] = sanitizeForGemini(pv);
      }
    } else if (k === 'items') {
      out.items = sanitizeForGemini(v);
    } else {
      out[k] = v;
    }
  }
  // Gemini requires type to be present
  if (!out.type) out.type = 'object';
  return out;
}

export function getMcpTools() {
  const geminiTools = [];

  for (const [serverName, { tools: mcpTools }] of clients) {
    for (const tool of mcpTools) {
      const sanitized = sanitizeToolName(`${serverName}__${tool.name}`);
      geminiTools.push({
        name: sanitized,
        description: tool.description || '',
        parameters: sanitizeForGemini(tool.inputSchema || { type: 'object', properties: {} })
      });
    }
  }

  return geminiTools;
}

export function isMcpTool(name) {
  return toolRegistry.has(name);
}

export async function callMcpTool(name, args) {
  const reg = toolRegistry.get(name);
  if (!reg) {
    return { error: `Unknown MCP tool: ${name}` };
  }

  const { serverName, originalName } = reg;
  const entry = clients.get(serverName);
  if (!entry) {
    return { error: `MCP server "${serverName}" not connected` };
  }

  try {
    const result = await entry.client.callTool({ name: originalName, arguments: args }, undefined, { timeout: 120000 });

    if (result.isError) {
      const errorText = result.content
        ?.filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n') || 'Unknown MCP tool error';
      return { error: errorText };
    }

    // Log content structure for debugging
    if (result.content) {
      console.log(`[MCP] Tool ${originalName} content blocks:`, result.content.map(c => ({ type: c.type, keys: Object.keys(c) })));
    }

    const text = result.content
      ?.filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n') || '';

    console.log(`[MCP] Tool ${originalName} response (first 300 chars):`, text.substring(0, 300));
    console.log(`[MCP] Tool ${originalName} response length:`, text.length);

    // Parse structured MCP responses (e.g. ask_agent returns { answers: [{ text, chartData }] })
    let mcpChartData = null;
    let resultText = text;
    try {
      const parsed = JSON.parse(text);
      console.log(`[MCP] Tool ${originalName} parsed JSON keys:`, Object.keys(parsed));
      if (parsed?.answers?.[0]) {
        console.log(`[MCP] Tool ${originalName} found answers[0]`);
        // Use the human-readable answer text so Gemini can summarize it
        if (parsed.answers[0].text) {
          resultText = parsed.answers[0].text;
        }
        if (parsed.answers[0].chartData) {
          console.log(`[MCP] Tool ${originalName} found chartData in answers[0]`);
          mcpChartData = parsed.answers[0].chartData;
        }
      } else {
        console.log(`[MCP] Tool ${originalName} no answers[0]. Raw parsed:`, Object.keys(parsed));
      }
    } catch (e) {
      console.log(`[MCP] Tool ${originalName} response is not JSON: ${e.message}`);
      // Text response - try to extract embedded JSON or data
      if (originalName === 'ask_agent' && args.needChartData) {
        console.log(`[MCP] ask_agent returned text with needChartData - trying to extract data...`);
        // Look for JSON objects in markdown code blocks
        const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
        if (jsonBlockMatch && jsonBlockMatch[1]) {
          try {
            const blockData = JSON.parse(jsonBlockMatch[1]);
            if (blockData.charts || blockData.data || blockData.rows || blockData.headers) {
              console.log(`[MCP] ask_agent: Found data in JSON code block`);
              mcpChartData = blockData;
            }
          } catch {}
        }
        // Look for HTML table
        const tableMatch = text.match(/<table[\s\S]*?<\/table>/);
        if (tableMatch && !mcpChartData) {
          console.log(`[MCP] ask_agent: Found HTML table in response`);
          mcpChartData = { html: tableMatch[0], type: 'table' };
        }
      }
    }

    console.log(`[MCP] Tool ${originalName} final mcpChartData:`, mcpChartData ? 'YES' : 'NO');
    return { success: true, result: resultText, mcpChartData };
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

// Dynamic connect — called from admin routes after OAuth or direct config save
export async function connectMcpServer(serverRecord) {
  const { name, url, access_token } = serverRecord;

  // Disconnect any existing connection with this name
  await disconnectMcpServer(name);

  const headers = {};
  if (access_token) {
    headers['Authorization'] = `Bearer ${access_token}`;
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    { requestInit: { headers } }
  );

  const client = new Client({ name: 'gemini-maps-agent', version: '1.0.0' });
  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();
  const toolList = mcpTools || [];

  clients.set(name, { client, transport, tools: toolList });

  for (const tool of toolList) {
    const sanitized = sanitizeToolName(`${name}__${tool.name}`);
    toolRegistry.set(sanitized, { serverName: name, originalName: tool.name });
  }

  console.log(`[MCP] Connected to "${name}": ${toolList.length} tools`);
}

export async function disconnectMcpServer(serverName) {
  const entry = clients.get(serverName);
  if (!entry) return;
  try {
    await entry.client.close();
    console.log(`[MCP] Disconnected from "${serverName}"`);
  } catch (err) {
    console.error(`[MCP] Error disconnecting "${serverName}":`, err.message);
  }
  // Remove all tools registered for this server
  for (const [toolName, { serverName: sName }] of toolRegistry) {
    if (sName === serverName) toolRegistry.delete(toolName);
  }
  clients.delete(serverName);
}

export function getMcpServerStatus(serverName) {
  return clients.has(serverName) ? 'connected' : 'disconnected';
}
