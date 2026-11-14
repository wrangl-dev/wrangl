import { FactsStrip } from '../components/sections/FactsStrip';
import { FeatureSection } from '../components/sections/FeatureSection';
import { Hero } from '../components/sections/Hero';
import { MoreFeaturesSection } from '../components/sections/MoreFeaturesSection';
import { SessionsSection } from '../components/sections/SessionsSection';
import { ScreenshotSection } from '../components/sections/ScreenshotSection';

export function HomePage() {
  return (
    <>
      <main id="main-content">
        <Hero />
        <SessionsSection />
        <FactsStrip />
        <ScreenshotSection />
        <FeatureSection />
        <MoreFeaturesSection />
      </main>
    </>
  );
}
