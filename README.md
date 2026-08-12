# BR Vibings — DataBiz Application

Full-stack business application. **Point of Sales (POS)** is the first implemented module; additional pages/modules will be added over time.

## Project structure

```
BR Vibings/
├── backend/PosApi/                    # Shared .NET Web API (all modules)
│   ├── Controllers/
│   │   ├── HealthController.cs        # App-wide health check
│   │   └── Modules/
│   │       └── Pos/                   # POS module endpoints
│   ├── Services/                      # Domain services (shared + module-specific)
│   └── Models/Dtos/
├── frontend/web/                      # Main React application (all modules)
│   └── src/
│       ├── app/                       # Shell: router, store, hooks
│       ├── pages/                     # Top-level pages (home, etc.)
│       ├── modules/
│       │   └── pos/                   # POS module (page, components, API slice)
│       └── shared/                    # Shared UI/utilities across modules
└── Example HTML Pages/                # Design references (unchanged)
```

## Architecture

| Layer | Role |
|-------|------|
| `frontend/web` | Single SPA hosting all modules via React Router |
| `frontend/web/src/modules/pos` | POS-only UI, state, and RTK Query APIs |
| `backend/PosApi` | Single API for all modules; routes grouped under `/api/pos`, etc. |
| Future modules | Add `src/modules/<name>/` + `Controllers/Modules/<Name>/` |

## Routes (frontend)

| Path | Module |
|------|--------|
| `/` | App home — module launcher |
| `/pos` | Point of Sales |

## Database

Connects to **`TESTBR24`** via `backend/PosApi/appsettings.json`.

## Run the backend

```bash
cd backend/PosApi
dotnet run
```

API: `http://localhost:5080/api`  
Swagger UI (Development): `http://localhost:5080/swagger`

### POS API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Database connectivity |
| GET | `/api/lookups/locations` | Warehouses / branches |
| GET | `/api/lookups/payment-modes` | Payment modes |
| GET | `/api/lookups/sales-persons` | Sales persons |
| GET | `/api/customers/search?q=` | Search customers |
| GET | `/api/customers/{id}` | Customer details |
| POST | `/api/customers` | Create customer |
| GET | `/api/products/search?q=` | Search products |
| GET | `/api/products/{id}` | Product detail |
| GET | `/api/products/tree` | Product category tree |
| GET | `/api/pos/next-invoice` | Next invoice number |
| POST | `/api/pos/save` | Save POS invoice |

## Run the frontend

```bash
cd frontend/web
npm install
npm run dev
```

- Home: `http://localhost:5173/`
- POS: `http://localhost:5173/pos`

Env: `frontend/web/.env` → `VITE_API_URL=http://localhost:5080/api`

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, React Router, Redux Toolkit, RTK Query
- **Backend:** ASP.NET Core 10 Web API, Dapper, Microsoft.Data.SqlClient

## Adding a new module later

1. **Frontend:** create `src/modules/<module>/` with pages, components, and optional RTK slice; register route in `src/app/routes.tsx`.
2. **Backend:** add `Controllers/Modules/<Module>/` and services under `Services/`.
3. **Store:** register module reducers/APIs in `src/app/store.ts`.
