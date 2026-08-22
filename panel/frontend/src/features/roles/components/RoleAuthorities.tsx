import React from 'react';
import GlassField from '@/shared/components/ui/Field';
import type { AuthProviderInfo } from '@/features/authority/types/authority';
import { AUTHORITY_PROVIDER } from '@/features/authority/types/authority';

interface RoleAuthoritiesProps {
  formAllowedAuthTypes: string[] | null;
  setFormAllowedAuthTypes: React.Dispatch<React.SetStateAction<string[] | null>>;
  authProviders: AuthProviderInfo[];
}

const ALLOWED_AUTH_TYPES_UNRESTRICTED: string[] = [];

const RoleAuthorities: React.FC<RoleAuthoritiesProps> = ({
  formAllowedAuthTypes,
  setFormAllowedAuthTypes,
  authProviders,
}) => {
  return (
    <GlassField label="Allowed sign-in authorities" htmlFor="allowed-auth-types">
      <div className="space-y-4">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            id="allowed-auth-types-unrestricted"
            checked={formAllowedAuthTypes === null}
            onChange={(e) =>
              setFormAllowedAuthTypes((f) => ({
                ...f,
                allowed_auth_types: e.target.checked ? null : ALLOWED_AUTH_TYPES_UNRESTRICTED,
              }))
            }
            className="mt-0.5 accent-indigo-400"
          />
          <span className="flex-1">
            <span className="block text-sm font-medium text-indigo-100">Unrestricted</span>
            <span className="block text-xs text-gray-400">
              Every admin-enabled authority is offered to users with this role (the default for the seeded admin / moderator / user roles).
            </span>
          </span>
        </label>

        {formAllowedAuthTypes !== null && (() => {
          const allowed = formAllowedAuthTypes as string[];
          return (
          <div className="rounded border border-white/[0.06] bg-black/20 p-3 space-y-2">
            <p className="text-xs text-gray-400">
              Pick the subset of admin-enabled authorities this role may turn on. Password is always allowed implicitly — un-ticking it doesn't disable it for a user's own login.
            </p>
            {authProviders.length === 0 ? (
              <p className="text-xs text-gray-500">
                No admin-enabled authorities yet — open the Authority admin page to enable providers first.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {authProviders.map((p) => {
                  const checked = allowed.includes(p.id);
                  const isPassword = p.id === AUTHORITY_PROVIDER.password;
                  const kindLabel = p.kind === 'oauth' ? 'OAuth' : 'Channel';
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer select-none transition-colors ${
                        checked
                          ? 'border-emerald-600/60 bg-emerald-800/20 text-emerald-200'
                          : 'border-white/[0.06] bg-black/20 text-gray-300'
                      } ${isPassword ? 'opacity-80' : ''}`}
                      title={isPassword ? 'Password is always allowed implicitly.' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={checked || isPassword}
                        disabled={isPassword}
                        onChange={() => {
                          setFormAllowedAuthTypes((f) => {
                            if (!Array.isArray(f)) return f;
                            if (checked) {
                              return { ...f, allowed_auth_types: f.filter((x) => x !== p.id) };
                            }
                            return { ...f, allowed_auth_types: [...f, p.id] };
                          });
                        }}
                        className="accent-emerald-500"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{p.label}</span>
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500">{kindLabel}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              An explicit empty selection means this role can't enable any non-password authority on its own login.
            </p>
          </div>
          );
        })()}
      </div>
    </GlassField>
  );
};

export default RoleAuthorities;