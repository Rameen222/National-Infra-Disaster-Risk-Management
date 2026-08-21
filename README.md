# National Infrastructure Risk & Resilience Portal (NIRRP)

A full-stack interactive GIS portal for visualizing and analyzing infrastructure risk and resilience across Pakistan's provinces and districts.

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React 18 + Vite                   |
| Maps      | Mapbox GL JS v3                   |
| Backend   | Express.js 4 (geocoding proxy) + Flask / Python (data API) |
| Styling   | Pure CSS (dark theme)             |

## Features

- **Interactive Mapbox Map** centered on Pakistan with high/medium/low exposure heatmap layers
- **Administrative Navigation** — drill down from province → district with auto fly-to
- **Risk Legend** with collapsible panel showing High / Medium / Low exposure
- **Map Style Switcher** — Streets, Satellite, Dark, Light, Outdoors
- **Data API** — provinces, districts, infrastructure, and risk summaries served by the Flask backend under `/pyapi`
- **Geocoding proxy** — hardened Express server (CORS, Helmet, Morgan) proxying Google Places

## Project Structure

```
infra_portal/
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/
│       │   ├── Header/
│       │   ├── Sidebar/
│       │   ├── Map/
│       │   └── Legend/
│       └── config/mapConfig.js
├── server/          # Express geocoding proxy (only /api/geocode)
│   ├── routes/
│   │   └── geocode.js
│   └── index.js
└── pybackend/       # Flask backend — all map/risk/building data (/pyapi)
    └── app.py
```

## Getting Started

### 1. Install dependencies

```bash
# From root
npm run install:all
```

Or individually:
```bash
cd client && npm install
cd ../server && npm install
```

### 2. Start development servers

**Backend** (port 5000):
```bash
cd server && npm run dev
```

**Frontend** (port 3000):
```bash
cd client && npm run dev
```

### 3. Open in browser

```
http://localhost:3000
```

## API Endpoints

The Express server is a **geocoding proxy** — its only responsibility is
proxying Google Places with a server-side service-account credential. All
province / district / risk / building data is served by the Flask backend
under `/pyapi` (see `pybackend/app.py`).

| Method | Endpoint                          | Description                                   |
|--------|-----------------------------------|-----------------------------------------------|
| GET    | `/api/health`                     | Health check                                  |
| GET    | `/api/geocode/search?q=<query>`   | Place autocomplete (Google Places, PK-scoped) |
| GET    | `/api/geocode/details?place_id=<id>` | Place details (name, location, viewport)   |

## Testing

Each tier has its own test suite. CI (`.github/workflows/ci.yml`) runs all
three on every pull request to `main`.

| Tier      | Runner            | Run locally                                                    |
|-----------|-------------------|---------------------------------------------------------------|
| Client    | Vitest + RTL      | `cd client && npm install && npm test`                        |
| Server    | Jest + supertest  | `cd server && npm install && npm test`                        |
| Python    | pytest            | `cd pybackend && pip install -r requirements.txt -r requirements-dev.txt && pytest` |

- **Client** — jsdom environment; `npm run test:watch` for watch mode. Config lives in `client/vite.config.js` under `test`.
- **Server** — supertest drives the exported Express `app` in-process (no port is opened); `index.js` only calls `listen()` when run directly.
- **Python** — `pytest` discovers tests under `pybackend/tests/`. Importing `app.py` runs only module-level setup; the server start is guarded behind `__main__`.

> Linting in CI currently covers Python critical errors (syntax + undefined
> names) via `ruff`. Full ESLint/Prettier coverage of the JS tree is a planned
> follow-up.

## License

MIT
