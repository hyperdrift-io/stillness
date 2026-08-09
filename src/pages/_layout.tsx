import '../styles.css';

import type { ReactNode } from 'react';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <>
      <meta
        name="description"
        content="A private, face-driven reset that responds to your movement and helps you return with more room."
      />
      <meta name="theme-color" content="#061a1f" />
      <meta name="color-scheme" content="dark" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Stillness" />
      <meta
        property="og:description"
        content="A private reset that moves with you, then opens into calm."
      />
      <meta property="og:url" content="https://stillness.hyperdrift.io/" />
      <meta property="og:image" content="https://stillness.hyperdrift.io/icon-512.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Stillness" />
      <meta name="twitter:description" content="A private reset that moves with you, then opens into calm." />
      <meta name="twitter:image" content="https://stillness.hyperdrift.io/icon-512.png" />
      <link rel="canonical" href="https://stillness.hyperdrift.io/" />
      <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <link rel="apple-touch-icon" href="/icon-192.png" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Stillness" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <main>{children}</main>
    </>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
