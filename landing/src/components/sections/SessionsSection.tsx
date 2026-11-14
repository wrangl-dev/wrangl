import { useReducedMotion } from '../../lib/useReducedMotion';
import { SectionHeader } from '../ui/SectionHeader';
import { HeroTerminal } from './HeroTerminal';

export const SessionsSection = () => {
  const reducedMotion = useReducedMotion();

  return (
    <section id="sessions" className="border-t border-white/15 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeader marker="one window" title="Every session, one view." />
        <div className="mt-12 sm:mt-16">
          <HeroTerminal reducedMotion={reducedMotion} />
        </div>
      </div>
    </section>
  );
};
