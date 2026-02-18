import { GoogleGenerativeAI } from '@google/generative-ai';
import { tools, executeFunctionCall } from './functionCalling.js';
import { getMcpTools, isMcpTool, callMcpTool } from './mcpClient.js';
import { getDocuments, getSetting } from '../db/index.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_HISTORY_MESSAGES = 20;

function formatMapDataContext(mapData) {
  if (!mapData) return '';
  switch (mapData.type) {
    case 'places':
      return `[Map: Showing ${mapData.markers?.length || 0} places${mapData.markers?.[0]?.title ? ` including "${mapData.markers[0].title}"` : ''}]`;
    case 'directions':
      return `[Map: Directions from "${mapData.markers?.[0]?.title || 'A'}" to "${mapData.markers?.[1]?.title || 'B'}"]`;
    case 'traffic':
      return `[Map: Traffic conditions around ${mapData.center ? `${mapData.center.lat.toFixed(2)}, ${mapData.center.lng.toFixed(2)}` : 'area'}]`;
    case 'streetview':
      return `[Map: Street view]`;
    case 'map':
      return `[Map: Showing ${mapData.markers?.[0]?.title || 'location'}]`;
    case 'multi':
      return mapData.steps.map(s => formatMapDataContext(s.mapData)).join(' ');
    default:
      return '[Map displayed]';
  }
}

function buildSystemPrompt(userLocation, kbDocuments = []) {
  let prompt = `You are a helpful AI assistant with access to Google Maps.
When users ask about locations, traffic, places, or directions,
use the available functions to provide accurate, real-time information.
Always be helpful and provide context with your responses.

Available capabilities:
- Show maps centered on any location
- Display real-time traffic conditions
- Search for hotels, restaurants, attractions, gas stations with ratings
- Get directions between locations (driving, walking, transit, bicycling)
- Show street view panoramas
- Search the web for current information, news, facts, or general knowledge questions
- Get the user's approximate location based on their IP address
- Search through uploaded knowledge base documents for relevant information
- Generate HTML artifacts for charts, tables, dashboards, and visualizations

ARTIFACTS: When you have data to visualize (trends, time series, comparisons, distributions, tables), ALWAYS call generate_artifact to create a Chart.js visualization. This includes:
- Any numerical data that benefits from a chart or graph
- When the user asks for charts, graphs, tables, or visual reports
Use Chart.js from CDN https://cdn.jsdelivr.net/npm/chart.js with dark theme background #1a1a2e.

MCP DATA: When calling MCP tools that support a needChartData parameter (e.g. ask_agent), ALWAYS set needChartData: true whenever the user asks for data, lists, comparisons, trends, revenues, metrics, rankings, or any information that would benefit from tabular or chart display. The chart/grid data will be rendered automatically in the right panel — you do NOT need to call generate_artifact for MCP data.

IMPORTANT for ask_agent calls: When formulating the question parameter, be comprehensive and detailed. Include:
- The specific data the user wants (e.g., "all products with their sale prices")
- The level of detail needed (e.g., "include product ID, name, SKU, sale price")
- Any filtering or conditions (e.g., "for the current period")
- The desired format context (e.g., "suitable for grid display" or "detailed breakdown")
Example: Instead of "get sale prices", ask "What is the sale price for each product? Show all products with their product IDs, SKUs, and sale prices in detailed format."

⚠️ CRITICAL: After calling ask_agent with needChartData: true, DO NOT include markdown tables or formatted data in your text response. The structured grid/chart will be rendered in the right panel. Your response text should be a brief summary or explanation ONLY, e.g. "Here's the revenue analysis showing monthly trends" — NOT the actual data table.

IMPORTANT: After EVERY tool call (especially MCP tools like ask_agent), you MUST generate a non-empty text response summarizing the result for the user. Never return an empty response after tool calls. Provide a clear, concise summary of what was found or done.`;

  if (kbDocuments.length > 0) {
    prompt += `\n\nKNOWLEDGE BASE - The user has uploaded these documents:
${kbDocuments.map(d => `- ${d.original_name} (${d.chunk_count} sections)`).join('\n')}

IMPORTANT: When the user asks ANY factual question that could relate to these documents, you MUST call search_documents FIRST before answering. Do NOT rely on your training knowledge — search the documents and base your answer on what you find there. Always cite the document name when using knowledge base results.`;
  } else {
    prompt += `\n\nWhen the user asks a question that might be answered by their uploaded documents or knowledge base,
use the search_documents tool to find relevant information before answering.
Include the source document name when citing information from the knowledge base.`;
  }

  prompt += `

When showing places, include helpful details like ratings, price levels, and addresses.
When giving directions, mention estimated time and distance.
Be conversational and helpful in your responses.

IMPORTANT: For complex requests that require multiple steps, chain function calls as needed.
For example, if a user asks "find the nearest coffee shop and show me walking directions to it":
1. Call search_places to find coffee shops
2. Call get_directions to the top result
Keep calling tools until the user's complete request is answered.

IMPORTANT: Whenever a user asks for directions, routes, or how to get to a place, you MUST call get_directions.
NEVER just describe directions in text — always use the get_directions function so the route is displayed on the map.
This applies even if the destination came from a previous search_places result — use get_directions with the place name or address as the destination.

When the user says "near me", "nearby", "closest", or similar location-relative phrases,
use the get_user_location function first to determine their location, then proceed with the request.

CRITICAL: After EVERY function call, evaluate whether the user's ORIGINAL question has been fully answered.
If NOT, you MUST continue making function calls until it IS answered.
For example:
- If the user asks to "list agents and ask the product agent for data", after calling list_agents you should recognize that you still haven't answered the second part of the request
- After getting list_agents results, check if you have the agent info needed, then call ask_agent if the user asked you to query that agent
- Keep making calls until the complete user request is satisfied
Do NOT stop prematurely after a partial answer.

When the user asks for data to be shown in a grid, set needChartData: true in ask_agent so the structured grid data is returned for rendering.`;

  if (userLocation) {
    prompt += `\n\nThe user's approximate location is: ${userLocation.description} (lat: ${userLocation.lat}, lng: ${userLocation.lng}). You can use this as a default location when the user asks about things "near me" or "nearby" without calling get_user_location.`;
  }

  return prompt;
}

