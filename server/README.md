# Spanish Cards Sync Server

Simple Express.js sync server for cross-device card synchronization.

## Local Development

```bash
npm install
npm run dev
```

Server runs on http://localhost:8000

## Railway Deployment

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Deploy: `railway up`
5. Get URL: `railway domain`

## API Endpoints

- `POST /api/cards` - Upload cards from device
- `GET /api/cards/:device_id?since=timestamp` - Download new cards
- `GET /api/stats` - Get sync statistics
- `GET /health` - Health check

## Environment Variables

No environment variables required! Uses SQLite for simplicity.

## How Sync Works

1. Each device has a unique `device_id`
2. Cards are uploaded with timestamps
3. Devices download only cards newer than their last sync
4. Cards from the same device are never downloaded back
5. Simple conflict resolution: last-write-wins
