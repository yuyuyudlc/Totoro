'use client';

import Giscus from '@giscus/react';
import { MessageSquareText } from 'lucide-react';
import { useState } from 'react';

const DISCUSSIONS_URL = 'https://github.com/yuyuyudlc/Totoro/discussions';

export default function DiscussionComments() {
  const [theme] = useState(() => (
    typeof window === 'undefined'
      ? 'noborder_light'
      : `${window.location.origin}/giscus-theme.css`
  ));

  return (
    <section className="discussion-panel" aria-labelledby="discussion-title">
      <header className="discussion-header">
        <div className="discussion-heading">
          <span className="discussion-mark" aria-hidden="true">
            <MessageSquareText size={24} strokeWidth={2.5} />
          </span>
          <div>
            <p className="block-label">GitHub Discussions</p>
            <h2 id="discussion-title">留言与反馈</h2>
          </div>
        </div>
        <p className="discussion-intro">
          遇到问题或有改进想法，直接在这里聊。首次留言需要登录 GitHub。
        </p>
      </header>

      <div className="discussion-body">
        <Giscus
          id="totoro-discussions"
          repo="yuyuyudlc/Totoro"
          repoId="R_kgDOQrs8kQ"
          category="General"
          categoryId="DIC_kwDOQrs8kc4DFrBc"
          mapping="pathname"
          strict="1"
          reactionsEnabled="1"
          emitMetadata="0"
          inputPosition="top"
          theme={theme}
          lang="zh-CN"
          loading="lazy"
        />
      </div>

      <footer className="discussion-footer">
        <span>评论内容公开保存在 GitHub Discussions</span>
        <a href={DISCUSSIONS_URL} target="_blank" rel="noreferrer">
          在 GitHub 中查看
        </a>
      </footer>
    </section>
  );
}
