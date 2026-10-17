import React from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import Layout from '@/shared/components/layout/Layout';
import RouteThemeSync from '@/shared/components/layout/RouteThemeSync';
import Login from '@/features/auth/pages/Login';
import Register from '@/features/auth/pages/Register';
import VerifyEmail from '@/features/auth/pages/VerifyEmail';
// ---------------------------------------------------------------------
// Lazy page chunks. Every authed page loads on demand, so a phone only
// fetches the chunk it opens instead of the whole 9MB panel bundle. The
// auth pages above stay static — they are the anonymous first paint and
// are tiny. Layout mounts ONE <Suspense> around <Outlet/> so the
// sidebar/header chrome never unmounts while a page chunk arrives.
// ---------------------------------------------------------------------
const Instances = React.lazy(() => import('@/features/instances/pages/Instances'));
const Account = React.lazy(() => import('@/features/account/pages/Account'));
const UsersPage = React.lazy(() => import('@/features/users/pages/Users'));
const UserForm = React.lazy(() => import('@/features/users/pages/UserForm'));
const UserDetail = React.lazy(() => import('@/features/users/pages/UserDetail'));
const UserStats = React.lazy(() => import('@/features/users/pages/UserStats'));
const RolesPage = React.lazy(() => import('@/features/roles/pages/Roles'));
const RoleForm = React.lazy(() => import('@/features/roles/pages/RoleForm'));
const RoleStats = React.lazy(() => import('@/features/roles/pages/RoleStats'));
const RoleDetail = React.lazy(() => import('@/features/roles/pages/RoleDetail'));
const RoleSchedules = React.lazy(() => import('@/features/roles/pages/RoleSchedules'));
const ApiKeyForm = React.lazy(() => import('@/features/api-keys/pages/ApiKeyForm'));
const ApiKeyDetail = React.lazy(() => import('@/features/api-keys/pages/ApiKeyDetail'));
const ApiKeyStats = React.lazy(() => import('@/features/api-keys/pages/ApiKeyStats'));
const ApiKeySchedules = React.lazy(() => import('@/features/api-keys/pages/ApiKeySchedules'));
const UserSchedules = React.lazy(() => import('@/features/users/pages/UserSchedules'));
const NodeForm = React.lazy(() => import('@/features/nodes/pages/NodeForm'));
const NodeDetail = React.lazy(() => import('@/features/nodes/pages/NodeDetail'));
const InstanceForm = React.lazy(() => import('@/features/instances/pages/InstanceForm'));
const AdvanceOptionPage = React.lazy(() => import('@/features/instances/pages/AdvanceOptionPage'));
const InstanceEditAdvanced = React.lazy(() => import('@/features/instances/pages/InstanceEditAdvanced'));
const DeployFormShell = React.lazy(() => import('@/features/instances/stores/DeployFormShell'));
const InstanceStats = React.lazy(() => import('@/features/instances/pages/InstanceStats'));
const TemplateForm = React.lazy(() => import('@/features/templates/pages/TemplateForm'));
const TemplateStats = React.lazy(() => import('@/features/templates/pages/TemplateStats'));
const TemplateDetail = React.lazy(() => import('@/features/templates/pages/TemplateDetail'));
const TemplateSchedules = React.lazy(() => import('@/features/templates/pages/TemplateSchedules'));
const InstanceSchedules = React.lazy(() => import('@/features/instances/pages/InstanceSchedules'));
const NodeStats = React.lazy(() => import('@/features/nodes/pages/NodeStats'));
const NodeSchedules = React.lazy(() => import('@/features/nodes/pages/NodeSchedules'));
const AdminSettings = React.lazy(() => import('@/features/settings/pages/Settings'));
const PanelPageView = React.lazy(() => import('@/features/settings/pages/PanelPageView'));

