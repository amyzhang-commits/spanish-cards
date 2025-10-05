# Spanish Cards - Deployment Guide

## Railway Deployment (Backend Sync Server)

### 1. Deploy to Railway

```bash
cd server
npm install
railway login
railway init
railway up
```

### 2. Get Your Railway URL

```bash
railway domain
```

You'll get a URL like: `https://spanish-cards-production.up.railway.app`

### 3. Configure Frontend

Open browser console on your app and run:

```javascript
localStorage.setItem('spanish_cards_sync_endpoint', 'https://YOUR-RAILWAY-URL.railway.app');
```

Or update `static/js/sync.js` line 22:
```javascript
: 'https://YOUR-RAILWAY-URL.railway.app';
```

### 4. Test Sync

1. Generate some cards on your laptop
2. Open browser DevTools → Console
3. Check for sync logs: "Sync completed: X cards uploaded"
4. Open app on phone (same WiFi or via deployed frontend)
5. Cards should appear!

## Frontend Deployment (Optional - Netlify/Vercel)

### Option A: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy static folder
cd static
netlify deploy --prod
```

### Option B: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy static folder
cd static
vercel --prod
```

### Option C: GitHub Pages

1. Push to GitHub
2. Go to Settings → Pages
3. Set source to `main` branch, `/static` folder
4. Access at `https://username.github.io/spanish-cards`

## How Sync Works

1. **Local Storage**: Each device stores cards in IndexedDB
2. **Upload**: When online, devices upload new cards to Railway
3. **Download**: Devices fetch cards created on other devices
4. **Offline**: Full functionality without internet
5. **Conflict Resolution**: Last-write-wins (simple but effective)

## Architecture

```
┌─────────────┐
│   Laptop    │
│  (Chrome)   │──┐
└─────────────┘  │
                 │     ┌──────────────┐
┌─────────────┐  ├────▶│   Railway    │
│   Phone     │  │     │ Sync Server  │
│  (Safari)   │──┘     │  (SQLite)    │
└─────────────┘        └──────────────┘
                              │
┌─────────────┐              │
│   Tablet    │──────────────┘
│  (Firefox)  │
└─────────────┘

Each device:
- Has own IndexedDB
- Syncs when online
- Works offline
```

## Cost

- **Railway**: Free tier (500 hours/month) - plenty for personal use
- **Netlify/Vercel**: Free tier - unlimited
- **Total**: $0/month! 🎉

## Monitoring

Check sync server health:
```bash
curl https://YOUR-RAILWAY-URL.railway.app/health
```

Check stats:
```bash
curl https://YOUR-RAILWAY-URL.railway.app/api/stats
```
