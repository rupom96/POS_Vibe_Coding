# DataBiz Web Application

Main frontend for the DataBiz business application. POS is one module under `src/modules/pos`.

## Run

```bash
npm install
npm run dev
```

- **Home:** http://localhost:5173/
- **POS:** http://localhost:5173/pos

API URL: `.env` → `VITE_API_URL=http://localhost:5080/api`

## Structure

```
src/
  app/           # Router, Redux store, hooks
  pages/         # App-level pages (home)
  modules/pos/   # Point of Sales module
  shared/        # Shared components (Toast, etc.)
```

## Adding a module

1. Create `src/modules/<name>/`
2. Add route in `src/app/routes.tsx`
3. Register reducers/APIs in `src/app/store.ts` if needed
