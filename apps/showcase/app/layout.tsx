import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PocketPilot AI — See it. Say it. Fix it.',
  description: 'A phone-controlled, local-first developer assistant that turns visible failures into reviewed patches and real verified test results.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
