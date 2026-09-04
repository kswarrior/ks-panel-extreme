import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { listTemplates } from '@/shared/api/admin';
import type { Template } from '@/shared/types/instance';
import { DeployFormProvider } from './deployFormStore';
import FormSkeleton from '@/shared/components/ui/FormSkeleton';

// DeployFormShell wraps the /instances/new/* subtree so the
// DeployFormProvider sits ABOVE both the Main form and the Advance
// Option page. The provider holds the editor / envValues / tab state
// for the whole subtree, so navigating between Main and Advance (or
// refreshing either page) preserves every edit. Without this shell the
// two pages each instantiate their own provider and the editor resets
// on every navigation — exactly the "I lose my changes when I come
// back" bug the user reported.
const DeployFormShell: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((ts) => { if (!cancelled) setTemplates(ts); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <FormPage
        crumbs={[{ label: 'Instances', to: '/instances' }, { label: 'Deploy Instance' }]}
        hideHeader
        maxWidth="max-w-3xl"
      >
        <FormSkeleton fields={4} />
      </FormPage>
    );
  }

  return (
    <DeployFormProvider templates={templates}>
      <Outlet />
    </DeployFormProvider>
  );
};

export default DeployFormShell;
