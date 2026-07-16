declare module '*.css';

interface ImportMetaEnv {
  readonly WAKU_PUBLIC_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
