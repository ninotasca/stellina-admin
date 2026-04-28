import React, { useState } from 'react';
import type { CommissionNote } from '../types/commission';

interface Props {
  notes: CommissionNote[];
  onAdd: (body: string) => Promise<void>;
  onEdit?: (noteId: string, body: string) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
  /** Whether the parent already exists. If false, the input is disabled with a hint. */
  enabled: boolean;
  /** Hint shown when disabled. */
  disabledHint?: string;
  placeholder?: string;
  emptyHint?: string;
}

const fmtTs = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
    hour: 'numeric', minute: '2-digit',
  });
};

const initialOf = (note: CommissionNote): string => {
  const src = note.author_name || 'You';
  return src.charAt(0).toUpperCase();
};

const NoteFeed: React.FC<Props> = ({ notes, onAdd, onEdit, onDelete, enabled, disabledHint, placeholder, emptyHint }) => {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [editingBusy, setEditingBusy] = useState(false);

  // No <form> here — nested forms collapse and trigger the parent page form.
  const submit = async () => {
    if (!draft.trim() || !enabled || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAdd(draft.trim());
      setDraft('');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to add note');
    } finally {
      setSubmitting(false);
    }
  };

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  const startEdit = (n: CommissionNote) => {
    setEditingId(n.id);
    setEditingBody(n.body);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingBody('');
  };

  const commitEdit = async (note: CommissionNote) => {
    if (!onEdit || !editingBody.trim() || editingBusy) return;
    if (editingBody.trim() === note.body) { cancelEdit(); return; }
    setEditingBusy(true);
    setError(null);
    try {
      await onEdit(note.id, editingBody.trim());
      cancelEdit();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update note');
    } finally {
      setEditingBusy(false);
    }
  };

  const onEditKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, note: CommissionNote) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commitEdit(note); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  };

  const handleDelete = async (note: CommissionNote) => {
    if (!onDelete) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    try { await onDelete(note.id); }
    catch (err: any) { setError(err.response?.data?.detail || err.message || 'Failed to delete note'); }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Composer */}
      <div className="p-3 border-b border-gray-100 bg-gray-50/40 rounded-t-lg">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKey}
          disabled={!enabled || submitting}
          placeholder={enabled ? (placeholder || 'Add a note…') : (disabledHint || 'Disabled')}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{enabled ? '⌘/Ctrl+Enter to add' : ''}</span>
          <button
            type="button"
            onClick={submit}
            disabled={!enabled || submitting || !draft.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {submitting ? 'Adding…' : 'Add note'}
          </button>
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>

      {/* Feed */}
      <div className="p-3">
        {notes.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2 px-1">{emptyHint || 'No notes yet.'}</p>
        ) : (
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold px-1">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </div>
            {notes.map((n) => (
              <article
                key={n.id}
                className="group flex items-start gap-3 p-3 rounded-md bg-gray-50 border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white"
                  style={{ background: avatarColor(n.author_name || 'You') }}
                  aria-hidden
                >
                  {initialOf(n)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-900">{n.author_name || 'You'}</span>
                    <span className="text-[11px] text-gray-400">{fmtTs(n.created_at)}</span>
                    {n.id.startsWith('draft-') && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                        Pending — saves with event
                      </span>
                    )}
                  </div>

                  {editingId === n.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editingBody}
                        autoFocus
                        onChange={(e) => setEditingBody(e.target.value)}
                        onKeyDown={(e) => onEditKey(e, n)}
                        rows={Math.max(2, Math.min(8, editingBody.split('\n').length))}
                        className="w-full px-2 py-1.5 border border-blue-300 rounded text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[11px] text-gray-400 mr-auto">⌘/Ctrl+Enter to save · Esc to cancel</span>
                        <button type="button" onClick={cancelEdit}
                          className="px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900">Cancel</button>
                        <button type="button" onClick={() => commitEdit(n)}
                          disabled={editingBusy || !editingBody.trim()}
                          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                          {editingBusy ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap break-words">{n.body}</p>
                  )}
                </div>

                {editingId !== n.id && (onEdit || onDelete) && (
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 self-start text-[11px]">
                    {onEdit && (
                      <button type="button" onClick={() => startEdit(n)}
                        className="px-1.5 py-0.5 text-gray-500 hover:text-gray-900 rounded hover:bg-gray-100">
                        Edit
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => handleDelete(n)}
                        className="px-1.5 py-0.5 text-gray-500 hover:text-red-700 rounded hover:bg-red-50">
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function avatarColor(name: string): string {
  const palette = ['#4f46e5', '#0ea5e9', '#0891b2', '#059669', '#db2777', '#9333ea', '#ea580c'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default NoteFeed;
