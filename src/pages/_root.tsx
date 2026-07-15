import type { ReactNode } from 'react';

import { RootErrorBoundary } from '../components/root-error-boundary.tsx';

type RootElementProps = { children: ReactNode };

export default async function RootElement({ children }: RootElementProps) {
  return (
    <html lang="en">
      <head />
      <body>
        <RootErrorBoundary>{children}</RootErrorBoundary>
      </body>
    </html>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
