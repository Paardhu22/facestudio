import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';

import './globals.css';

// Self-hosted at build time by next/font; no runtime requests to third parties (SKILLS.md §B.3).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const manrope = localFont({
  src: '../../public/fonts/manrope-variable.ttf',
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'FaceStudio — Precision cropping and batch image editing',
    template: '%s — FaceStudio',
  },
  description:
    'Detect faces, perfect every crop, adjust your images, and process thousands of photos in one streamlined workspace.',
  applicationName: 'FaceStudio',
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable}`} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
