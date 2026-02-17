import React, { useState } from 'react';

const TOOL_ICONS = {
  show_map: '🗺️',
  show_traffic: '🚦',
  search_places: '📍',
  get_directions: '🧭',
  show_street_view: '🏙️',
  get_user_location: '📡',
  send_email: '✉️',
  search_documents: '📚'
};

function getToolIcon(name) {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  // MCP tools get a plug icon
  if (name.includes('__')) return '🔌';
  return '⚙️';
}

function getDisplayName(name) {
  // MCP tools: "serverName__toolName" → "toolName (serverName)"
  if (name.includes('__')) {
    const [server, tool] = name.split('__');
    return { tool: tool.replace(/_/g, ' '), server };
  }
  return { tool: name.replace(/_/g, ' '), server: null };
}

export default function ToolMenu({ tools, onToggle }) {
  const [open, setOpen] = useState(false);

  if (!tools || tools.length === 0) return null;

  const enabledCount = tools.filter(t => t.enabled).length;
  const builtinTools = tools.filter(t => t.source === 'builtin');
  const mcpTools = tools.filter(t => t.source === 'mcp');

  return (
    <div className="tool-menu">
      <button
        className={`tool-menu-toggle ${open ? 'active' : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        <span>Tools ({enabledCount}/{tools.length})</span>
        <svg className={`tool-menu-chevron ${open ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="tool-menu-dropdown">
          {builtinTools.length > 0 && (
            <div className="tool-menu-section">
              <div className="tool-menu-section-label">Built-in</div>
              {builtinTools.map(t => (
                <ToolItem key={t.name} tool={t} onToggle={onToggle} />
              ))}
            </div>
          )}

          {mcpTools.length > 0 && (
            <div className="tool-menu-section">
              <div className="tool-menu-section-label">MCP Servers</div>
              {mcpTools.map(t => (
                <ToolItem key={t.name} tool={t} onToggle={onToggle} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolItem({ tool, onToggle }) {
  const { tool: displayName, server } = getDisplayName(tool.name);
  const icon = getToolIcon(tool.name);

  return (
    <label className={`tool-item ${!tool.configured ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={tool.enabled}
        onChange={() => onToggle(tool.name)}
        disabled={!tool.configured}
      />
      <span className="tool-item-icon">{icon}</span>
      <span className="tool-item-info">
        <span className="tool-item-name">{displayName}</span>
        {server && <span className="tool-item-server">{server}</span>}
      </span>
      {!tool.configured && <span className="tool-item-badge">Not configured</span>}
    </label>
  );
}
