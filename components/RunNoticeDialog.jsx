'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const NOTICE_PATH = '/notices/bulk-run.md';
const PROFILE_URL = 'https://space.bilibili.com/434334701';

function renderInlineMarkdown(text, onProfileLinkClick) {
  const parts = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push(<strong key={parts.length}>{match[2]}</strong>);
    } else if (match[4] && match[5]) {
      const href = match[5];
      const isProfileLink = href === PROFILE_URL;
      parts.push(
        <a
          key={parts.length}
          href={href}
          target="_blank"
          rel="noreferrer"
          className={isProfileLink ? 'profile-link' : undefined}
          onClick={isProfileLink ? onProfileLinkClick : undefined}
        >
          {match[4]}
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function MarkdownNotice({ markdown, onProfileLinkClick }) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let listItems = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length) {
      blocks.push({ type: 'ul', items: listItems });
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'img', alt: image[1], src: image[2] });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h2', text: trimmed.slice(3) });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h1', text: trimmed.slice(2) });
      continue;
    }

    if (/^- /.test(trimmed)) {
      flushParagraph();
      listItems.push(trimmed.slice(2));
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return (
    <div className="notice-markdown">
      {blocks.map((block, index) => {
        if (block.type === 'h1') {
          return <h1 key={index}>{renderInlineMarkdown(block.text, onProfileLinkClick)}</h1>;
        }
        if (block.type === 'h2') {
          return <h2 key={index}>{renderInlineMarkdown(block.text, onProfileLinkClick)}</h2>;
        }
        if (block.type === 'p') {
          return <p key={index}>{renderInlineMarkdown(block.text, onProfileLinkClick)}</p>;
        }
        if (block.type === 'img') {
          return <img key={index} src={block.src} alt={block.alt} />;
        }
        return (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInlineMarkdown(item, onProfileLinkClick)}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}

export default function RunNoticeDialog({
  open,
  onClose,
  onConfirm,
  requireProfileClick = false,
}) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasReachedBottom, setHasReachedBottom] = useState(false);
  const [hasClickedProfile, setHasClickedProfile] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const timer = window.setTimeout(() => {
      setHasReachedBottom(false);
      setHasClickedProfile(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || markdown || loading) return undefined;

    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(NOTICE_PATH, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`公告加载失败: ${response.status}`);
          return response.text();
        })
        .then((content) => {
          setMarkdown(content);
        })
        .catch(() => {
          setMarkdown('# 关注七海Nana7mi！！！\n\n公告暂时加载失败，请确认后继续操作。');
        })
        .finally(() => {
          setLoading(false);
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loading, markdown, open]);

  useEffect(() => {
    if (!open || loading || !markdown || !scrollRef.current || !bottomRef.current) return undefined;

    const scrollElement = scrollRef.current;
    const bottomElement = bottomRef.current;

    if (scrollElement.scrollHeight <= scrollElement.clientHeight + 2) {
      const timer = window.setTimeout(() => setHasReachedBottom(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasReachedBottom(true);
        }
      },
      {
        root: scrollElement,
        threshold: 1,
      }
    );

    observer.observe(bottomElement);
    return () => observer.disconnect();
  }, [loading, markdown, open]);

  if (!open) return null;

  const canContinue = hasReachedBottom && (!requireProfileClick || hasClickedProfile);
  const pendingRequirements = [
    !hasReachedBottom ? '滑到公告底部' : null,
    requireProfileClick && !hasClickedProfile ? '点击七海Nana7mi 的主页链接' : null,
  ].filter(Boolean);
  const noticeHint = canContinue
    ? '已满足条件，可以继续跑步'
    : `请先${pendingRequirements.join('，并')}`;

  const handleContinue = () => {
    if (canContinue) onConfirm();
  };

  const handleProfileLinkClick = () => {
    setHasClickedProfile(true);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="notice-dialog" role="dialog" aria-modal="true" aria-label="跑步公告">
        <button className="notice-close" onClick={onClose} type="button" aria-label="关闭公告">
          <X size={22} />
        </button>
        <div className="notice-scroll" ref={scrollRef}>
          {loading ? (
            <div className="empty-state">公告加载中</div>
          ) : (
            <>
              <MarkdownNotice markdown={markdown} onProfileLinkClick={handleProfileLinkClick} />
              <div className="notice-bottom-sentinel" ref={bottomRef} aria-hidden="true" />
            </>
          )}
        </div>
        <div className="notice-actions">
          <p className={`notice-hint ${canContinue ? 'ready' : ''}`} aria-live="polite">
            {noticeHint}
          </p>
          <button className="action-button secondary" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="action-button"
            onClick={handleContinue}
            disabled={!canContinue}
            type="button"
          >
            我已关注，继续跑步
          </button>
        </div>
      </section>
    </div>
  );
}
