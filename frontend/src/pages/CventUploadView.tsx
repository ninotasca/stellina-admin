import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  cventTrackerApi,
  type CventCell,
  type CventSheetWithCells,
  type CventUploadDetail,
} from '../services/cventTrackerApi';

// A1-style column label: 1 -> A, 27 -> AA, etc.
const colLetter = (n: number): string => {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// openpyxl gives us 8-char ARGB hex (e.g. "FF1A2026"). Convert to CSS rgba
// since we want to silently no-op fully-transparent fills (alpha = 00).
const argbToCss = (argb: string | null): string | null => {
  if (!argb) return null;
  const v = argb.trim().toUpperCase();
  if (v.length === 8) {
    const a = parseInt(v.slice(0, 2), 16);
    if (Number.isNaN(a)) return null;
    if (a === 0) return null;
    const r = parseInt(v.slice(2, 4), 16);
    const g = parseInt(v.slice(4, 6), 16);
    const b = parseInt(v.slice(6, 8), 16);
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  }
  if (v.length === 6) return `#${v}`;
  return null;
};

// ---------- Cell styling: Cvent original vs Master template ----------

type ViewMode = 'master' | 'cvent';

// Master style constants (mirrors Raffy's hand-cleaned template).
const MASTER_FONT = "Tahoma, 'Helvetica Neue', Arial, sans-serif";
const MASTER_FONT_SIZE_PX = 12;       // 10pt -> 12px-ish; readable on web
const MASTER_HEADER_FILL = '#B6D7A8'; // green: header row
const MASTER_FIRST_COL_FILL = '#D9EAD3'; // pale green: first column data cells

// Header rows are conventionally row 3 on Summary, row 4 on destination
// tabs (after the title + dates + section banner in destination files).
const HEADER_ROW: Record<'summary' | 'destination', number> = {
  summary: 3,
  destination: 4,
};

// First data row is the line immediately after the header row.
const firstDataRow = (kind: 'summary' | 'destination'): number => HEADER_ROW[kind] + 1;

const cventCellStyle = (c: CventCell | undefined): React.CSSProperties => {
  if (!c) return {};
  const style: React.CSSProperties = {};
  if (c.font_bold) style.fontWeight = 600;
  if (c.font_italic) style.fontStyle = 'italic';
  const fg = argbToCss(c.font_color);
  if (fg) style.color = fg;
  const bg = argbToCss(c.fill_color);
  if (bg) style.backgroundColor = bg;
  return style;
};

const masterCellStyle = (
  c: CventCell | undefined,
  row: number,
  col: number,
  kind: 'summary' | 'destination',
): React.CSSProperties => {
  const style: React.CSSProperties = {
    fontFamily: MASTER_FONT,
    fontSize: MASTER_FONT_SIZE_PX,
  };
  const headerRow = HEADER_ROW[kind];
  const isHeaderRow = row === headerRow;
  const isFirstCol = col === 1 && row >= firstDataRow(kind);

  if (isHeaderRow) {
    style.backgroundColor = MASTER_HEADER_FILL;
    style.fontWeight = 700;
  } else if (isFirstCol) {
    style.backgroundColor = MASTER_FIRST_COL_FILL;
    style.fontWeight = 600;
  }

  // Preserve user-applied highlights — italic stays, and any non-black
  // custom font color (e.g. Raffy's red on flagged dates) carries through.
  if (c) {
    if (c.font_italic) style.fontStyle = 'italic';
    const fg = argbToCss(c.font_color);
    if (fg && fg !== '#FF000000' && fg !== 'rgba(0, 0, 0, 1.000)') {
      style.color = fg;
    }
  }
  return style;
};

const cellStyle = (
  c: CventCell | undefined,
  row: number,
  col: number,
  kind: 'summary' | 'destination',
  mode: ViewMode,
): React.CSSProperties =>
  mode === 'master'
    ? masterCellStyle(c, row, col, kind)
    : cventCellStyle(c);

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });


