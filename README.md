# Gemini Maps Agent

An AI-powered web application with a chat interface powered by Google Gemini LLM and Google Maps integration.

## Features

- Chat interface with Google Gemini AI
- Google Maps integration with:
  - Location display
  - Traffic information
  - Place search (hotels, restaurants, attractions)
  - Directions with route visualization
  - Street View
- Conversation history persistence with SQLite
- Link preview panel
- Responsive dark theme UI

## Prerequisites

- Node.js 18+
- Google Cloud API Key with:
  - Gemini API enabled
  - Maps JavaScript API enabled
  - Places API enabled
  - Directions API enabled
  - Geocoding API enabled

## Setup

1. Clone the repository and navigate to the project:
```bash
cd gemini-maps-agent
```

2. Copy the environment example and configure your API keys:
```bash
cp .env.example .env
```

Edit `.env` with your API keys:
```
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_MAPS_API_KEY=your_maps_api_key
PORT=3001
DATABASE_PATH=./data/agent.db
```

3. Install server dependencies:
```bash
cd server
npm install
```

4. Install client dependencies:
```bash
cd ../client
npm install
```

5. Create a `.env` file in the client directory for the Maps API key:
```bash
echo "VITE_GOOGLE_MAPS_API_KEY=your_maps_api_key" > .env
```

## Running the Application

1. Start the server (from the server directory):
```bash
npm run dev
```

2. In a separate terminal, start the client (from the client directory):
```bash
npm run dev
```

3. Open http://localhost:5173 in your browser

## Usage Examples

Try these queries:
- "Show me Washington DC"
- "Find 4-star hotels near Times Square"
- "Show traffic around Los Angeles"
- "Directions from San Francisco to Los Angeles"
- "Show street view of the Eiffel Tower"

## Project Structure

```
gemini-maps-agent/
├── client/                    # React frontend (Vite)
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── services/          # API services
│   │   └── App.jsx            # Main application
│   └── package.json
├── server/                    # Node.js/Express backend
│   ├── routes/                # API routes
│   ├── services/              # Business logic
│   ├── db/                    # Database setup
│   └── package.json
├── .env.example               # Environment template
└── README.md
```

## API Endpoints

- `POST /api/chat` - Send a message and get AI response
- `GET /api/conversations` - List all conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id` - Get conversation with messages
- `DELETE /api/conversations/:id` - Delete a conversation
- `GET /api/maps/geocode` - Geocode an address
- `GET /api/maps/places` - Search for places
- `GET /api/maps/places/:id` - Get place details
- `GET /api/maps/directions` - Get directions

## Tech Stack

- **Frontend**: React, Vite, @react-google-maps/api, marked
- **Backend**: Node.js, Express, @google/generative-ai, better-sqlite3
- **Database**: SQLite
- **APIs**: Google Gemini, Google Maps Platform
