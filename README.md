
# Multilingual Alt-Text Generator (Railway-ready)

One-service setup: Express serves both the API and the React build. Upload images (≤5 MB each), get English alt text using OpenAI Vision, translate to 7 locales, and export CSV.

## Quick start (local)

```bash
# 1) Install server deps at repo root
npm install

# 2) Create the frontend and install deps
cd client
npm install
cd ..

# 3) Build the frontend (postinstall also does this on deploy)
npm run build

# 4) Set your OpenAI key and run
export OPENAI_API_KEY=sk-your-key
node server.js

# Open http://localhost:3000
```

## Deploy to Railway

1. Push this repo to GitHub.2. In Railway: **New Project → Deploy from GitHub** and choose this repo.3. Add a variable in Railway **Variables**: `OPENAI_API_KEY = sk-your-key`.4. Railway builds the client (via `postinstall`) and starts the server (`npm start`).5. Open the service's public URL → upload images and go!

## Notes

- Server listens on `process.env.PORT`.- Multer caps images at 5 MB per file.- Frontend calls same-origin `/api/describe` and `/api/translate` → no CORS.- CSV export includes BOM for Excel compatibility.
