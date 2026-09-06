import React from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import Layout from '@/shared/components/layout/Layout';
import RouteThemeSync from '@/shared/components/layout/RouteThemeSync';
import Login from '@/features/auth/pages/Login';
import Register from '@/features/auth/pages/Register';
import VerifyEmail from '@/features/auth/pages/VerifyEmail';
import Instances from '@/features/instances/pages/Instances';
import Account from '@/features/account/pages/Account';
import UsersPage from '@/features/users/pages/Users';
import UserForm from '@/features/users/pages/UserForm';
import UserDetail from '@/features/users/pages/UserDetail';
import UserStats from '@/features/users/pages/UserStats';
import RolesPage from '@/features/roles/pages/Roles';
import RoleForm from '@/features/roles/pages/RoleForm';
import RoleStats from '@/features/roles/pages/RoleStats';
import RoleDetail from '@/features/roles/pages/RoleDetail';
import RoleSchedules from '@/features/roles/pages/RoleSchedules';
import ApiKeyForm from '@/features/api-keys/pages/ApiKeyForm';
import ApiKeyDetail from '@/features/api-keys/pages/ApiKeyDetail';
import ApiKeyStats from '@/features/api-keys/pages/ApiKeyStats';
import ApiKeySchedules from '@/features/api-keys/pages/ApiKeySchedules';
import UserSchedules from '@/features/users/pages/UserSchedules';
import NodeForm from '@/features/nodes/pages/NodeForm';
import NodeDetail from '@/features/nodes/pages/NodeDetail';
import InstanceForm from '@/features/instances/pages/InstanceForm';
import AdvanceOptionPage from '@/features/instances/pages/AdvanceOptionPage';
import InstanceEditAdvanced from '@/features/instances/pages/InstanceEditAdvanced';
import DeployFormShell from '@/features/instances/stores/DeployFormShell';
import InstanceStats from '@/features/instances/pages/InstanceStats';
import TemplateForm from '@/features/templates/pages/TemplateForm';
import TemplateStats from '@/features/templates/pages/TemplateStats';
import TemplateDetail from '@/features/templates/pages/TemplateDetail';
import TemplateSchedules from '@/features/templates/pages/TemplateSchedules';
import InstanceSchedules from '@/features/instances/pages/InstanceSchedules';
import NodeStats from '@/features/nodes/pages/NodeStats';
import NodeSchedules from '@/features/nodes/pages/NodeSchedules';
import AdminSettings from '@/features/settings/pages/Settings';

import AdminApiKeys from '@/features/api-keys/pages/ApiKeys';
import AdminNodes from '@/features/nodes/pages/Nodes';
import AdminTemplates from '@/features/templates/pages/Templates';
import AdminMods from '@/features/mods/pages/Mods';
import ModStudio from '@/features/mods/pages/ModStudio';
import ModStats from '@/features/mods/pages/ModStats';
import ModDetail from '@/features/mods/pages/ModDetail';
import ModSchedules from '@/features/mods/pages/ModSchedules';
import AdminApplications from '@/features/applications/pages/Applications';
import ApplicationEdit from '@/features/applications/pages/ApplicationEdit';
import ApplicationConfigure from '@/features/applications/pages/ApplicationConfigure';
import ApplicationStats from '@/features/applications/pages/ApplicationStats';
import ApplicationDetail from '@/features/applications/pages/ApplicationDetail';
import ApplicationSchedules from '@/features/applications/pages/ApplicationSchedules';
import AdminThemes from '@/features/themes/pages/Themes';
import ThemeStudio from '@/features/themes/pages/ThemeStudio';
import ThemeStats from '@/features/themes/pages/ThemeStats';
import ThemeDetail from '@/features/themes/pages/ThemeDetail';
import ThemeSchedules from '@/features/themes/pages/ThemeSchedules';
import System from '@/features/system/pages/System';
import Security from '@/features/security/pages/Security';
import Activity from '@/features/activity/pages/Activity';
import Notifications from '@/features/notifications/pages/Notifications';
import NotificationStats from '@/features/notifications/pages/NotificationStats';
import NotificationBroadcast from '@/features/notifications/pages/NotificationBroadcast';
import NotificationDetail from '@/features/notifications/pages/NotificationDetail';
import NotificationSchedules from '@/features/notifications/pages/NotificationSchedules';
import InstancePages from '@/features/instance-pages/pages/InstancePages';
import InstancePageDetail from '@/features/instance-pages/pages/InstancePageDetail';
import InstancePageStudio from '@/features/instance-pages/pages/InstancePageStudio';
import InstancePageStats from '@/features/instance-pages/pages/InstancePageStats';
import InstancePageSchedules from '@/features/instance-pages/pages/InstancePageSchedules';
import Tickets from '@/features/tickets/pages/Tickets';
import TicketDetail from '@/features/tickets/pages/TicketDetail';
import TicketForm from '@/features/tickets/pages/TicketForm';
import TicketStats from '@/features/tickets/pages/TicketStats';
import TicketSchedules from '@/features/tickets/pages/TicketSchedules';
import TicketChatPage from '@/features/tickets/pages/TicketChatPage';
import InstancePanel, { InstanceDynamicPage } from '@/features/instances/pages/InstanceDetail';
import Database from '@/features/database/pages/Database';
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
