'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function MarkdownDialog({
  open,
  onClose,
  title = '说明',
  closeLabel = '关闭',
  children,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="markdown-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={event => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div className="markdown-dialog-shell">
        <header className="markdown-dialog-header">
          <div>
            <p className="eyebrow">Documentation</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="markdown-dialog-close" type="button" aria-label={`关闭${title}`} onClick={closeDialog}>
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="markdown-dialog-scroll">
          <article className="markdown-content">{children}</article>
        </div>
        <footer className="markdown-dialog-actions">
          <button className="action-button" type="button" onClick={closeDialog}>{closeLabel}</button>
        </footer>
      </div>
    </dialog>
  );
}
