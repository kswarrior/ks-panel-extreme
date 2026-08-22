import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FormPage from '@/shared/components/forms/FormPage';
import { serializeEditor } from '../utils/instanceFormUtils';
import { useDeployForm } from '../stores/deployFormStore';
import InstanceAdvancedOptionsFullScreen from './InstanceAdvancedOptionsFullScreen';
import { listTemplates } from '@/shared/api/admin';
import { useEffect, useState } from 'react';
import type { Template } from '@/shared/types/instance';

// AdvanceOptionPage — standalone routed page that wraps the
// InstanceAdvancedOptionsFullScreen component so the user navigates into
// a real panel page (not an inline overlay) when they pick "Advance
// Option" on the deploy form. State is shared through the
// DeployFormProvider mounted by DeployFormShell so edits in either view
// survive the back/forward navigation.
const AdvanceOptionPage: React.FC = () => {
  const navigate = useNavigate();
  const { editor } = useDeployForm();
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((ts) => { if (!cancelled) setTemplates(ts); })
      .catch(() => { if (!cancelled) setTemplates([]); });
    return () => { cancelled = true; };
  }, []);

  const specPreview = useMemo(() => JSON.stringify(serializeEditor(editor), null, 2), [editor]);

  const selectedTemplate = useMemo(() => {
    const t = templates[0];
    return t ? { image: t.image, kind: t.kind } : null;
  }, [templates]);

  return (
    <InstanceAdvancedOptionsFullScreen
      selectedTemplate={selectedTemplate}
      specPreview={specPreview}
      onClose={() => navigate('/instances/new')}
    />
  );
};

export default AdvanceOptionPage;
