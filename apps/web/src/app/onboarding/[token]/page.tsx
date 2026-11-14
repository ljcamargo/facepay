import { legalHashes } from '@/lib/legal';
import { OnboardingFlow } from './flow';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Hash the exact text the customer is shown; it becomes the consent evidence.
  const legal = await legalHashes();

  return <OnboardingFlow token={token} legal={legal} />;
}
