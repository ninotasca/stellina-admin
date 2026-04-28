import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface NimbleSelection {
  id: string | null;
  name: string;
  email?: string | null;
}

export interface PickerItem {
  id: string;
  label: string;
  sublabel?: string;
  email?: string | null;
}

interface Props {
  items: PickerItem[];
  loading?: boolean;
  loadingHint?: string;
  emptyHint?: string;
  disabled?: boolean;
  value: NimbleSelection;
  onChange: (v: NimbleSelection) => void;
  placeholder?: string;
  inputId?: string;
  maxResults?: number;
}

const MATCH_LIMIT_DEFAULT = 1000;

const NimbleTypeahead: React.FC<Props> = ({
  items,
  loading,
  loadingHint,
  emptyHint,
  disabled,
  value,
  onChange,
  placeholder,
  inputId,
  maxResults = MATCH_LIMIT_DEFAULT,
}) => {
  const [text, setText] = useState(value.name || '');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => { setText(value.name || ''); }, [value.name]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    if (!items || items.length === 0) return [];
    const q = text.trim().toLowerCase();
    if (!q || q === (value.name || '').toLowerCase()) {
      return items.slice(0, maxResults);
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    const out: { item: PickerItem; score: number }[] = [];
    for (const it of items) {
      const hay = `${it.label} ${it.sublabel || ''} ${it.email || ''}`.toLowerCase();
      let score = 0;
      let allMatch = true;
      for (const t of tokens) {
        const idx = hay.indexOf(t);
        if (idx < 0) { allMatch = false; break; }
        // earlier matches score higher; prefix match on label is best
        score += 100 - Math.min(50, idx);
        if (it.label.toLowerCase().startsWith(t)) score += 50;
      }
      if (allMatch) out.push({ item: it, score });
    }
    out.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
    return out.slice(0, maxResults).map((x) => x.item);
  }, [items, text, value.name, maxResults]);

  const onTextChange = (next: string) => {
    setText(next);
    setActiveIdx(-1);
    setOpen(true);
    if (next !== value.name) onChange({ id: null, name: next, email: value.email ?? null });
  };

  const select = (it: PickerItem) => {
    onChange({ id: it.id, name: it.label, email: it.email ?? null });
    setText(it.label);
    setOpen(false);
  };

  const onClear = () => {
    setText('');
    onChange({ id: null, name: '', email: null });
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(filtered[activeIdx]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const showAttachedBadge = !!value.id && value.name === text;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={text}
          disabled={disabled}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={loading ? loadingHint || 'Loading from Nimble…' : placeholder}
          className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-md text-sm disabled:bg-gray-50 disabled:text-gray-400"
          autoComplete="off"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
          {loading && <span className="text-xs text-gray-400">…</span>}
          {showAttachedBadge && (
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-800 rounded" title="Linked to Nimble">Nimble</span>
          )}
        </div>
        {text && !disabled && (
          <button type="button" onClick={onClear} title="Clear"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 px-1 text-base leading-none">×</button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-auto text-sm">
          {loading ? (
            <div className="px-3 py-3 text-xs text-gray-500">{loadingHint || 'Loading from Nimble…'}</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500">{emptyHint || 'Nothing to pick from.'}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500">No matches — your typed value will be saved as-is.</div>
          ) : (
            <ul>
              {filtered.map((it, idx) => (
                <li key={it.id}
                  onMouseDown={(e) => { e.preventDefault(); select(it); }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`px-3 py-2 cursor-pointer ${idx === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <div className="font-medium text-gray-900 truncate">{it.label}</div>
                  {it.sublabel && <div className="text-xs text-gray-500 truncate">{it.sublabel}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NimbleTypeahead;
