// Instance Page types for the admin Instance Pages page.
//
// Single source of truth lives in
// `@/features/instance-pages/types/instancePage.ts` — this module re-exports
// it so legacy import paths (`@/shared/types/instancePage`) keep resolving.
// Do NOT add divergent fields here; extend the canonical module instead.
export type {
  InstancePageKind,
  PageActionDef,
  InstancePage,
  InstancePageSubPage,
  CreateInstancePagePayload,
  UpdateInstancePagePayload,
} from '@/features/instance-pages/types/instancePage';
export { parseSubPages, parsePageComponents } from '@/features/instance-pages/types/instancePage';
