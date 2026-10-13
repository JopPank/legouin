import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://legouin.jopism.com'),
  title: 'Le Gouin — Organisation du voyage',
  description: 'Un espace partagé pour le voyage au réservoir Gouin : repas, bagages et dépenses.',
  applicationName: 'Le Gouin — Organisation du voyage',
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: '#f6f4ee',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr-CA">
      <body>{children}</body>
    </html>
  );
}
