import React, { useMemo } from 'react';
import { SearchableSelect } from '@/shared/components/ui/SearchableSelect';
import { COUNTRIES, countryByCode, type CountryRow } from './countries';

// LocationField — the panel's "where does this edge physically live" picker.
//
// Composed of two inputs rendered side-by-side so the operator can spell
// out a country + a free-text site label without cramming both into a
// single string (which would break search). The single-line layout places
// the country picker first (it carries the flag + name so the eye lands
// there) and the site-name text input immediately after, mirroring the
// `[🇮🇳 India] [node-1]` shape the operator intuitively reads.
//
// Values are kept separate on the wire too: the panel persists
// `location_country` (ISO-3166 alpha-2) and `location_node` (free text)
// as two columns so a rename/move only touches one. This component just
// surfaces that pair in the form.
export interface LocationFieldProps {
  /** ISO-3166 alpha-2 code ("IN", "US", …). Empty string = none. */
  country: string;
  onCountryChange: (code: string) => void;
  /** Free-text site label ("node-1", "rack-a3", …). */
  node: string;
  onNodeChange: (label: string) => void;
  /** Optional input id so an outer <label htmlFor=...> works for a11y. */
  nodeId?: string;
}

const LocationField: React.FC<LocationFieldProps> = ({
  country,
  onCountryChange,
  node,
  onNodeChange,
  nodeId = 'location_node',
}) => {
  // SearchableSelect takes a numeric / string value with 0/"" meaning
  // "nothing selected" — country code "" already satisfies that, so we
  // pass it through unchanged.
  const options = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        value: c.code,
        label: `${c.flag}  ${c.name}`,
        keywords: c.keywords,
      })),
    [],
  );

  const selected = country ? countryByCode(country) : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Country picker — search + flag/name list. */}
      <div>
        <label className="block text-sm font-medium text-gray-200 mb-1">
          Location — Country
        </label>
        <SearchableSelect
          options={options}
          value={country || ''}
          onChange={(v) => onCountryChange(String(v))}
          placeholder="Search country…"
          emptyMessage="No country matches"
          groupLabel="Countries"
          renderRow={(opt) => {
            const row: CountryRow | undefined = countryByCode(String(opt.value));
            return (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">{row?.flag ?? '🏳️'}</span>
                <span className="truncate flex-1">{row?.name ?? opt.label}</span>
                {row?.code && (
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">{row.code}</span>
                )}
              </div>
            );
          }}
        />
      </div>

      {/* Site label — free text. The placeholder shifts along with the
          picked country so the operator sees an example that matches it
          ("India: node-1", "United States: aws-us-east-1", …) — a small
          affordance that the two inputs are part of the same location. */}
      <div>
        <label htmlFor={nodeId} className="block text-sm font-medium text-gray-200 mb-1">
          Location — Site / Node label
        </label>
        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-md px-3 py-1.5 focus-within:border-white/40 transition-colors">
          {/* Selected-country chip — `[🇮🇳 India]` preview. Greys out
              when no country is picked so the operator still sees that
              the picker is empty (vs the input being the country). */}
          {selected ? (
            <span
              className="inline-flex items-center gap-1.5 shrink-0 text-sm text-gray-200 pr-2 border-r border-white/10"
              title={`${selected.name} (${selected.code})`}
            >
              <span className="text-base leading-none">{selected.flag}</span>
              <span className="truncate max-w-[8rem]">{selected.name}</span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 shrink-0 text-sm text-gray-600 pr-2 border-r border-white/10"
              title="No country selected"
            >
              <span className="text-base leading-none">🏳️</span>
              <span>—</span>
            </span>
          )}
          <input
            id={nodeId}
            value={node}
            onChange={(e) => onNodeChange(e.target.value)}
            placeholder={selected ? `${selected.name}: node-1` : 'e.g. node-1 / rack-a3'}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-w-0"
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
};

export default LocationField;
