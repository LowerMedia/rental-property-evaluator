import { useState, useCallback } from 'react';
import type { DealInputs } from '@rpe/engine';
import {
  loadStore,
  persistStore,
  type SavedDeal,
  type SavedDealsStore,
} from '../state/savedDealsSchema';

// ─── ID generation ────────────────────────────────────────────────────────────

function generateId(): string {
  return `deal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface UseSavedDealsReturn {
  /** All saved deals, newest-first. */
  deals: SavedDeal[];
  /** Create a new named deal snapshot. Returns the new SavedDeal. */
  save: (name: string, inputs: DealInputs) => SavedDeal;
  /** Replace an existing deal's inputs in-place (keeps name, updates savedAt). */
  overwrite: (id: string, inputs: DealInputs) => void;
  /** Rename an existing deal. No-op if id is unknown. */
  rename: (id: string, name: string) => void;
  /** Delete a saved deal by id. No-op if id is unknown. */
  remove: (id: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSavedDeals(): UseSavedDealsReturn {
  const [store, setStore] = useState<SavedDealsStore>(() => loadStore());

  /** Apply an update function and sync to localStorage in one step. */
  const persist = useCallback(
    (updater: (prev: SavedDealsStore) => SavedDealsStore) => {
      setStore((prev) => {
        const next = updater(prev);
        persistStore(next);
        return next;
      });
    },
    [],
  );

  const save = useCallback(
    (name: string, inputs: DealInputs): SavedDeal => {
      const deal: SavedDeal = {
        id: generateId(),
        name: name.trim() || 'Untitled Deal',
        savedAt: Date.now(),
        inputs,
      };
      persist((prev) => ({ ...prev, deals: [deal, ...prev.deals] }));
      return deal;
    },
    [persist],
  );

  const overwrite = useCallback(
    (id: string, inputs: DealInputs) => {
      persist((prev) => ({
        ...prev,
        deals: prev.deals.map((d) =>
          d.id === id ? { ...d, inputs, savedAt: Date.now() } : d,
        ),
      }));
    },
    [persist],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      persist((prev) => ({
        ...prev,
        deals: prev.deals.map((d) => (d.id === id ? { ...d, name: trimmed } : d)),
      }));
    },
    [persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist((prev) => ({
        ...prev,
        deals: prev.deals.filter((d) => d.id !== id),
      }));
    },
    [persist],
  );

  return { deals: store.deals, save, overwrite, rename, remove };
}
