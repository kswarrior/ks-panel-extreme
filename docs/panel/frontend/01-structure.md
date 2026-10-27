# Frontend Structure

Root: `panel/frontend/`. React 18 + TS + Vite. Entry: `src/main.tsx` → `src/app/App.tsx` → `src/app/router.tsx`.

```
src/
├── app/                # App shell + router (all routes defined here)
├── features/           # one folder per domain
│   └── <domain>/{pages,components,api,types,hooks}
├── shared/
│   ├── api/            # base API client + admin client
│   ├── components/{ui,layout,forms,brand}
│   ├── hooks/          # shared hooks
│   ├── lib/            # customPageSdk (KSPageSDK), React-page transpiler
│   ├── stores/         # auth, prefs, settings
│   ├── types/          # shared TS types, permissions
│   └── utils/          # instance page resolution (isPageAllowed, getPageContent, nav)
├── theme/              # theme defaults + studio controls
└── index.css           # global styles
```

## Conventions
- Shared UI → `src/shared/components/ui/`; page chrome → `src/shared/components/layout/`.
- Domain screen → `src/features/<domain>/pages/`; widget → same feature `components/`.
- API call → `src/features/<domain>/api/` or `src/shared/api/`.
- Styling: Tailwind + theme tokens `var(--ks-*)`.
- Lazy-loaded pages (code splitting).
- Path alias `@` → `src`.
