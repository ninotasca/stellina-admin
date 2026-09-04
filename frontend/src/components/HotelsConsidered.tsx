import { getApiErrorMessage } from '../services/http';
import React, { useState } from 'react';
import type { HotelConsidered } from '../types/commission';

interface Props {
  hotels: HotelConsidered[];
  enabled: boolean;
  disabledHint?: string;
  onAdd: (name: string) => Promise<void>;
  onSelect: (hotelId: string) => Promise<void>;
  onRename: (hotelId: string, name: string) => Promise<void>;
  onRemove: (hotelId: string) => Promise<void>;
}

const HotelsConsidered: React.FC<Props> = ({ hotels, enabled, disabledHint, onAdd, onSelect, onRename, onRemove }) => {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // No <form> here — we live inside the page form and nested forms collapse
  // (the inner submit triggers the outer one and reloads the page).
  const submit = async () => {
    if (!enabled || !draft.trim() || submitting) return;
    setSubmitting(true); setError(null);
    try { await onAdd(draft.trim()); setDraft(''); }
    catch (err: any) { setError(getApiErrorMessage(err, 'Failed to add hotel')); }
    finally { setSubmitting(false); }
  };

  const startEdit = (h: HotelConsidered) => { setEditingId(h.id); setEditingValue(h.name); };
  const commitEdit = async () => {
    if (!editingId || !editingValue.trim()) { setEditingId(null); return; }
    try { await onRename(editingId, editingValue.trim()); }
    catch (err: any) { setError(getApiErrorMessage(err, 'Failed to rename')); }
    setEditingId(null);
  };

  const sorted = [...hotels].sort((a, b) => {
    if (a.is_selected !== b.is_selected) return a.is_selected ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          disabled={!enabled || submitting}
          placeholder={enabled ? 'Add a hotel candidate…' : (disabledHint || 'Disabled')}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!enabled || submitting || !draft.trim()}
          className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50"
        >
          + Add
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
        {sorted.length === 0 ? (
          <li className="px-3 py-3 text-xs text-gray-400 italic">No hotels added yet.</li>
        ) : sorted.map((h) => (
          <li
            key={h.id}
            className={`flex items-center gap-3 px-3 py-2.5 ${h.is_selected ? 'bg-emerald-50/40' : ''}`}
          >
            {/* Selected indicator (radio-style, one of many) */}
            <button
              type="button"
              onClick={() => !h.is_selected && onSelect(h.id)}
              title={h.is_selected ? 'Selected hotel' : 'Mark as selected'}
              className={`relative w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                h.is_selected
                  ? 'bg-emerald-600 ring-2 ring-emerald-200'
                  : 'border-2 border-gray-300 hover:border-emerald-500'
              }`}
            >
              {h.is_selected && (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Name (click to rename) */}
            {editingId === h.id ? (
              <input
                type="text" autoFocus value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                  else if (e.key === 'Escape') setEditingId(null);
                }}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              />
            ) : (
              <button
                type="button"
                onClick={() => startEdit(h)}
                className={`flex-1 text-left text-sm ${h.is_selected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
              >
                {h.name}
              </button>
            )}

            {h.is_selected ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-700 font-semibold px-1.5 py-0.5 bg-emerald-100 rounded">
                Selected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onSelect(h.id)}
                className="text-[11px] text-gray-500 hover:text-emerald-700 hover:underline"
              >
                Select
              </button>
            )}

            <button
              type="button"
              onClick={() => onRemove(h.id)}
              title="Remove"
              className="text-gray-300 hover:text-red-500 px-1 text-base leading-none"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HotelsConsidered;
