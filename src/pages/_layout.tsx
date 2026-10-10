import '../styles.css';

import type { ReactNode } from 'react';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <>
      <meta
        name="description"
        content="An open research app exploring slow breathing through light and sound. Try the experience, read the evidence. Camera processing stays on your device."
      />
      <meta name="google-site-verification" content="50RQLkfM1jREfOFhOOZg22V_67yRE_6LhaqpmwJ4jm0" />
      <meta name="theme-color" content="#061a1f" />
      <meta name="color-scheme" content="dark" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Stillness — a breathing research app" />
      <meta
        property="og:description"
        content="Breathe with the light. Explore the research behind slow breathing in a free browser app by Hyperdrift."
      />
      <meta property="og:url" content="https://stillness.hyperdrift.io/" />
      <meta property="og:image" content="https://stillness.hyperdrift.io/og-research.png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:alt" content="Stillness. Breathe with the light. An open breathing research app by Hyperdrift." />
      <meta property="og:site_name" content="Stillness by Hyperdrift" />
      <meta name="twitter:image:alt" content="Stillness. Breathe with the light. An open breathing research app by Hyperdrift." />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Stillness — a breathing research app" />
      <meta name="twitter:description" content="Breathe with the light. Explore the research behind slow breathing in a free browser app by Hyperdrift." />
      <meta name="twitter:image" content="https://stillness.hyperdrift.io/og-research.png" />
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