function buildHistory(conversationHistory) {
  const trimmedHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
  return trimmedHistory.map(msg => {
    let text = msg.content;
    if (msg.map_data) {
      const mapContext = formatMapDataContext(
        typeof msg.map_data === 'string' ? JSON.parse(msg.map_data) : msg.map_data
      );
      if (mapContext) {
        text += '\n' + mapContext;
      }
    }
    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    };
  });
}

function extractFunctionCalls(resp) {
  const calls = resp.functionCalls?.();
  if (calls && calls.length > 0) return calls;
  const parts = resp.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  const fcParts = parts.filter(p => p.functionCall);
  if (fcParts.length === 0) return null;
  return fcParts.map(p => ({
    name: p.functionCall.name,
    args: p.functionCall.args
  }));
}

function extractGroundingResults(resp) {
  const metadata = resp.candidates?.[0]?.groundingMetadata;
  if (!metadata?.groundingChunks) return null;
  const chunks = metadata.groundingChunks
    .filter(c => c.web)
    .map(c => ({
      title: c.web.title,
      link: c.web.uri,
      snippet: '',
      displayLink: c.web.title
    }));
  if (chunks.length > 0) {
    console.log(`[Grounding] Found ${chunks.length} web sources`);
    return chunks;
  }
  return null;
}

