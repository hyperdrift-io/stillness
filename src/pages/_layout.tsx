import '../styles.css';

import type { ReactNode } from 'react';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <>
      <meta
        name="description"
        content="A few minutes of light and sound that slow your breath to a calm pace. Private: the camera stays on your device."
      />
      <meta name="google-site-verification" content="50RQLkfM1jREfOFhOOZg22V_67yRE_6LhaqpmwJ4jm0" />
      <meta name="theme-color" content="#061a1f" />
      <meta name="color-scheme" content="dark" />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Stillness" />
      <meta
        property="og:description"
        content="Breathe with the light. A private, few-minute reset that slows your breath and thins the noise."
      />
      <meta property="og:url" content="https://stillness.hyperdrift.io/" />
      <meta property="og:image" content="https://stillness.hyperdrift.io/icon-512.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Stillness" />
      <meta name="twitter:description" content="Breathe with the light. A private, few-minute reset that slows your breath and thins the noise." />
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
