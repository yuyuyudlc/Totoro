'use client';

import { useState } from 'react';
import MarkdownDialog from './MarkdownDialog';

export default function AnnouncementDialog({ children }) {
  const [open, setOpen] = useState(true);

  return (
    <MarkdownDialog open={open} onClose={() => setOpen(false)} title="公告" closeLabel="我知道了">
      {children}
    </MarkdownDialog>
  );
}
