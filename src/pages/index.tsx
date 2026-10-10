import { StillnessExperience } from '../experience/stillness-experience.tsx';

export default async function HomePage() {
  return (
    <div data-testid="smoke-home">
      <title>Stillness — an open breathing research app</title>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Stillness',
        url: 'https://stillness.hyperdrift.io/', applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Web browser', description: 'An open research app exploring slow breathing through light and sound. Not clinically validated.',
        isAccessibleForFree: true, creator: { '@type': 'Organization', name: 'Hyperdrift', url: 'https://hyperdrift.io/' },
        sameAs: 'https://github.com/hyperdrift-io/stillness',
      }) }} />
      <StillnessExperience />
    </div>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
