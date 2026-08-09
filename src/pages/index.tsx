import { StillnessExperience } from '../experience/stillness-experience.tsx';

export default async function HomePage() {
  return (
    <div data-testid="smoke-home">
      <title>Relief — Take a minute back.</title>
      <StillnessExperience />
    </div>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
