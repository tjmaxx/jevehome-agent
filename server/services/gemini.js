import { GoogleGenerativeAI } from '@google/generative-ai';
import { tools, executeFunctionCall } from './functionCalling.js';
import { getMcpTools, isMcpTool, callMcpTool } from './mcpClient.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_HISTORY_MESSAGES = 20;
const MAX_STEPS = 10;

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

function buildSystemPrompt(userLocation) {
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

When the user asks a question that might be answered by their uploaded documents or knowledge base,
use the search_documents tool to find relevant information before answering.
Include the source document name when citing information from the knowledge base.

When showing places, include helpful details like ratings, price levels, and addresses.
When giving directions, mention estimated time and distance.
Be conversational and helpful in your responses.

IMPORTANT: For complex requests that require multiple steps, you MUST chain function calls.
For example, if a user asks "find the nearest coffee shop and show me walking directions to it":
1. First call search_places to find coffee shops
2. Then call get_directions from the user's location to the top result
Do NOT try to answer multi-step requests in a single function call.

IMPORTANT: Whenever a user asks for directions, routes, or how to get to a place, you MUST call get_directions.
NEVER just describe directions in text — always use the get_directions function so the route is displayed on the map.
This applies even if the destination came from a previous search_places result — use get_directions with the place name or address as the destination.

When the user says "near me", "nearby", "closest", or similar location-relative phrases,
use the get_user_location function first to determine their location, then proceed with the request.`;

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

export async function chat(messages, conversationHistory = [], userLocation = null, enabledTools = null) {
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const systemPrompt = buildSystemPrompt(userLocation);
  const history = buildHistory(conversationHistory);
  const userMessage = messages[messages.length - 1].content;

  // Merge built-in + MCP tools, then filter by enabledTools if provided
  let allTools = [...tools, ...getMcpTools()];
  if (Array.isArray(enabledTools)) {
    allTools = allTools.filter(t => enabledTools.includes(t.name));
  }

  // Pass 1: Function-calling model (maps tools)
  const fcModel = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: allTools.length > 0 ? [{ functionDeclarations: allTools }] : undefined
  });

  const chatSession = fcModel.startChat({ history });
  let result = await chatSession.sendMessage(userMessage);
  let response = result.response;

  const allMapData = [];
  let functionCalls = extractFunctionCalls(response);
  let stepCount = 0;

  while (functionCalls && functionCalls.length > 0 && stepCount < MAX_STEPS) {
    stepCount++;
    console.log(`[ReAct] Step ${stepCount}: executing ${functionCalls.map(c => c.name).join(', ')}`);

    const functionResponses = [];

    for (const call of functionCalls) {
      const functionResult = isMcpTool(call.name)
        ? await callMcpTool(call.name, call.args)
        : await executeFunctionCall(call.name, call.args, userLocation);

      if (functionResult.mapData) {
        allMapData.push({
          label: getLabelForFunction(call.name, call.args),
          mapData: functionResult.mapData
        });
      }

      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: functionResult
        }
      });
    }

    result = await chatSession.sendMessage(functionResponses);
    response = result.response;
    functionCalls = extractFunctionCalls(response);
  }

  if (stepCount >= MAX_STEPS) {
    console.warn('[ReAct] Hit maximum step limit');
  }

  // If no function calls were made, try grounding with Google Search
  let searchResults = null;
  if (stepCount === 0) {
    try {
      console.log('[Grounding] No function calls — trying Google Search grounding');
      const groundedModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: 'You are a helpful assistant. Answer questions using information from Google Search.',
        tools: [{ googleSearch: {} }]
      });
      const groundedResult = await groundedModel.generateContent(userMessage);
      response = groundedResult.response;
      searchResults = extractGroundingResults(response);
      console.log('[Grounding] Reply:', response.text()?.substring(0, 80));
      console.log('[Grounding] Sources:', searchResults?.length || 0);
    } catch (e) {
      console.error('[Grounding] Error:', e.message, e.stack);
      // Fall back to the original non-grounded response
    }
  }

  // Build final mapData
  let mapData = null;
  if (allMapData.length === 1) {
    mapData = allMapData[0].mapData;
  } else if (allMapData.length > 1) {
    mapData = { type: 'multi', steps: allMapData };
  }

  return {
    reply: response.text(),
    mapData,
    searchResults
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
