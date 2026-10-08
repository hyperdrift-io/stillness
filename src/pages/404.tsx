import { Link } from 'waku';

export default function NotFoundPage() {
  return (
    <section className="entry-panel" aria-labelledby="not-found-title">
      <title>Not this way — Relief</title>
      <meta name="robots" content="noindex,follow" />
      <div className="entry-copy">
        <p className="eyebrow">Relief</p>
        <h1 id="not-found-title">Not this way.</h1>
        <p>There is no page here. The minute you came for is one step back.</p>
        <div className="entry-actions">
          <Link to="/">Take a minute back</Link>
        </div>
      </div>
    </section>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
