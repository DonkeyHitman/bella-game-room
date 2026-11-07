import type { Metadata, Viewport } from 'next';
import './globals.css';
import OrientationGuard from '@/components/OrientationGuard';

export const metadata: Metadata = {
  title: 'B.E.L.L.A. Game Room',
  description: 'Executive 4-Player Dominoes Club',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BELLA Club',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="m-0 p-0 overflow-hidden bg-[#373c44]">
        {/* The Orientation Guard covers the screen whenever held in portrait */}
        <OrientationGuard />
        {children}
      </body>
    </html>
  );
}
