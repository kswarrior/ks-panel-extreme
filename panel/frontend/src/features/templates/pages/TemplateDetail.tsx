import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listTemplates } from '@/shared/api/admin';
import type { Template } from '@/shared/types/instance';
import GlassCard from '@/shared/components/ui/Card';

function parseSpec(raw: string): Record<string, any> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, any>; } catch { return {}; }
}

const TemplateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const templates = await listTemplates();
        const t = templates.find((x) => x.id === Number(id)) || null;
        setTemplate(t);
      } catch (e: any) {
        setError(e?.response?.data || 'Failed to load template');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const back = () => navigate('/templates');

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>;
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!template) {
    return <p className="text-gray-400">Template not found</p>;
  }

  const spec = parseSpec(template.spec);
  const kind = template.kind;
  const limits = spec.limits || {};
  const ports = Array.isArray(spec.ports) ? spec.ports.length : 0;
  const env = Array.isArray(spec.env) ? spec.env.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={back} className="ks-btn-header ks-icon-btn" aria-label="Back to Templates list">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-xl font-semibold text-white">Template Detail</h2>
      </div>
      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-white/[0.05] border border-white/10 text-gray-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 1 1 10 0v4" />
              <path d="M12 2v4" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white truncate">{template.name}</h3>
            <p className="text-[11px] text-gray-400">ID: {template.id}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs uppercase tracking-wide text-gray-400">Kind</h4>
            <span className="text-sm font-medium text-gray-300">{kind}</span>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-gray-400">Created</h4>
            <p className="text-sm text-gray-400">{new Date(template.created_at).toLocaleDateString()}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-gray-400">Updated</h4>
            <p className="text-sm text-gray-400">{new Date(template.updated_at).toLocaleDateString()}</p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-gray-400">Spec Summary</h4>
            <p className="text-sm text-gray-400 truncated">
              {env > 0 && `${env} env vars `}{ports > 0 && `${ports} ports `}{limits.memory && `mem: ${limits.memory} `}{limits.cpu && `cpu: ${limits.cpu} `}{limits.disk && `disk: ${limits.disk} `}
            </p>
          </div>
        </div>

        {template.description && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-1">Description</h4>
            <p className="text-sm text-gray-300">{template.description}</p>
          </div>
        )}

        {template.image && (
          <div className="mt-4">
            <h4 className="text-xs uppercase tracking-wide text-gray-400 mb-1">Image</h4>
            <p className="text-sm text-gray-300 font-mono truncate">{template.image}</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

export default TemplateDetail;