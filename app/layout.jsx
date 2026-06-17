import './globals.css';

export const metadata = {
  title: 'Totoro Sunrun',
  description: 'Next.js full-stack Totoro Sunrun workspace',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
