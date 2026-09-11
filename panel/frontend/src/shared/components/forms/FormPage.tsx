import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageFormActionsPill from '@/shared/components/ui/PageFormActionsPill';
import { PILL_TAB_STYLE } from '@/shared/components/ui/PageActionsPill';

interface FormPageProps {
  // Breadcrumb pieces rendered left-to-right. The last item is the
  // current page ("New User"); everything before it is crispy-clickable.
  crumbs: Array<{ label: string; to?: string }>;
  // Visibility flag for the submit button – some forms (the one-time
  // token disclosure) never submit; we hide the bar so the action row
  // doesn't grow an unused Cancel + Save.
  saving?: boolean;
  // Title shown large above the form. Defaults to the last crumb label.
  title?: string;
  // Back link target if Cancel is hit; defaults to the second-to-last
  // crumb. Pass explicitly when nested routes don't follow that shape.
  cancelTo?: string;
  // Submit button label. Set to undefined when this FormPage never
  // submits (e.g. a one-time disclosure modal-equivalent).
  submitLabel?: string;
  submittingLabel?: string;
  // Optional secondary action next to Save – used for "Import Pterodactyl"
  // or similar. Rendered as plain buttons the caller supplies.
  secondaryActions?: React.ReactNode;
  // Optional element rendered INSIDE the title row, right-aligned. Lets
  // callers add a Back / refresh / contextual button next to the page
  // title without overriding the whole header layout.
  headerActions?: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  disabled?: boolean;
  // Hides the breadcrumb + title row in the page body. Used when the
  // crumb already lives in the app header (e.g. Node form shows
  // "Nodes / New Node" right of the sidebar toggle).
  hideHeader?: boolean;
  // Max width style override – the default `max-w-xl` works for the
  // User/Node/Role forms; Templates need `max-w-3xl`.
  maxWidth?: string;
  children: React.ReactNode;
}

// FormPage replaces the old modal-based create/edit flow. It renders a
// real routed page (under `/<area>/new` or `/:id/edit`) so the user
// can bookmark, deep-link, and use the back button. The sticky header +
// footer give the form a Single Page App "form sheet" feel rather than a
// modal-in-a-modal.
//
// The chrome (sidebar/header/background) stays around because every FormPage
// is rendered inside Layout's `<main>` via router; the only thing we add is
// a glass surface that wraps the form body.
const FormPage: React.FC<FormPageProps> = ({
  crumbs,
  saving,
  title,
  cancelTo,
  submitLabel,
  submittingLabel,
  secondaryActions,
  headerActions,
  onSubmit,
  disabled,
  hideHeader,
  maxWidth = 'max-w-xl',
  children,
}) => {
  const navigate = useNavigate();
  const displayTitle = title || crumbs[crumbs.length - 1]?.label || '';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Breadcrumb + title row. Skipped when hideHeader is set — the
          crumb already lives in the app header. */}
      {!hideHeader && (
        <>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-gray-600">/</span>}
                {c.to ? (
                  <button
                    type="button"
                    onClick={() => navigate(c.to as string)}
                    className="hover:text-white transition-colors"
                  >
                    {c.label}
                  </button>
                ) : (
                  <span className="text-gray-200">{c.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 mb-2 min-w-0">
            <h2 className="text-xl font-semibold text-white shrink-0">{displayTitle}</h2>
            {headerActions && <div className="flex items-center gap-2 min-w-0 flex-1 justify-end overflow-x-auto scrollbar-hide">{headerActions}</div>}
          </div>
        </>
      )}

      {/* Form body — no wrapper.
          Callers compose inputs inside; no nested GlassCards needed. */}
      <div className={`space-y-6 ${maxWidth}`}>
        {children}
      </div>

      {/* Action row — fixed bottom-right form pill (Save); always
          visible by default so Save never scrolls away. Auto-off is opt-in
          via the Theme Studio's Pill tab. */}
      {(submitLabel || secondaryActions) && (
        <PageFormActionsPill>
          {secondaryActions}
          {submitLabel && (
            <button
              type="submit"
              disabled={saving || disabled}
              className="ks-tab ks-tab-active shrink-0 px-3 py-1.5 rounded text-sm text-center transition disabled:opacity-60"
              style={PILL_TAB_STYLE}
            >
              {saving ? submittingLabel || 'Saving…' : submitLabel}
            </button>
          )}
        </PageFormActionsPill>
      )}
    </form>
  );
};

export default FormPage;
