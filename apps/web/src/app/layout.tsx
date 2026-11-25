import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'CargoFlow', template: '%s · CargoFlow' },
  description: 'Container shipment operations: bookings, milestones, ETAs and audit trail.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0f2342' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
