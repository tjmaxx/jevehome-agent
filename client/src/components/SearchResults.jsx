import React from 'react';

export default function SearchResults({ results, onResultClick }) {
  if (!results || !Array.isArray(results) || results.length === 0) return null;

  return (
    <div className="search-results">
      <div className="search-results-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        {results.length} source{results.length !== 1 ? 's' : ''} found
      </div>
      <div className="search-results-cards">
        {results.map((result, idx) => (
          <div
            key={idx}
            className="search-result-card"
            onClick={() => onResultClick?.(result.link)}
          >
            <div className="search-result-card-top">
              <img
                className="search-result-favicon"
                src={`https://www.google.com/s2/favicons?domain=${result.displayLink}&sz=32`}
                alt=""
                width="16"
                height="16"
              />
              <span className="search-result-domain">{result.displayLink}</span>
            </div>
            <div className="search-result-title">{result.title}</div>
            <div className="search-result-snippet">{result.snippet}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
