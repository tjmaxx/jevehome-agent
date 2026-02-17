import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import MapView from './MapView';
import PlaceCard from './PlaceCard';
import SearchResults from './SearchResults';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true
});

function renderContent(content, onLinkClick) {
  // Parse markdown
  let html = marked.parse(content);

  // Make links clickable with preview handler
  html = html.replace(
    /<a href="([^"]+)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" data-preview-link="$1"'
  );

  return (
    <div
      className="message-text"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const link = e.target.closest('a[data-preview-link]');
        if (link) {
          e.preventDefault();
          const url = link.getAttribute('data-preview-link');
          onLinkClick?.(url);
        }
      }}
    />
  );
}

export default function MessageList({ messages, loading, onLinkClick, mapsApiKey }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  if (messages.length === 0 && !loading) {
    return (
      <div className="empty-state">
        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <h2>Welcome to Gemini Maps Agent</h2>
        <p>Ask me about locations, directions, traffic, or find places like hotels and restaurants.</p>
        <div className="suggestions">
          <button className="suggestion-btn" onClick={() => onLinkClick?.('suggestion:Show me Washington DC')}>
            Show me Washington DC
          </button>
          <button className="suggestion-btn" onClick={() => onLinkClick?.('suggestion:Find hotels near Times Square')}>
            Find hotels near Times Square
          </button>
          <button className="suggestion-btn" onClick={() => onLinkClick?.('suggestion:Traffic around Los Angeles')}>
            Traffic around Los Angeles
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className={`message ${message.role}`}>
          <div className="message-avatar">
            {message.role === 'user' ? 'U' : 'G'}
          </div>
          <div className="message-content">
            {renderContent(message.content, onLinkClick)}

            {message.searchResults && (
              <SearchResults
                results={message.searchResults}
                onResultClick={(url) => onLinkClick?.(url)}
              />
            )}

            {message.mapData && message.mapData.type === 'multi' ? (
              message.mapData.steps.map((step, stepIdx) => (
                <div key={stepIdx} className="map-step">
                  {step.label && (
                    <div className="map-step-label">{step.label}</div>
                  )}
                  <div className="map-container">
                    <MapView
                      mapData={step.mapData}
                      apiKey={mapsApiKey}
                      onPlaceClick={(place) => onLinkClick?.(`place:${place.placeId}`)}
                    />
                  </div>
                  {step.mapData?.places && step.mapData.places.length > 0 && (
                    <div className="place-cards">
                      {step.mapData.places.slice(0, 6).map((place, idx) => (
                        <PlaceCard
                          key={place.placeId || idx}
                          place={place}
                          number={idx + 1}
                          onClick={() => onLinkClick?.(`place:${place.placeId}`)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : message.mapData ? (
              <>
                <div className="map-container">
                  <MapView
                    mapData={message.mapData}
                    apiKey={mapsApiKey}
                    onPlaceClick={(place) => onLinkClick?.(`place:${place.placeId}`)}
                  />
                </div>
                {message.mapData?.places && message.mapData.places.length > 0 && (
                  <div className="place-cards">
                    {message.mapData.places.slice(0, 6).map((place, idx) => (
                      <PlaceCard
                        key={place.placeId || idx}
                        place={place}
                        number={idx + 1}
                        onClick={() => onLinkClick?.(`place:${place.placeId}`)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      ))}

      {loading && (
        <div className="message assistant">
          <div className="message-avatar">G</div>
          <div className="message-content">
            <div className="loading">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              Thinking...
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
