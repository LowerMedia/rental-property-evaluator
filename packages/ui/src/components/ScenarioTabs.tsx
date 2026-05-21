import { useState, useRef, useEffect, useCallback } from 'react';
import { MAX_SCENARIOS, MIN_SCENARIOS, type Scenario } from '../state/scenarios';

interface ScenarioTabsProps {
  scenarios: Scenario[];
  activeIdx: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onRename: (idx: number, name: string) => void;
}

export function ScenarioTabs({
  scenarios,
  activeIdx,
  onSelect,
  onAdd,
  onRemove,
  onRename,
}: ScenarioTabsProps) {
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingIdx !== null) renameRef.current?.focus();
  }, [renamingIdx]);

  const startRename = useCallback((idx: number, currentName: string) => {
    setRenamingIdx(idx);
    setRenameValue(currentName);
  }, []);

  const commitRename = useCallback(
    (idx: number) => {
      if (renameValue.trim()) onRename(idx, renameValue.trim());
      setRenamingIdx(null);
    },
    [renameValue, onRename],
  );

  const handleRenameKey = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      if (e.key === 'Enter') commitRename(idx);
      if (e.key === 'Escape') setRenamingIdx(null);
    },
    [commitRename],
  );

  const canAdd = scenarios.length < MAX_SCENARIOS;
  const canRemove = scenarios.length > MIN_SCENARIOS;

  return (
    <div
      role="tablist"
      aria-label="Scenarios"
      className="flex items-end gap-0 border-b border-border overflow-x-auto shrink-0"
    >
      {scenarios.map((scenario, idx) => {
        const isActive = idx === activeIdx;
        return (
          <button
            key={scenario.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            id={`scenario-tab-${idx}`}
            className={`
              group relative flex items-center gap-1.5 px-3 py-2 shrink-0
              border-r border-border select-none
              transition-colors text-left
              ${isActive
                ? 'bg-surface border-b-2 border-b-accent -mb-px'
                : 'bg-base hover:bg-raised border-b border-b-border'
              }
            `}
            onClick={() => onSelect(idx)}
          >
            {/* Scenario name / rename input */}
            {renamingIdx === idx ? (
              <input
                ref={renameRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => handleRenameKey(e, idx)}
                onBlur={() => commitRename(idx)}
                onClick={(e) => e.stopPropagation()}
                className="
                  w-24 rounded border border-accent bg-input
                  px-1.5 py-0 text-xs text-hi focus:outline-none
                "
              />
            ) : (
              <span
                className={`text-xs truncate max-w-[7rem] ${isActive ? 'text-hi' : 'text-mid'}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(idx, scenario.name);
                }}
                title={`${scenario.name} — double-click to rename`}
              >
                {scenario.name}
              </span>
            )}

            {/* Remove button — visible on hover of active tab, always shown when >1 */}
            {canRemove && renamingIdx !== idx && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(idx);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(idx);
                  }
                }}
                className={`
                  rounded p-0.5 transition-colors shrink-0 cursor-pointer
                  ${isActive
                    ? 'text-lo hover:text-fail opacity-100'
                    : 'text-transparent group-hover:text-lo hover:!text-fail opacity-0 group-hover:opacity-100'
                  }
                `}
                title={`Remove ${scenario.name}`}
                aria-label={`Remove ${scenario.name}`}
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
            )}
          </button>
        );
      })}

      {/* Add scenario button */}
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="
            flex items-center justify-center px-3 py-2 shrink-0
            text-lo hover:text-accent hover:bg-raised
            border-b border-border transition-colors
          "
          title="Add scenario (clones current inputs)"
          aria-label="Add scenario"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}
