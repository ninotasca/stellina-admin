import { getApiErrorMessage } from '../services/http';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import DOMPurify from 'isomorphic-dompurify';
import {
  cventTrackerApi,
  type CventCell,
  type CventCellPatch,
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

  if (c) {
    if (c.font_italic) style.fontStyle = 'italic';
    // Red flag wins over any other color.
    if (c.is_red_flagged) {
      style.color = '#dc2626';  // tailwind red-600
    } else {
      const fg = argbToCss(c.font_color);
      if (fg && fg !== '#FF000000' && fg !== 'rgba(0, 0, 0, 1.000)') {
        style.color = fg;
      }
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
        if (!cancelled) setError(getApiErrorMessage(e, 'Failed to load'));
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
            onClick={() => navigate(`/commissions/${eventId}/hotel-comparison`)}
            className="text-sm text-blue-600 hover:underline shrink-0"
          >
            ← Back to Hotel Comparison Summary
          </button>
          <span className="text-gray-400 shrink-0">/</span>
          <h1 className="text-base font-semibold text-gray-900 truncate">
            Hotel Comparison Summary
          </h1>
          <span className="text-gray-400 shrink-0">·</span>
          <span className="text-sm text-gray-500 shrink-0">{upload.original_filename} · {formatDateTime(upload.uploaded_at)}</span>
        </div>

        {/* File-kind badge: replaces the old render-mode toggle. */}
        <span
          className={`px-2 py-0.5 text-[10px] font-medium rounded shrink-0 ${
            upload.source === 'master'
              ? 'bg-amber-200 text-amber-800'
              : 'bg-gray-200 text-gray-700'
          }`}
        >
          {upload.source === 'master' ? 'EDITABLE SUMMARY' : 'SOURCE UPLOAD · read-only'}
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
        {activeSheet ? (
          <SheetGrid
            sheet={activeSheet}
            mode={viewMode}
            editable={upload.source === 'master'}
            onCellSaved={(saved) => {
              // Splice the updated cell back into local state so re-renders
              // show the change without a full reload.
              setUpload((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  sheets: prev.sheets.map((s) => {
                    if (s.id !== activeSheet.id) return s;
                    const others = s.cells.filter(
                      (c) => !(c.row_idx === saved.row_idx && c.col_idx === saved.col_idx),
                    );
                    return {
                      ...s,
                      cells: [...others, saved],
                      max_row: Math.max(s.max_row, saved.row_idx),
                      max_col: Math.max(s.max_col, saved.col_idx),
                      cell_count: others.length + 1,
                    };
                  }),
                };
              });
            }}
            saveCell={(rowIdx, colIdx, patch) =>
              cventTrackerApi.patchCell(eventId!, upload.id, activeSheet.id, rowIdx, colIdx, patch)
            }
          />
        ) : (
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
  editable: boolean;
  saveCell: (rowIdx: number, colIdx: number, patch: CventCellPatch) => Promise<CventCell>;
  onCellSaved: (saved: CventCell) => void;
}

const ROW_HEADER_W = 48;   // px
const CELL_MIN_W   = 120;  // px
const CELL_MAX_W   = 320;  // px

const SheetGrid: React.FC<SheetGridProps> = ({ sheet, mode, editable, saveCell, onCellSaved }) => {
  // Track which cell (if any) is currently in edit mode.
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  // Extra blank rows added via the "+ Add row" button — purely local until
  // the user actually types something into one (at which point the cell
  // persists and bumps the sheet's max_row).
  const [extraRows, setExtraRows] = useState(0);
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

  const rows = Math.max(sheet.max_row + extraRows, 1);
  const cols = Math.max(sheet.max_col, 1);

  return (
    <div>
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
              const isActive = editable && activeCell?.row === r && activeCell?.col === c;
              const baseStyle: React.CSSProperties = {
                minWidth: CELL_MIN_W,
                maxWidth: CELL_MAX_W,
                ...cellStyle(cell, r, c, sheet.kind, mode),
              };
              return (
                <td
                  key={c}
                  className={`border-r border-b border-gray-200 px-2 py-1 align-top whitespace-pre-wrap break-words ${
                    editable && !isActive ? 'cursor-text hover:outline hover:outline-1 hover:outline-blue-400' : ''
                  } ${cell?.is_user_edited ? 'relative' : ''}`}
                  style={baseStyle}
                  onDoubleClick={() => {
                    if (editable && !isActive) setActiveCell({ row: r, col: c });
                  }}
                >
                  {isActive ? (
                    <EditableCell
                      initial={cell}
                      onSave={async (patch) => {
                        const saved = await saveCell(r, c, patch);
                        onCellSaved(saved);
                      }}
                      onExit={() => setActiveCell(null)}
                    />
                  ) : (
                    <>
                      <CellContent cell={cell} />
                      {cell?.is_user_edited && (
                        <span
                          className="absolute top-0 right-0 w-1.5 h-1.5 bg-amber-500 rounded-bl"
                          title="Edited"
                        />
                      )}
                    </>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
    {editable && (
      <div className="px-2 py-2 border-t border-gray-200 bg-gray-50 sticky bottom-0">
        <button
          type="button"
          onClick={() => {
            const newRow = sheet.max_row + extraRows + 1;
            setExtraRows((n) => n + 1);
            // Open the first cell of the new row for editing.
            setTimeout(() => setActiveCell({ row: newRow, col: 1 }), 0);
          }}
          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-100"
        >
          + Add row
        </button>
      </div>
    )}
    </div>
  );
};

// ---------- Cell render (read mode) ----------

// Whitelist for DOMPurify — TipTap's StarterKit+Link emits these tags.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'strong', 'b', 'em', 'i', 'a', 'br', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
};

const CellContent: React.FC<{ cell: CventCell | undefined }> = ({ cell }) => {
  if (!cell) return null;
  if (cell.value_html) {
    const clean = DOMPurify.sanitize(cell.value_html, SANITIZE_CONFIG);
    return <span dangerouslySetInnerHTML={{ __html: clean }} />;
  }
  if (cell.link_url && cell.value) {
    return (
      <a
        href={cell.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline"
        onClick={(e) => e.stopPropagation()}
      >
        {cell.value}
      </a>
    );
  }
  return <>{cell.value ?? ''}</>;
};

// ---------- Editable cell (TipTap rich text) ----------

interface EditableCellProps {
  initial: CventCell | undefined;
  onSave: (patch: CventCellPatch) => Promise<void>;
  onExit: () => void;
}

const AUTOSAVE_MS = 600;

// Treat empty/whitespace-only paragraphs as "no rich text" — that way
// we don't store a stray `<p></p>` for plain-text cells.
const isEmptyHtml = (html: string): boolean => {
  const stripped = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
  return stripped.length === 0;
};

// True when the HTML contains any inline formatting (bold/italic/link). If
// not, we save just `value` and clear value_html — keeps the DB tidy.
const hasFormatting = (html: string): boolean => /<(strong|b|em|i|a)\b/i.test(html);

const EditableCell: React.FC<EditableCellProps> = ({ initial, onSave, onExit }) => {
  const [redFlag, setRedFlag] = useState<boolean>(initial?.is_red_flagged ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const exitingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Cell editing — strip block elements we don't want.
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: initial?.value_html || initial?.value || '',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[1.25rem]',
      },
    },
    onUpdate: () => {
      scheduleSave();
    },
  });

  // Focus + select-all when the editor mounts.
  useEffect(() => {
    if (!editor) return;
    editor.commands.focus('end');
    editor.commands.selectAll();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [editor]);

  const buildPatch = useCallback((): CventCellPatch => {
    if (!editor) return {};
    const html = editor.getHTML();
    const plain = editor.getText();
    const formatted = !isEmptyHtml(html) && hasFormatting(html);
    return {
      value: plain,
      value_html: formatted ? html : null,
      is_red_flagged: redFlag,
    };
  }, [editor, redFlag]);

  const flush = useCallback(async () => {
    if (!editor) return;
    const patch = buildPatch();
    // No-op detection: skip the round-trip if nothing changed vs initial.
    const initialPlain = initial?.value ?? '';
    const initialHtml = initial?.value_html ?? null;
    const initialFlag = initial?.is_red_flagged ?? false;
    const unchanged =
      patch.value === initialPlain &&
      (patch.value_html ?? null) === initialHtml &&
      patch.is_red_flagged === initialFlag;
    if (unchanged) return;
    setSaving(true);
    try {
      await onSave(patch);
      setError(null);
    } catch (e: any) {
      setError(getApiErrorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }, [editor, buildPatch, initial, onSave]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  }, [flush]);

  // Toggling the red flag is an immediate save.
  const toggleRedFlag = useCallback(() => {
    setRedFlag((v) => !v);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    // Defer one tick so the latest redFlag is in the closure.
    setTimeout(() => { void flush(); }, 0);
  }, [flush]);

  const addOrEditLink = useCallback(() => {
    if (!editor) return;
    const current = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (leave blank to remove):', current ?? '');
    if (url === null) return; // canceled
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    scheduleSave();
  }, [editor, scheduleSave]);

  if (!editor) return null;

  return (
    <div className="relative -mx-2 -my-1">
      {/* Floating toolbar */}
      <div
        className="absolute -top-9 left-0 z-40 flex gap-0.5 bg-white border border-gray-300 rounded shadow px-1 py-0.5"
        onMouseDown={(e) => e.preventDefault()}  // keep focus on editor
      >
        <ToolbarBtn
          active={editor.isActive('bold')}
          onClick={() => { editor.chain().focus().toggleBold().run(); scheduleSave(); }}
          title="Bold (Cmd/Ctrl+B)"
        ><strong>B</strong></ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('italic')}
          onClick={() => { editor.chain().focus().toggleItalic().run(); scheduleSave(); }}
          title="Italic (Cmd/Ctrl+I)"
        ><em>I</em></ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('link')}
          onClick={addOrEditLink}
          title="Add / edit link"
        >🔗</ToolbarBtn>
        <span className="mx-1 border-r border-gray-200" />
        <ToolbarBtn
          active={redFlag}
          onClick={toggleRedFlag}
          title="Flag this value (turns text red)"
        >
          <span className={redFlag ? 'text-red-600' : 'text-gray-600'}>⚑</span>
        </ToolbarBtn>
      </div>

      <div
        className={`px-2 py-1 outline-none ring-2 ring-blue-500 ring-inset bg-white ${
          redFlag ? 'text-red-600' : ''
        }`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            exitingRef.current = true;
            onExit();
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            exitingRef.current = true;
            void flush().then(onExit);
          }
        }}
        onBlur={async (e) => {
          // Ignore blurs that go to the toolbar (we mousedown-prevent-default
          // there but a programmatic focus elsewhere can still trigger blur).
          const next = e.relatedTarget as HTMLElement | null;
          if (next && next.closest && next.closest('[data-toolbar]')) return;
          if (exitingRef.current) return;
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          await flush();
          onExit();
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {(saving || error) && (
        <span className={`absolute -top-5 right-0 text-[10px] px-1 rounded ${
          error ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
        }`}>
          {error ? `error: ${error}` : 'saving…'}
        </span>
      )}
    </div>
  );
};

const ToolbarBtn: React.FC<{
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, children }) => (
  <button
    type="button"
    data-toolbar
    onClick={onClick}
    title={title}
    className={`px-1.5 py-0.5 text-xs rounded ${
      active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
    }`}
  >
    {children}
  </button>
);

export default CventUploadView;
