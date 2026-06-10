/**
 * E11 — organization switcher (RPE-96): current-org selector over the
 * user's memberships; persists the selection for the X-Org-Id
 * convention (RPE-94). Hidden when the user has fewer than two orgs.
 */

import { useId } from 'react';
import { useAuth } from '../../state/AuthContext';

export function OrgSwitcher() {
  const { orgs, currentOrgId, switchOrg } = useAuth();
  const id = useId();

  if (orgs.length === 0) return null;
  if (orgs.length === 1) {
    return <p className="text-xs text-lo">Organization: {orgs[0]!.name}</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-mid">
        Organization
      </label>
      <select
        id={id}
        value={currentOrgId ?? ''}
        onChange={(e) => switchOrg(e.target.value)}
        className="rounded border border-border bg-surface px-2 py-1 text-xs text-hi"
      >
        {orgs.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
    </div>
  );
}
