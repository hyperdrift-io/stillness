const measurementId = import.meta.env.WAKU_PUBLIC_GA_MEASUREMENT_ID;
const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId ?? '')
  ? measurementId
  : null;

export function GoogleAnalytics() {
  if (validMeasurementId === null) return null;

  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${validMeasurementId}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${validMeasurementId}',{anonymize_ip:true});`,
        }}
      />
    </>
  );
}
