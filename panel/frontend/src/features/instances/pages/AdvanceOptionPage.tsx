import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { serializeEditor } from '../utils/instanceFormUtils';
import { useDeployForm } from '../stores/deployFormStore';
import InstanceAdvancedOptionsFullScreen from './InstanceAdvancedOptionsFullScreen';

// AdvanceOptionPage — standalone routed page that wraps the
// InstanceAdvancedOptionsFullScreen component so the user navigates into
// a real panel page (not an inline overlay) when they pick "Advance
// Option" on the deploy form. State (editor, envValues, templateId,
// nodeId, ownerId, name, displayName, icon, color, plus the pre-fetched
// nodes/templates/users/roles lists) is shared through the
// DeployFormProvider mounted by DeployFormShell so every value survives
// the back/forward navigation between Main and Advance.
const AdvanceOptionPage: React.FC = () => {
  const navigate = useNavigate();
  const { editor, templates, templateId } = useDeployForm();

  const specPreview = useMemo(() => JSON.stringify(serializeEditor(editor), null, 2), [editor]);

  // selectedTemplate must be the template the user picked on the Main
  // form (its id), not the first one in the list — otherwise the Runtime
  // section would render the wrong driver's fields after a navigation.
  const selectedTemplate = useMemo(() => {
    const t = templates.find((x) => x.id === templateId) ?? templates[0];
    return t ? { image: t.image, kind: t.kind } : null;
  }, [templates, templateId]);

  return (
    <InstanceAdvancedOptionsFullScreen
      selectedTemplate={selectedTemplate}
      specPreview={specPreview}
      onClose={() => navigate('/instances/new')}
    />
  );
};

export default AdvanceOptionPage;
