# State and API Client

## Stores (`src/shared/stores/`)
- `authStore` — token, user, permissions, initialized flag.
- `prefsStore` — user prefs.
- `settingsStore` — panel settings.

## API client (`src/shared/api/`)
- Base axios client with auth token injection, CSRF handling.
- Admin client variants.

## Feature API files
Each feature has `api/` (e.g. `features/instances/api/`) wrapping base client with typed calls.
Errors surfaced to UI. Permission gating both client-side (RequirePermission) and server-side.

## Data fetching
Mostly direct calls in pages/components; some shared hooks (`src/shared/hooks/`). No heavy
data library (no react-query); manual state.

## CustomPageView / SDK
`src/shared/components/ui/CustomPageView.tsx` renders instance pages (iframe for html, host React
for markdown/blocks/react). `src/shared/lib/customPageSdk.ts` exposes `window.KSPageSDK`.
`src/shared/utils/instancePages.ts` — allow-check, content resolve, nav builder.
