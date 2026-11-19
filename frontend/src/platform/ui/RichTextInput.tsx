import React, { useEffect, useRef } from 'react';

interface Props {
  value: string;        // HTML
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

// Lightweight WYSIWYG using contentEditable + execCommand. Outputs HTML.
// Keep it simple — Bold, Italic, bullet list, ordered list, link, clear formatting.
const RichTextInput: React.FC<Props> = ({ value, onChange, placeholder, className }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external value into the editor only when it differs (avoids losing the cursor).
  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  const insertLink = () => {
    const url = window.prompt('Link URL:');
    if (!url) return;
    exec('createLink', url);
  };

  return (
    <div className={`rounded-md border border-gray-300 bg-white ${className || ''}`}>
      <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-md">
        <ToolBtn onClick={() => exec('bold')} title="Bold (⌘B)"><b>B</b></ToolBtn>
        <ToolBtn onClick={() => exec('italic')} title="Italic (⌘I)"><i>I</i></ToolBtn>
        <ToolBtn onClick={() => exec('underline')} title="Underline (⌘U)"><span className="underline">U</span></ToolBtn>
        <Sep />
        <ToolBtn onClick={() => exec('insertUnorderedList')} title="Bullet list">• List</ToolBtn>
        <ToolBtn onClick={() => exec('insertOrderedList')} title="Numbered list">1. List</ToolBtn>
        <Sep />
        <ToolBtn onClick={insertLink} title="Add link">Link</ToolBtn>
        <ToolBtn onClick={() => exec('removeFormat')} title="Clear formatting">Clear</ToolBtn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        onBlur={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
        className="prose prose-sm max-w-none px-3 py-2 min-h-[110px] focus:outline-none [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:text-blue-600 [&_a]:underline"
        data-placeholder={placeholder || ''}
      />
      <style>{`
        [contenteditable][data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};

const ToolBtn: React.FC<{ onClick: () => void; title?: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()} // keep focus / selection
    onClick={onClick}
    title={title}
    className="px-2 py-1 text-xs text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 hover:border-gray-400"
  >
    {children}
  </button>
);

const Sep: React.FC = () => <div className="w-px self-stretch bg-gray-300 mx-1" />;

export default RichTextInput;
