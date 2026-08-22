import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import Layout from '@/shared/components/layout/Layout';
import RouteThemeSync from '@/shared/components/layout/RouteThemeSync';
import Login from '@/features/auth/pages/Login';
import Register from '@/features/auth/pages/Register';
import VerifyEmail from '@/features/auth/pages/VerifyEmail';
import InstanceList from '@/features/instances/pages/InstancesRouter';
import Account from '@/features/account/pages/Account';
import UsersPage from '@/features/users/pages/Users';
import UserForm from '@/features/users/pages/UserForm';
import UserDetail from '@/features/users/pages/UserDetail';
import UserStats from '@/features/users/pages/UserStats';
import RolesPage from '@/features/roles/pages/Roles';
import RoleForm from '@/features/roles/pages/RoleForm';
import RoleStats from '@/features/roles/pages/RoleStats';
import ApiKeyForm from '@/features/api-keys/pages/ApiKeyForm';
import ApiKeyDetail from '@/features/api-keys/pages/ApiKeyDetail';
import ApiKeyStats from '@/features/api-keys/pages/ApiKeyStats';
import NodeForm from '@/features/nodes/pages/NodeForm';
import NodeDetail from '@/features/nodes/pages/NodeDetail';
import InstanceForm from '@/features/instances/pages/InstanceForm';
import AdvanceOptionPage from '@/features/instances/pages/AdvanceOptionPage';
import DeployFormShell from '@/features/instances/stores/DeployFormShell';
import InstanceStats from '@/features/instances/pages/InstanceStats';
import TemplateForm from '@/features/templates/pages/TemplateForm';
import TemplateStats from '@/features/templates/pages/TemplateStats';
import TemplateDetail from '@/features/templates/pages/TemplateDetail';
import NodeStats from '@/features/nodes/pages/NodeStats';
import AdminSettings from '@/features/settings/pages/Settings';

import AdminApiKeys from '@/features/api-keys/pages/ApiKeys';
import AdminNodes from '@/features/nodes/pages/Nodes';
import AdminTemplates from '@/features/templates/pages/Templates';
import AdminMods from '@/features/mods/pages/Mods';
import ModStudio from '@/features/mods/pages/ModStudio';
import ModStats from '@/features/mods/pages/ModStats';
import AdminApplications from '@/features/applications/pages/Applications';
import ApplicationEdit from '@/features/applications/pages/ApplicationEdit';
import ApplicationConfigure from '@/features/applications/pages/ApplicationConfigure';
import ApplicationStats from '@/features/applications/pages/ApplicationStats';
import AdminThemes from '@/features/themes/pages/Themes';
import ThemeStudio from '@/features/themes/pages/ThemeStudio';
import ThemeStats from '@/features/themes/pages/ThemeStats';
import System from '@/features/system/pages/System';
import Security from '@/features/security/pages/Security';
import Activity from '@/features/activity/pages/Activity';
import InstancePages from '@/features/instance-pages/pages/InstancePages';
import InstancePageStudio from '@/features/instance-pages/pages/InstancePageStudio';
import InstancePageStats from '@/features/instance-pages/pages/InstancePageStats';
import InstancePanel, { InstanceHomePage, InstanceFilesPage, InstanceFileEditorPage, InstanceNetworkPage, InstanceConsolePage, InstanceSettingsPage, InstanceDynamicPage } from '@/features/instances/pages/InstanceDetail';
// Lazy-load the seven "advanced" instance pages so they ship in their own
// chunk instead of being pulled into the main index bundle (≈330 kB of
// panel sub-pages). InstanceDetail.tsx also dynamically imports this same
// module — React.lazy + Suspense keeps both consumers happy: the route
// table is synchronous for the router, and Rollup emits the module as a
// separate chunk that the browser fetches on demand. We use .then(...) to
// select the named export instead of the default export (React.lazy only
// knows "default").
const AdvancedPageFallback: React.FC = () => (
  <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">Loading...</div>
);
const withSuspense = (LazyComp: React.LazyExoticComponent<React.FC>): React.FC => {
  return () => (
    <React.Suspense fallback={<AdvancedPageFallback />}>
      <LazyComp />
    </React.Suspense>
  );
};
// Type-safe dynamic import of the advanced pages module
type AdvancedPagesModule = {
  InstanceEnvPage: React.FC;
  InstanceAutomationPage: React.FC;
  InstanceProcessesPage: React.FC;
  InstanceMetricsPage: React.FC;
  InstancePortsPage: React.FC;
  InstanceSnapshotsPage: React.FC;
  InstanceAuditPage: React.FC;
};
const lazyAdvanced = (name: keyof AdvancedPagesModule): React.LazyExoticComponent<React.FC> =>
  React.lazy(() =>
    import('@/features/instances/pages/InstanceAdvancedPages').then((m: AdvancedPagesModule) => ({ default: m[name] }))
  );