// Build a self-contained HTML artifact from MCP chart/grid data
function buildMcpDataArtifact(toolName, chartData) {
  const parts = toolName.split('__');
  const label = parts[parts.length - 1];

  console.log(`[Artifact] Building artifact for ${toolName}`);
  console.log(`[Artifact] chartData type: ${typeof chartData}, is array: ${Array.isArray(chartData)}, is object: ${chartData && typeof chartData === 'object'}`);
  if (chartData) {
    console.log(`[Artifact] chartData keys:`, Object.keys(chartData));
    console.log(`[Artifact] Full chartData:`, JSON.stringify(chartData).substring(0, 400));
  }

  // MicroStrategy format: { charts: [...], columnFormats: {...} }
  console.log(`[Artifact] Checking MicroStrategy format (charts is array):`, Array.isArray(chartData?.charts));
  if (Array.isArray(chartData?.charts) && chartData.charts.length > 0) {
    const firstChart = chartData.charts[0];
    const title = `${label} Analysis`;
    
    console.log(`[Artifact] Detected MicroStrategy format, chart type: ${firstChart.type}`);
    
    if (firstChart.type === 'grid') {
      // Return grid/table data for ag-grid rendering
      console.log(`[Artifact] Creating grid artifact with ${firstChart.data?.length || 0} rows`);
      return {
        title,
        type: 'grid',
        gridData: firstChart,
        columnFormats: chartData.columnFormats || {}
      };
    } else if (firstChart.type === 'chart' || firstChart.data) {
      // Return chart data for Chart.js rendering
      const chartType = firstChart.option?.chartType || 'line';
      console.log(`[Artifact] Creating chart artifact, type: ${chartType}`);
      return {
        title,
        type: 'chart',
        chartData: chartData.charts,
        chartType
      };
    }
  }

  // Chart.js config: has type + data.datasets
  console.log(`[Artifact] Checking Chart.js format (type + data.datasets):`, chartData?.type && Array.isArray(chartData?.data?.datasets));
  if (chartData?.type && Array.isArray(chartData?.data?.datasets)) {
    const title = chartData.options?.plugins?.title?.text || `${label} Chart`;
    console.log(`[Artifact] Detected Chart.js config format`);
    // Strip title from options so we render it in HTML instead
    const cfg = JSON.parse(JSON.stringify(chartData));
    if (cfg.options?.plugins?.title) delete cfg.options.plugins.title;
    if (!cfg.options) cfg.options = {};
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1a1a2e;color:#fff;font-family:system-ui,sans-serif;padding:20px;height:100vh;display:flex;flex-direction:column;gap:12px}h2{font-size:13px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:.05em}.chart-wrap{flex:1;position:relative}</style>
</head><body>
<h2>${title}</h2>
<div class="chart-wrap"><canvas id="c"></canvas></div>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
Chart.defaults.color='rgba(255,255,255,0.65)';
Chart.defaults.borderColor='rgba(255,255,255,0.08)';
const cfg=${JSON.stringify(cfg)};
if(!cfg.options.plugins)cfg.options.plugins={};
cfg.options.plugins.legend={labels:{color:'rgba(255,255,255,0.65)'}};
if(cfg.options.scales){Object.values(cfg.options.scales).forEach(s=>{s.ticks={color:'rgba(255,255,255,0.55)'};s.grid={color:'rgba(255,255,255,0.07)'};});}
new Chart(document.getElementById('c'),cfg);
</script></body></html>`;
    return { title, html, type: 'html' };
  }

  // Grid / table format: { headers/columns, rows/data }
  const headers = chartData?.headers || chartData?.columns?.map(c => c.header || c.label || c.key || c) || null;
  const rows = chartData?.rows || chartData?.data || null;
  console.log(`[Artifact] Checking generic table format: headers=${!!headers}, rows=${!!rows}`);
  if (headers) console.log(`[Artifact] Headers found (count=${Array.isArray(headers) ? headers.length : 'unknown'})`);
  if (rows) console.log(`[Artifact] Rows found (count=${Array.isArray(rows) ? rows.length : 'unknown'})`);

  if (headers || rows) {
    const title = `${label} Data`;
    console.log(`[Artifact] Detected generic table format with ${rows?.length || 0} rows`);
    const thead = headers ? `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>` : '';
    const tbody = Array.isArray(rows)
      ? rows.map(r => `<tr>${(Array.isArray(r) ? r : Object.values(r)).map(v => `<td>${v ?? ''}</td>`).join('')}</tr>`).join('')
      : '';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#1a1a2e;color:#fff;font-family:system-ui,sans-serif;padding:20px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8);padding:10px 12px;text-align:left;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.12)}td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.85)}tr:hover td{background:rgba(255,255,255,0.04)}</style>
</head><body><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></body></html>`;
    return { title, html, type: 'html' };
  }

  // Fallback: pretty-print JSON
  const title = `${label} Data`;
  console.log(`[Artifact] Using JSON fallback artifact`);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{background:#1a1a2e;color:#a8d8a8;font-family:monospace;padding:20px;font-size:12px;white-space:pre-wrap;overflow:auto}</style>
</head><body>${JSON.stringify(chartData, null, 2)}</body></html>`;
  return { title, html, type: 'html' };
}

// Human-readable step summary for a tool call
function describeStep(name, args, result) {
  const isMcp = name.includes('__');
  if (isMcp) {
    const parts = name.split('__');
    return `Called ${parts[1]} on ${parts[0]}`;
  }
  switch (name) {
    case 'show_map': return `Showing map of ${args.location}`;
    case 'show_traffic': return `Showing traffic around ${args.location}`;
    case 'search_places': return `Searching for "${args.query}"${args.location ? ` near ${args.location}` : ''}`;
    case 'get_directions': return `Getting directions from ${args.origin} to ${args.destination}`;
    case 'show_street_view': return `Showing street view of ${args.location}`;
    case 'get_user_location': return 'Getting your location';
    case 'send_email': return `Sending email to ${args.to}`;
    case 'search_documents': return `Searching knowledge base for "${args.query}"`;
    case 'generate_artifact': return `Generating artifact: ${args.title}`;
    case 'web_search': return 'Searching the web';
    default: return `Running ${name}`;
  }
}

// Detect if the response indicates the agent couldn't find a good answer
function isUnsatisfactoryResponse(text) {
  if (!text || text.trim().length < 60) return true;
  const lowConf = [
    "i don't know", "i couldn't find", "i'm unable to", "i am unable to",
    "no information", "i cannot", "i can't", "i'm not sure", "i am not sure",
    "unfortunately", "i don't have access", "i was unable"
  ];
  const lower = text.toLowerCase();
  return lowConf.some(p => lower.includes(p));
}

// Run one full ReAct loop; returns { response, totalSteps, successfulCalls }
async function runReActLoop(chatSession, initialMessage, maxSteps, onStep, allMapData, artifactDataRef, stepOffset = 0) {
  let result = await chatSession.sendMessage(initialMessage);
  let response = result.response;
  let functionCalls = extractFunctionCalls(response);
  let stepCount = 0;
  let successfulCalls = 0;

  while (functionCalls && functionCalls.length > 0 && stepCount < maxSteps) {
    stepCount++;
    const globalStep = stepOffset + stepCount;
    console.log(`[ReAct] Step ${globalStep}: executing ${functionCalls.map(c => c.name).join(', ')}`);

    const functionResponses = [];

    for (const call of functionCalls) {
      onStep?.({ type: 'tool_call', name: call.name, args: call.args, step: globalStep, label: describeStep(call.name, call.args, null) });

      const functionResult = isMcpTool(call.name)
        ? await callMcpTool(call.name, call.args)
        : await executeFunctionCall(call.name, call.args, null);

      console.log(`[ReAct] Function ${call.name} result:`, functionResult.error ? `ERROR: ${functionResult.error}` : 'SUCCESS');
      if (!functionResult.error) {
        successfulCalls++;
        console.log(`[ReAct] successfulCalls incremented to ${successfulCalls}`);
      }

      if (functionResult.mapData) {
        allMapData.push({ label: getLabelForFunction(call.name, call.args), mapData: functionResult.mapData });
      }
      if (functionResult.artifactData) {
        artifactDataRef.value = functionResult.artifactData;
      }
      // Auto-render chart/grid data returned by MCP tools (e.g. ask_agent with needChartData:true)
      console.log(`[ReAct] Tool ${call.name} returned mcpChartData:`, functionResult.mcpChartData ? 'YES' : 'NO', functionResult.mcpChartData ? `(${JSON.stringify(functionResult.mcpChartData).substring(0, 150)}...)` : '');
      if (functionResult.mcpChartData && !artifactDataRef.value) {
        console.log(`[ReAct] Building artifact from mcpChartData...`);
        const artifact = buildMcpDataArtifact(call.name, functionResult.mcpChartData);
        console.log(`[ReAct] Artifact built:`, artifact ? `type=${artifact.type}, title=${artifact.title}` : 'NULL');
        artifactDataRef.value = artifact;
        onStep?.({ type: 'artifact', artifactData: artifact });
      } else if (functionResult.mcpChartData && artifactDataRef.value) {
        console.log(`[ReAct] mcpChartData present but artifact already exists`);
      }
      // Stream generate_artifact results immediately so the panel opens without waiting for done
      if (functionResult.artifactData) {
        onStep?.({ type: 'artifact', artifactData: functionResult.artifactData });
      }

      const summary = functionResult.error
        ? `Error: ${functionResult.error}`
        : (functionResult.message || functionResult.result || describeStep(call.name, call.args, functionResult));

      onStep?.({ type: 'tool_result', name: call.name, step: globalStep, summary: String(summary).slice(0, 200) });

      // Strip internal-only fields (mcpChartData is for server rendering, not for Gemini)
      const { mcpChartData: _mcp, ...geminiResult } = functionResult;
      functionResponses.push({ functionResponse: { name: call.name, response: geminiResult } });
    }

    result = await chatSession.sendMessage(functionResponses);
    response = result.response;
    functionCalls = extractFunctionCalls(response);
  }

  if (stepCount >= maxSteps) {
    console.warn('[ReAct] Hit maximum step limit');
  }

  return { response, totalSteps: stepCount, successfulCalls };
}

export async function chat(messages, conversationHistory = [], userLocation = null, enabledTools = null, onStep = null) {
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const kbDocuments = getDocuments().filter(d => d.status === 'ready');
  const systemPrompt = buildSystemPrompt(userLocation, kbDocuments);
  const history = buildHistory(conversationHistory);
  const userMessage = messages[messages.length - 1].content;

  // Read configurable limits from DB
  const maxSteps = parseInt(getSetting('max_steps', '10'));
  const maxRetries = parseInt(getSetting('max_retries', '2'));

  // Merge built-in + MCP tools, then filter by enabledTools if provided
  let allTools = [...tools, ...getMcpTools()];
  if (Array.isArray(enabledTools)) {
    allTools = allTools.filter(t => enabledTools.includes(t.name));
  }

  const fcModel = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: allTools.length > 0 ? [{ functionDeclarations: allTools }] : undefined
  });

  const chatSession = fcModel.startChat({ history });

  const allMapData = [];
  const artifactDataRef = { value: null };
  let totalSteps = 0;

  // Initial ReAct loop
  const { response: initialResponse, totalSteps: steps1, successfulCalls: success1 } = await runReActLoop(
    chatSession, userMessage, maxSteps, onStep, allMapData, artifactDataRef, 0
  );
  totalSteps += steps1;
  let response = initialResponse;

  // Reflexion: only retry when NO tools succeeded (pure text response that's low-confidence).
  // If tools ran and returned data, trust the result — retrying causes confusion.
  let retriesLeft = maxRetries;
  while (retriesLeft > 0 && success1 === 0 && isUnsatisfactoryResponse(response.text())) {
    const attemptNum = maxRetries - retriesLeft + 1;
    console.log(`[Reflexion] Retry ${attemptNum}/${maxRetries} — no tools used, answer unsatisfactory`);
    onStep?.({ type: 'retry', attempt: attemptNum, reason: 'Searching for more information' });

    const retryMsg = `Please search more thoroughly using the available tools to find a complete answer to the user's original question.`;
    const { response: retryResponse, totalSteps: retrySteps } = await runReActLoop(
      chatSession, retryMsg, maxSteps, onStep, allMapData, artifactDataRef, totalSteps
    );
    totalSteps += retrySteps;
    response = retryResponse;
    retriesLeft--;
  }

  // If no function calls at all, try Google Search grounding
  const webSearchEnabled = !Array.isArray(enabledTools) || enabledTools.includes('web_search');
  let searchResults = null;
  if (totalSteps === 0 && webSearchEnabled) {
    try {
      console.log('[Grounding] No function calls — trying Google Search grounding');
      onStep?.({ type: 'web_search', step: 1, label: 'Searching the web for current information' });
      const groundedModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: 'You are a helpful assistant. Answer questions using information from Google Search.',
        tools: [{ googleSearch: {} }]
      });
      const groundedResult = await groundedModel.generateContent(userMessage);
      response = groundedResult.response;
      searchResults = extractGroundingResults(response);
      if (searchResults) {
        onStep?.({ type: 'tool_result', name: 'web_search', step: 1, summary: `Found ${searchResults.length} web sources` });
      }
    } catch (e) {
      console.error('[Grounding] Error:', e.message);
    }
  }

  // Build final mapData
  let mapData = null;
  if (allMapData.length === 1) {
    mapData = allMapData[0].mapData;
  } else if (allMapData.length > 1) {
    mapData = { type: 'multi', steps: allMapData };
  }

  let replyText = response.text() || '';

  // Fallback: if Gemini returned empty text but tools ran, request a summary
  if (!replyText && totalSteps > 0) {
    console.log('[Gemini] Empty reply after tool calls — requesting summary');
    try {
      const summaryResult = await chatSession.sendMessage(
        'Please provide a comprehensive answer to the user\'s question based on the information you just retrieved.'
      );
      replyText = summaryResult.response.text() || '';
    } catch (e) {
      console.error('[Gemini] Summary fallback error:', e.message);
    }
  }

  return {
    reply: replyText,
    mapData,
    searchResults,
    artifactData: artifactDataRef.value
  };
}

function getLabelForFunction(name, args) {
  switch (name) {
    case 'search_places': return `Search: ${args.query || 'Places'}`;
    case 'get_directions': return `Directions: ${args.origin || ''} → ${args.destination || ''}`;
    case 'show_map': return `Map: ${args.location || ''}`;
    case 'show_traffic': return `Traffic: ${args.location || ''}`;
    case 'show_street_view': return `Street View: ${args.location || ''}`;
    case 'get_user_location': return 'Your Location';
    default: return name;
  }
}

export async function generateTitle(firstMessage, firstResponse) {
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  });

  const prompt = `Generate a very short title (3-5 words max) for a conversation that starts with:
User: ${firstMessage}
Assistant: ${firstResponse}

Return only the title, nothing else.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