const AdminApiKeys = React.lazy(() => import('@/features/api-keys/pages/ApiKeys'));
const AdminNodes = React.lazy(() => import('@/features/nodes/pages/Nodes'));
const AdminTemplates = React.lazy(() => import('@/features/templates/pages/Templates'));
const AdminMods = React.lazy(() => import('@/features/mods/pages/Mods'));
const AdminStacks = React.lazy(() => import('@/features/stacks/pages/Stacks'));
const StackDetail = React.lazy(() => import('@/features/stacks/pages/StackDetail'));
const StackFiles = React.lazy(() => import('@/features/stacks/pages/StackFiles'));
const StackView = React.lazy(() => import('@/features/stacks/pages/StackView'));
const StackForm = React.lazy(() => import('@/features/stacks/pages/StackForm'));
const StackStats = React.lazy(() => import('@/features/stacks/pages/StackStats'));
const StackSchedules = React.lazy(() => import('@/features/stacks/pages/StackSchedules'));
const ModStudio = React.lazy(() => import('@/features/mods/pages/ModStudio'));
const ModStats = React.lazy(() => import('@/features/mods/pages/ModStats'));
const ModDetail = React.lazy(() => import('@/features/mods/pages/ModDetail'));
const ModSchedules = React.lazy(() => import('@/features/mods/pages/ModSchedules'));
const AdminApplications = React.lazy(() => import('@/features/applications/pages/Applications'));
const ApplicationStudio = React.lazy(() => import('@/features/applications/pages/ApplicationStudio'));
const ApplicationEdit = React.lazy(() => import('@/features/applications/pages/ApplicationEdit'));
const ApplicationConfigure = React.lazy(() => import('@/features/applications/pages/ApplicationConfigure'));
const ApplicationStats = React.lazy(() => import('@/features/applications/pages/ApplicationStats'));
const ApplicationDetail = React.lazy(() => import('@/features/applications/pages/ApplicationDetail'));
const ApplicationSchedules = React.lazy(() => import('@/features/applications/pages/ApplicationSchedules'));
const AdminThemes = React.lazy(() => import('@/features/themes/pages/Themes'));
const ThemeStudio = React.lazy(() => import('@/features/themes/pages/ThemeStudio'));
const ThemeStats = React.lazy(() => import('@/features/themes/pages/ThemeStats'));
const ThemeDetail = React.lazy(() => import('@/features/themes/pages/ThemeDetail'));
const ThemeSchedules = React.lazy(() => import('@/features/themes/pages/ThemeSchedules'));
const System = React.lazy(() => import('@/features/system/pages/System'));
const Security = React.lazy(() => import('@/features/security/pages/Security'));
const Activity = React.lazy(() => import('@/features/activity/pages/Activity'));
const Notifications = React.lazy(() => import('@/features/notifications/pages/Notifications'));
const NotificationStats = React.lazy(() => import('@/features/notifications/pages/NotificationStats'));
const NotificationBroadcast = React.lazy(() => import('@/features/notifications/pages/NotificationBroadcast'));
const NotificationDetail = React.lazy(() => import('@/features/notifications/pages/NotificationDetail'));
const NotificationSchedules = React.lazy(() => import('@/features/notifications/pages/NotificationSchedules'));
const InstancePages = React.lazy(() => import('@/features/instance-pages/pages/InstancePages'));
const InstancePageDetail = React.lazy(() => import('@/features/instance-pages/pages/InstancePageDetail'));
const InstancePageStudio = React.lazy(() => import('@/features/instance-pages/pages/InstancePageStudio'));
const InstancePageStats = React.lazy(() => import('@/features/instance-pages/pages/InstancePageStats'));
const InstancePageSchedules = React.lazy(() => import('@/features/instance-pages/pages/InstancePageSchedules'));
const Tickets = React.lazy(() => import('@/features/tickets/pages/Tickets'));
const TicketDetail = React.lazy(() => import('@/features/tickets/pages/TicketDetail'));
const TicketForm = React.lazy(() => import('@/features/tickets/pages/TicketForm'));
const TicketStats = React.lazy(() => import('@/features/tickets/pages/TicketStats'));
const TicketSchedules = React.lazy(() => import('@/features/tickets/pages/TicketSchedules'));
const TicketChatPage = React.lazy(() => import('@/features/tickets/pages/TicketChatPage'));
const InstancePanel = React.lazy(() => import('@/features/instances/pages/InstanceDetail'));
const InstanceDynamicPage = React.lazy(() =>
  import('@/features/instances/pages/InstanceDetail').then((m) => ({ default: m.InstanceDynamicPage })),
);
const Database = React.lazy(() => import('@/features/database/pages/Database'));
import RequireAuth from '@/shared/components/ui/RequireAuth';
import RequirePermission from '@/shared/components/ui/RequirePermission';
import { PermissionKey } from '@/shared/types/permissions';

