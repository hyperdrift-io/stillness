export default async function HomePage() {
  return (
    <section className="entry" data-testid="smoke-home">
      <title>Stillness — Open. Be met. Descend.</title>
      <div className="entry-presence" aria-hidden="true" />
      <div className="entry-copy">
        <p className="eyebrow">Stillness</p>
        <h1>Let the noise disappear.</h1>
        <p>
          A private audiovisual experience that meets your present rhythm and
          gradually makes space for quiet.
        </p>
        <button className="primary" type="button">Begin</button>
        <p className="privacy-note">Camera sensing is optional and stays on this device.</p>
      </div>
    </section>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
