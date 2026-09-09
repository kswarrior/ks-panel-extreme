import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CustomPageView from '@/shared/components/ui/CustomPageView';
import ErrorState from '@/shared/components/ui/ErrorState';
import SkeletonCard from '@/shared/components/ui/SkeletonCard';
import { fetchPanelPageBySlug, type PanelPage } from '@/features/settings/api/panelPages';
import { usePanelPagesStore } from '@/features/settings/stores/panelPagesStore';

// PanelPageView renders one admin-authored custom page (Settings > Pages)
// at /pages/:slug. Visibility is enforced server-side (enabled + role
// allow-list); a hidden page answers 404 and lands here.
const PanelPageView: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const loadNav = usePanelPagesStore((s) => s.load);
  const [page, setPage] = useState<PanelPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    loadNav();
  }, [loadNav]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setPage(null);
    (async () => {
      try {
        const p = await fetchPanelPageBySlug(slug);
        if (cancelled) return;
        setPage(p);
        if (typeof document !== 'undefined') document.title = p.name;
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (missing || !page) {
    return (
      <ErrorState
        variant="not-found"
        title="Page not found"
        description="It may be switched off or hidden from your role."
        backLabel="Back"
        onBack={() => navigate(-1)}
      />
    );
  }

  return (
    <div className="glass-card ks-form-card rounded-xl">
      <CustomPageView
        title={page.name}
        content={{
          type: page.content_type === 'html' ? 'html' : 'markdown',
          html: page.content_type === 'html' ? page.content : undefined,
          markdown: page.content_type === 'markdown' ? page.content : undefined,
        }}
        pageSlug={page.slug}
      />
    </div>
  );
};

export default PanelPageView;