// Every panel route sits inside <Layout/> (rendered with <RequireAuth/>)
// plus a per-page <RequireAuth>+<RequirePermission> gate so a
// game-lose-the-permission user can't fall through to a page whose element
// renders React state before the permission gate fires.

// Unknown paths: unauthenticated users go straight to login (preserving
// the original location in `from`); authenticated users fall back to the
// instance list where the permission gate decides what renders.
const CatchAll: React.FC = () => {
  const token = useAuthStore((s) => s.token);
  const initialized = useAuthStore((s) => s.initialized);
  const location = useLocation();
  if (!initialized) return null;
  if (!token) return <Navigate to="/auth/login" state={{ from: location }} replace />;
  return <Navigate to="/instances" replace />;
};

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
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <Instances />
             </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/instances/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <InstanceStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/instances/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <InstanceSchedules />
            </RequirePermission>
          </RequireAuth>
        }
      />
      {/* Instance panel (top-level) — visible to any user with instance view permission.
          When you're inside an instance, the global sidebar opens its
          "Instances" group and reveals this entry. */}
      <Route
        path="/instances/:id/*"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <InstancePanel />
             </RequirePermission>
          </RequireAuth>
        }
      >
        {/* Every instance sub-page is a CUSTOM page resolved from the
            instance's deploy-time spec.pages — including the index route
            (Home uses slug "."). No static built-in component routes. */}
        <Route index element={<InstanceDynamicPage />} />
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

      {/* Panel pages — formerly /admin/<area>. Each page is gated by the
          specific permission it exercises via <RequirePermission>. There is
          no longer an "Admin Panel" routing shell around the whole surface. */}

      {/* System / Security / Database — gated by ACCESS_ADMIN_PANEL (backend
          requires it; an auth-only gate would expose 403 from the API). */}
      <Route path="/system" element={<RequireAuth><RequirePermission permission={PermissionKey.ACCESS_ADMIN_PANEL}><System /></RequirePermission></RequireAuth>} />
      <Route path="/security" element={<RequireAuth><RequirePermission permission={PermissionKey.ACCESS_ADMIN_PANEL}><Security /></RequirePermission></RequireAuth>} />
      <Route path="/database" element={<RequireAuth><RequirePermission permission={PermissionKey.ACCESS_ADMIN_PANEL}><Database /></RequirePermission></RequireAuth>} />

      {/* Notifications — now fully permission-gated (permission is King). Every surface
          requires MANAGE_NOTIFICATIONS (umbrella) or any granular NOTIFICATIONS_* key.
          No inbox is public. */}
      <Route path="/notifications/stats" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_NOTIFICATIONS}><NotificationStats /></RequirePermission></RequireAuth>} />
      <Route path="/notifications/schedules" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_NOTIFICATIONS}><NotificationSchedules /></RequirePermission></RequireAuth>} />
      <Route path="/notifications/broadcast" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_NOTIFICATIONS}><NotificationBroadcast /></RequirePermission></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_NOTIFICATIONS}><Notifications /></RequirePermission></RequireAuth>} />
      <Route path="/notification/:id" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_NOTIFICATIONS}><NotificationDetail /></RequirePermission></RequireAuth>} />
       <Route path="/activity" element={<RequireAuth><RequirePermission permission={PermissionKey.ACCESS_ADMIN_PANEL}><Activity /></RequirePermission></RequireAuth>} />

      {/* Themes — public read is open, but the management surface (list + studio)
          is gated by MANAGE_THEMES (any theme sub-cap also admits via RequirePermission). */}
      <Route path="/themes" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_THEMES}><AdminThemes /></RequirePermission></RequireAuth>} />
      <Route path="/themes/studio" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_THEMES}><ThemeStudio /></RequirePermission></RequireAuth>} />
      <Route path="/themes/schedules" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_THEMES}><ThemeSchedules /></RequirePermission></RequireAuth>} />
      <Route path="/theme/:id" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_THEMES}><ThemeDetail /></RequirePermission></RequireAuth>} />

      {/* Tickets — gated by MANAGE_TICKETS (area-aware: TICKETS_VIEW etc also admits).
          The handler narrows to own tickets for non-staff, but the route gate prevents
          Forbidden for users without any ticket perm. */}
      <Route path="/tickets" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><Tickets /></RequirePermission></RequireAuth>} />
      <Route path="/tickets/stats" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><TicketStats /></RequirePermission></RequireAuth>} />
      <Route path="/tickets/schedules" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><TicketSchedules /></RequirePermission></RequireAuth>} />
      <Route path="/tickets/new" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><TicketForm /></RequirePermission></RequireAuth>} />
      <Route path="/tickets/:id/edit" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><TicketForm /></RequirePermission></RequireAuth>} />
      <Route path="/tickets/:id/chat" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><TicketChatPage /></RequirePermission></RequireAuth>} />
      <Route path="/tickets/:id" element={<RequireAuth><RequirePermission permission={PermissionKey.MANAGE_TICKETS}><TicketDetail /></RequirePermission></RequireAuth>} />

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
      {/* Custom panel pages (Settings > Pages: About, Docs, …). Auth-only
          gate on purpose: visibility is enforced per page server-side
          (enabled + role allow-list), so any signed-in user may hold the
          route while the API 404s pages they must not see. */}
      <Route
        path="/pages/:slug"
        element={
          <RequireAuth>
            <PanelPageView />
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
        path="/nodes/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_NODES}>
              <NodeSchedules />
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
        path="/api-keys/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_API_KEYS}>
              <ApiKeySchedules />
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
        path="/users/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_USERS}>
              <UserSchedules />
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
        path="/roles/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_ROLES}>
              <RoleSchedules />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/role/:id"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_ROLES}>
              <RoleDetail />
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
        path="/mods/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_MODS}>
              <ModSchedules />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/mod/:id"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_MODS}>
              <ModDetail />
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
        path="/instance-pages/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCE_PAGES}>
              <InstancePageSchedules />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/themes/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_THEMES}>
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
        path="/templates/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_TEMPLATES}>
              <TemplateSchedules />
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
        path="/stacks"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <AdminStacks />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/stacks/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <StackForm />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/stacks/stats"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <StackStats />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/stacks/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <StackSchedules />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/stack/:id"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <StackDetail />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/stack/:id/files"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <StackFiles />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/stacks/:slug/*"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_STACKS}>
              <StackView />
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
        path="/applications/studio"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationStudio />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/applications/new"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationEdit />
            </RequirePermission>
          </RequireAuth>
        }
      />
      <Route
        path="/application/:id"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationDetail />
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
      <Route
        path="/applications/schedules"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_APPLICATIONS}>
              <ApplicationSchedules />
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
        path="/instance-pages/:id"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCE_PAGES}>
              <InstancePageDetail />
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
          at /instances (single Instances page with permission-aware branching);
          these are the deploy + edit sub-actions for MANAGE_INSTANCES holders.
          The static "/new" segment ranks higher in react-router v6's
          specificity rules than the /instances/:id/* splat the panel uses, so
          they never clash with the self-serve panel route; the edit form lives
          outside that prefix entirely at /instance/:id/edit. */}
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
        path="/instance/:id/edit"
        element={
          <RequireAuth>
            <RequirePermission permission={PermissionKey.MANAGE_INSTANCES}>
              <InstanceEditAdvanced />
            </RequirePermission>
          </RequireAuth>
        }
      />
     </Route>

    {/* Catch-all – auth-aware: login when anonymous, instances otherwise */}
    <Route path="*" element={<CatchAll />} />
    </Routes>
  </>
);

export default Router;
