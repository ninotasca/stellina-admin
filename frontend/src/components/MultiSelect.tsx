import React, { useEffect, useRef, useState } from 'react';

export interface MultiSelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface Props<T extends string = string> {
  options: MultiSelectOption<T>[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  /** Label shown when nothing (= equivalent to "all") is selected */
  allLabel: string;
  /** Optional label, e.g., "Booking Status" */
  groupLabel?: string;
  className?: string;
}

function MultiSelect<T extends string = string>({
  options, selected, onChange, allLabel, groupLabel, className,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (v: T) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };

  const summary = selected.size === 0
    ? allLabel
    : selected.size === options.length
      ? allLabel
      : selected.size === 1
        ? options.find((o) => selected.has(o.value))?.label ?? allLabel
        : `${selected.size} selected`;

  return (
    <div className={`relative ${className || ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50 text-left"
      >
        <span className={selected.size === 0 ? 'text-gray-500' : 'text-gray-900'}>
          {summary}
        </span>
        <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
          {groupLabel && (
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{groupLabel}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => onChange(new Set())} className="text-[11px] text-gray-500 hover:text-gray-800">Clear</button>
                <button type="button" onClick={() => onChange(new Set(options.map((o) => o.value)))} className="text-[11px] text-blue-600 hover:underline">All</button>
              </div>
            </div>
          )}
          <ul className="max-h-64 overflow-auto py-1">
            {options.map((opt) => {
              const checked = selected.has(opt.value);
              return (
                <li key={opt.value}>
                  <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-800">{opt.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