const InstanceEnvPage = withSuspense(lazyAdvanced('InstanceEnvPage'));
const InstanceAutomationPage = withSuspense(lazyAdvanced('InstanceAutomationPage'));
const InstanceProcessesPage = withSuspense(lazyAdvanced('InstanceProcessesPage'));
const InstanceMetricsPage = withSuspense(lazyAdvanced('InstanceMetricsPage'));
const InstancePortsPage = withSuspense(lazyAdvanced('InstancePortsPage'));
const InstanceSnapshotsPage = withSuspense(lazyAdvanced('InstanceSnapshotsPage'));
const InstanceAuditPage = withSuspense(lazyAdvanced('InstanceAuditPage'));
import Database from '@/features/database/pages/Database';
import RequireAuth from '@/shared/components/ui/RequireAuth';
import RequirePermission from '@/shared/components/ui/RequirePermission';
import { PermissionKey } from '@/shared/types/permissions';

// tightening helper: by convention every panel route sits inside <Layout/>
// (rendered with <RequireAuth/>) but we still wrap each page element in
// <RequireAuth> individually so a game-lose-the-permission user can't
// fall through to a page whose element renders React state before the
// permission gate fires. requireAuthOnly() returns an auth-only element
// (no permission gate) for the pages that, by KS Panel policy, should be
// reachable to ANY authenticated user (System / Security / Activity /
// Database / Themes — formerly gated only by ACCESS_ADMIN_PANEL and now
// driven purely by "is logged in").
function AuthOnly({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

const Router: React.FC = () => (
  <>
    {/* Repaint with the route-resolved theme whenever the path changes —
        panel pages, instance panels and auth pages can each carry their
        own assigned theme (page assignment > area default > built-in). */}
    <RouteThemeSync />
    <Routes>
    {/* Public auth routes */}
    <Route path="/auth/login" element={<Login />} />
    <Route path="/auth/register" element={<Register />} />
    <Route path="/auth/verify-email" element={<VerifyEmail />} />

    {/* Protected routes wrapped in Layout */}
    <Route element={<Layout />}>
      <Route
        path="/instances"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.VIEW_INSTANCES}>
              <InstanceList />
             </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/instances/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.VIEW_INSTANCES}>
              <InstanceStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      {/* Instance panel (top-level) — visible to any user with VIEW_INSTANCES.
          When you're inside an instance, the global sidebar opens its
          "Instances" group and reveals this entry. */}
      <Route
        path="/instances/:id/*"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.VIEW_INSTANCES}>
              <InstancePanel />
             </RequirePermission>
          </RequireAuth>
        }
      >
        <Route index element={<InstanceHomePage />} />
        <Route path="files" element={<InstanceFilesPage />} />
        <Route path="files/edit" element={<InstanceFileEditorPage />} />
        <Route path="network" element={<InstanceNetworkPage />} />
        <Route path="terminal" element={<InstanceConsolePage />} />
        <Route path="settings" element={<InstanceSettingsPage />} />
        <Route path="env" element={<InstanceEnvPage />} />
        <Route path="automation" element={<InstanceAutomationPage />} />
        <Route path="processes" element={<InstanceProcessesPage />} />
        <Route path="metrics" element={<InstanceMetricsPage />} />
        <Route path="ports" element={<InstancePortsPage />} />
        <Route path="backups" element={<InstanceSnapshotsPage />} />
        <Route path="audit" element={<InstanceAuditPage />} />
        {/* Catch-all — resolves renamed builtin slugs (e.g. /console →
            terminal component) and custom template pages to their content. */}
        <Route path="*" element={<InstanceDynamicPage />} />
     </Route>
       <Route
        path="/account"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.VIEW_ACCOUNT}>
              <Account />
             </RequirePermission>
          </RequireAuth>
        }
      />

      {/* Panel pages — formerly /admin/<area>. Each page is now gated ONLY
          by the specific permission it exercises (or, for System /
          Security / Activity / Database / Themes / Theme-Studio, by
          nothing more than being authenticated — per KS Panel policy a
          route with no granular perm key falls through to any logged-in
          user). There is no longer an "Admin Panel" routing shell or an
          ACCESS_ADMIN_PANEL gate around the whole surface. */}

      {/* Auth-only pages — no granular perm key exists for these areas,
          so they open to anyone with a session. */}
      <Route path="/system" element={<AuthOnly><System /></AuthOnly>} />
      <Route path="/security" element={<AuthOnly><Security /></AuthOnly>} />
      <Route path="/activity" element={<AuthOnly><Activity /></AuthOnly>} />
      <Route path="/database" element={<AuthOnly><Database /></AuthOnly>} />
      <Route path="/themes" element={<AuthOnly><AdminThemes /></AuthOnly>} />
      <Route path="/themes/studio" element={<AuthOnly><ThemeStudio /></AuthOnly>} />

      {/* Permission-gated pages. */}
      <Route
        path="/users"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_USERS}>
              <UsersPage />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/users/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_USERS}>
              <UserForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
        <Route
          path="/users/:id/edit"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_USERS}>
                <UserForm />
              </RequirePermission>
            </RequireAuth>
          }
        />
        <Route
          path="/user/:id"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_USERS}>
                <UserDetail />
              </RequirePermission>
            </RequireAuth>
          }
        />
        <Route
          path="/roles"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_ROLES}>
                <RolesPage />
              </RequirePermission>
            </RequireAuth>
          }
        />
      <Route
        path="/roles/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_ROLES}>
              <RoleForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/roles/:id/edit"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_ROLES}>
              <RoleForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.VIEW_SETTINGS}>
              <AdminSettings />
            </RequirePermission>
          </RequireAuth>
        }
      />
      
      {/* Permission-gated pages. */}
      <Route
        path="/api-keys"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_API_KEYS}>
              <AdminApiKeys />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/api-keys/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_API_KEYS}>
              <ApiKeyForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
        <Route
          path="/api-keys/:id/edit"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_API_KEYS}>
                <ApiKeyForm />
              </RequirePermission>
            </RequireAuth>
          }
        />
        <Route
          path="/api-key/:id"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_API_KEYS}>
                <ApiKeyDetail />
              </RequirePermission>
            </RequireAuth>
          }
        />
      <Route
        path="/nodes"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_NODES}>
              <AdminNodes />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/nodes/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_NODES}>
              <NodeStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/nodes/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_NODES}>
              <NodeForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/api-keys/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_API_KEYS}>
              <ApiKeyStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/users/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_USERS}>
              <UserStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/roles/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_ROLES}>
              <RoleStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/mods/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_MODS}>
              <ModStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/instance-pages/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCE_PAGES}>
              <InstancePageStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/themes/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <ThemeStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
        <Route
          path="/nodes/:id/edit"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_NODES}>
                <NodeForm />
              </RequirePermission>
            </RequireAuth>
          }
        />
        <Route
          path="/node/:id"
          element={
            <RequireAuth>
              <RequirePermission permission={PermissionKey.MANAGE_NODES}>
                <NodeDetail />
              </RequirePermission>
            </RequireAuth>
          }
        />
      <Route
        path="/templates"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <AdminTemplates />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/templates/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <TemplateStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/templates/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <TemplateForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/template/:id"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <TemplateDetail />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/templates/:id/edit"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <TemplateForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/mods"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_MODS}>
              <AdminMods />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/mods/studio"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_MODS}>
              <ModStudio />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/applications"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <AdminApplications />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/applications/:id/edit"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationEdit />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/applications/:id/configure"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationConfigure />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/applications/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      {/* Instance Pages — template-authoring surface for custom sidebar
          pages on the instance panel. MANAGE_INSTANCE_PAGES gate. */}
      <Route
        path="/instance-pages/studio"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCE_PAGES}>
              <InstancePageStudio />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/instance-pages/:id/studio"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCE_PAGES}>
              <InstancePageStudio />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/instance-pages"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCE_PAGES}>
              <InstancePages />
            </RequirePermission>
          </RequireAuth>
        }
      />
      {/* Fleet-wide instance management (deploy / edit). The LIST lives
          at /instances (InstancesRouter dispatches to the admin list when
          MANAGE_INSTANCES is held); these are the deploy + edit sub-actions
          for MANAGE_INSTANCES holders. The static "/new" + "/:id/edit"
          segment ranks higher in react-router v6's specificity rules than
          the /instances/:id/* splat the panel uses, so they never clash
          with the self-serve panel route. */}
      <Route
        path="/instances/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <DeployFormShell />
            </RequirePermission>
          </RequireAuth>
        }
      >
        <Route index element={<InstanceForm />} />
        <Route path="advanced" element={<AdvanceOptionPage />} />
      </Route>
      <Route
        path="/instances/:id/edit"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <InstanceForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
     </Route>

    {/* Catch-all – redirect to instances if authenticated, else to login */}
    <Route path="*" element={<Navigate to="/instances" replace />} />
    </Routes>
  </>
);

export default Router;
