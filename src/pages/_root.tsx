import type { ReactNode } from 'react';

import { Analytics } from '../analytics/posthog.tsx';
import { RootErrorBoundary } from '../components/root-error-boundary.tsx';

type RootElementProps = { children: ReactNode };

export default async function RootElement({ children }: RootElementProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <Analytics />
        <RootErrorBoundary>{children}</RootErrorBoundary>
      </body>
    </html>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
