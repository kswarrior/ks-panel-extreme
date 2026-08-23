// useDeployFormStore — React-Context-based shared state for the deploy
// form. Lifts every form field (name, displayName, icon, color, ownerId,
// nodeId, templateId, envValues, editor, tab, showAdvanced) out of
// InstanceForm so the Advance Option page can render its own FormPage
// chrome (header / footer / background) while the user navigates between
// Main and Advance. Without this lift, opening Advance would either (a)
// duplicate state in two places and lose changes on back, or (b) force
// the user back through the inline "fixed inset-0" overlay that visually
// floats over Main instead of replacing it.
//
// The store lives in DeployFormShell, the parent route for
// /instances/new and /instances/new/advanced. Both child routes consume
// the same hook, so every keystroke / picker / toggle survives the route
// change — the user can flip between Main and Advance any number of times
// without losing a single value.
//
// Behaviour:
//   • The store is keyed on the template id (`templateId`). Picking a
//     different template re-seeds the editor from that template's spec
//     exactly once (mirrors the original `selectTemplate` behaviour in
//     InstanceForm).
//   • The Main form and the Advance page both consume the same hook, so
//     edits propagate instantly and survive a route change.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorState, EnvVariable, InstanceTabId } from '../types/instanceForm';
import { emptyEditor } from '../types/instanceForm';
import { specToEditor, structuredCloneSafe } from '../utils/instanceFormUtils';
import type { Template } from '@/shared/types/instance';
import type { Node } from '@/shared/types/node';
import type { User, Role } from '@/shared/types/user';

interface DeployFormState {
  // Top-level form fields (lifted out of InstanceForm so they survive the
  // /instances/new <-> /instances/new/advanced navigation).
  templateId: number;
  setTemplateId: (id: number) => void;
  nodeId: number;
  setNodeId: (id: number) => void;
  ownerId: number;
  setOwnerId: (id: number) => void;
  name: string;
  setName: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  icon: string;
  setIcon: (v: string) => void;
  color: string;
  setColor: (v: string) => void;

  // Editor + env + tab.
  editor: EditorState;
  setEditor: React.Dispatch<React.SetStateAction<EditorState>>;
  baseline: EditorState;
  envValues: Record<string, string>;
  setEnvValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tab: InstanceTabId;
  setTab: (t: InstanceTabId) => void;
  showAdvanced: boolean;
  setShowAdvanced: (b: boolean) => void;

  // Pre-fetched lists so both pages don't issue duplicate GETs.
  nodes: Node[];
  templates: Template[];
  users: User[];
  roles: Role[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setTemplates: React.Dispatch<React.SetStateAction<Template[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setRoles: React.Dispatch<React.SetStateAction<Role[]>>;

  // Loading / error / deploying flags lifted so the Main form can keep
  // them when the Advance page is in flight.
  loading: boolean;
  setLoading: (v: boolean) => void;
  deploying: boolean;
  setDeploying: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
}

const DeployFormContext = createContext<DeployFormState | null>(null);

interface DeployFormProviderProps {
  templates: Template[];
  children: React.ReactNode;
}

export const DeployFormProvider: React.FC<DeployFormProviderProps> = ({ templates, children }) => {
  const [templateId, setTemplateId] = useState<number>(0);
  const [nodeId, setNodeId] = useState(0);
  const [ownerId, setOwnerId] = useState(0);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const baselineRef = useRef<EditorState>(emptyEditor());
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<InstanceTabId>('environment');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [localTemplates, setLocalTemplates] = useState<Template[]>(templates);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const seededFor = useRef<number>(0);

  // Seed the editor from the selected template exactly once per template
  // id change. This is the same shape the inline InstanceForm used to do
  // locally — but lifted here so both pages see the same baseline.
  useEffect(() => {
    if (templateId === 0 || seededFor.current === templateId) return;
    const t = localTemplates.find((x) => x.id === templateId);
    if (!t) {
      const blank = emptyEditor();
      seededFor.current = templateId;
      setEditor(blank);
      baselineRef.current = blank;
      setEnvValues({});
      return;
    }
    const ed = specToEditor(t.spec);
    seededFor.current = templateId;
    baselineRef.current = structuredCloneSafe(ed);
    setEditor(structuredCloneSafe(ed));
    const seeded: Record<string, string> = {};
    for (const v of ed.env) {
      if (v.name) seeded[v.name] = v.default || '';
    }
    setEnvValues(seeded);
  }, [templateId, localTemplates]);

  const value = useMemo<DeployFormState>(
    () => ({
      templateId,
      setTemplateId,
      nodeId,
      setNodeId,
      ownerId,
      setOwnerId,
      name,
      setName,
      displayName,
      setDisplayName,
      icon,
      setIcon,
      color,
      setColor,
      editor,
      setEditor,
      baseline: baselineRef.current,
      envValues,
      setEnvValues,
      tab,
      setTab,
      showAdvanced,
      setShowAdvanced,
      nodes,
      templates: localTemplates,
      users,
      roles,
      setNodes,
      setTemplates: setLocalTemplates,
      setUsers,
      setRoles,
      loading,
      setLoading,
      deploying,
      setDeploying,
      error,
      setError,
    }),
    [templateId, nodeId, ownerId, name, displayName, icon, color, editor, envValues, tab, showAdvanced, nodes, localTemplates, users, roles, loading, deploying, error],
  );

  return <DeployFormContext.Provider value={value}>{children}</DeployFormContext.Provider>;
};

export function useDeployForm(): DeployFormState {
  const ctx = useContext(DeployFormContext);
  if (!ctx) {
    throw new Error('useDeployForm must be used inside DeployFormProvider');
  }
  return ctx;
}

// Helper hook used by both pages — derives the field-update / add /
// delete callbacks from the shared store so the rest of the editor code
// reads identically to the old inline form.
export function useDeployFormHandlers() {
  const { editor, setEditor, envValues, setEnvValues } = useDeployForm();

  const updateEnv = useCallback(
    (i: number, patch: Partial<EnvVariable>) =>
      setEditor((f) => {
        const e = [...f.env];
        e[i] = { ...e[i], ...patch };
        return { ...f, env: e };
      }),
    [setEditor],
  );
  const addEnv = useCallback(
    () =>
      setEditor((f) => ({
        ...f,
        env: [
          ...f.env,
          {
            name: '',
            label: '',
            description: '',
            default: '',
            user_viewable: true,
            user_editable: true,
            required: false,
            rule: '',
            display: 'text',
            options: '',
            prepend: '',
            append: false,
            append_value: '',
          },
        ],
      })),
    [setEditor],
  );
  const delEnv = useCallback(
    (i: number) => setEditor((f) => ({ ...f, env: f.env.filter((_, j) => j !== i) })),
    [setEditor],
  );

  return { editor, setEditor, envValues, setEnvValues, updateEnv, addEnv, delEnv };
}
