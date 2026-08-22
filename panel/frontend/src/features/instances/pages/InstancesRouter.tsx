import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { PermissionKey } from '@/shared/types/permissions';
import Instances from './Instances';
import AdminInstances from './AdminInstances';

// Pick the right Instances index based on who's looking. Admins get the
// fleet-wide admin list (and its Deploy button); regular users get the
// self-service "My Instances" page which only shows instances they own.
// The /instances route dispatches directly on the caller's MANAGE_INSTANCES
// permission, so admin and self-serve both land on the same path.
const InstanceList: React.FC = () => {
  const permissions = useAuthStore((s) => s.permissions);
  const canManage = permissions.includes(PermissionKey.MANAGE_INSTANCES);
  if (canManage) return <AdminInstances />;
  return <Instances />;
};

export default InstanceList;
