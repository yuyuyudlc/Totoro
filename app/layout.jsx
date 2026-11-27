import './globals.css';
import Image from 'next/image';
import AnnouncementContent from '../dialog/post.md';
import MizukiImage from '../dialog/img/9eb3106ab7b40921628e09b93091db0a1789460279.png';
import Nana7miImage from '../dialog/img/nana7mi-7th.png';
import ShutdownNoticeImage from '../dialog/img/shutdown-notice.jpg';
import AnnouncementDialog from '../components/common/AnnouncementDialog';

const announcementImages = new Map([
  ['./img/9eb3106ab7b40921628e09b93091db0a1789460279.png', MizukiImage],
  ['./img/nana7mi-7th.png', Nana7miImage],
  ['./img/shutdown-notice.jpg', ShutdownNoticeImage],
]);

function AnnouncementImage({ src, alt = '' }) {
  const image = announcementImages.get(src);
  if (!image) return null;

  return (
    <a href={image.src} target="_blank" rel="noopener noreferrer" aria-label={`打开原图：${alt}`}>
      <Image src={image} alt={alt} sizes="(max-width: 720px) 80vw, 640px" />
    </a>
  );
}

const announcementComponents = { img: AnnouncementImage };

export const metadata = {
  title: 'Totoro Sunrun',
  description: 'Next.js full-stack Totoro Sunrun workspace',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <AnnouncementDialog>
          <AnnouncementContent components={announcementComponents} />
        </AnnouncementDialog>
      </body>
    </html>
  );
}