const CventUploadView: React.FC = () => {
  const { id: eventId, uploadId } = useParams<{ id: string; uploadId: string }>();
  const navigate = useNavigate();

  const [upload, setUpload] = useState<CventUploadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  // Render mode is intrinsic to the upload now: master uploads get the
  // Master template; cvent originals render with their raw cell styles.
  const viewMode: ViewMode = upload?.source === 'master' ? 'master' : 'cvent';

  useEffect(() => {
    if (!eventId || !uploadId) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await cventTrackerApi.getUpload(eventId, uploadId);
        if (cancelled) return;
        setUpload(res);
        setActiveSheetId(res.sheets[0]?.id ?? null);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.detail || e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, uploadId]);

  const activeSheet = useMemo(
    () => upload?.sheets.find((s) => s.id === activeSheetId) ?? null,
    [upload, activeSheetId],
  );

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
        <button onClick={() => navigate(`/commissions/${eventId}`)} className="mt-4 text-sm text-blue-600 hover:underline">
          ← Back to booking
        </button>
      </div>
    );
  }
  if (!upload) return null;

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <button
            onClick={() => navigate(`/commissions/${eventId}`)}
            className="text-sm text-blue-600 hover:underline shrink-0"
          >
            ← Back to booking
          </button>
          <span className="text-gray-400 shrink-0">/</span>
          <h1 className="text-base font-semibold text-gray-900 truncate">
            {upload.original_filename}
          </h1>
          <span className="text-gray-400 shrink-0">·</span>
          <span className="text-sm text-gray-500 shrink-0">{formatDateTime(upload.uploaded_at)}</span>
        </div>

        {/* File-kind badge: replaces the old render-mode toggle. */}
        <span
          className={`px-2 py-0.5 text-[10px] font-medium rounded shrink-0 ${
            upload.source === 'master'
              ? 'bg-amber-200 text-amber-800'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          {upload.source === 'master' ? 'MASTER · editable' : 'CVENT ORIGINAL · read-only'}
        </span>
      </header>

      {/* Sheet tabs */}
      <nav className="bg-white border-b border-gray-200 px-2 shrink-0">
        <div className="flex gap-0 overflow-x-auto">
          {upload.sheets.map((s) => {
            const active = s.id === activeSheetId;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSheetId(s.id)}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-700 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {s.name}
                <span className="ml-1.5 text-[10px] text-gray-400 tabular-nums">
                  {s.cell_count}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-white">
        {activeSheet ? <SheetGrid sheet={activeSheet} mode={viewMode} /> : (
          <div className="p-8 text-sm text-gray-500">This upload has no sheets.</div>
        )}
      </div>
    </div>
  );
};

// ---------- Grid ----------

interface SheetGridProps {
  sheet: CventSheetWithCells;
  mode: ViewMode;
}

const ROW_HEADER_W = 48;   // px
const CELL_MIN_W   = 120;  // px
const CELL_MAX_W   = 320;  // px

const SheetGrid: React.FC<SheetGridProps> = ({ sheet, mode }) => {
  // Build a row × col lookup: cellMap[row][col] = CventCell
  const cellMap = useMemo(() => {
    const m = new Map<number, Map<number, CventCell>>();
    for (const c of sheet.cells) {
      let row = m.get(c.row_idx);
      if (!row) { row = new Map(); m.set(c.row_idx, row); }
      row.set(c.col_idx, c);
    }
    return m;
  }, [sheet]);

  const rows = Math.max(sheet.max_row, 1);
  const cols = Math.max(sheet.max_col, 1);

  return (
    <table className="border-separate border-spacing-0 text-xs font-sans">
      <thead>
        <tr>
          {/* Top-left corner */}
          <th
            className="sticky top-0 left-0 z-30 bg-gray-100 border-r border-b border-gray-300"
            style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W }}
          />
          {Array.from({ length: cols }, (_, i) => i + 1).map((c) => (
            <th
              key={c}
              className="sticky top-0 z-20 bg-gray-100 border-r border-b border-gray-300 px-2 py-1 text-center text-[10px] font-medium text-gray-500"
              style={{ minWidth: CELL_MIN_W, maxWidth: CELL_MAX_W }}
            >
              {colLetter(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => i + 1).map((r) => (
          <tr key={r}>
            <th
              className="sticky left-0 z-10 bg-gray-100 border-r border-b border-gray-300 px-2 py-1 text-center text-[10px] font-medium text-gray-500 tabular-nums"
              style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W }}
            >
              {r}
            </th>
            {Array.from({ length: cols }, (_, i) => i + 1).map((c) => {
              const cell = cellMap.get(r)?.get(c);
              return (
                <td
                  key={c}
                  className="border-r border-b border-gray-200 px-2 py-1 align-top whitespace-pre-wrap break-words"
                  style={{
                    minWidth: CELL_MIN_W,
                    maxWidth: CELL_MAX_W,
                    ...cellStyle(cell, r, c, sheet.kind, mode),
                  }}
                >
                  {cell?.value ?? ''}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default CventUploadView;
