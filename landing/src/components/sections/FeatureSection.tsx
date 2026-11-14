import { HEADER_SCROLL_OFFSET, smoothScrollToElement } from '../../lib/smooth-scroll';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { features } from '../../data/features';
import { FeatureVisual } from '../feature-visuals';
import { FeatureVideo } from '../ui/FeatureVideo';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';

export const FeatureSection = () => {
  const reducedMotion = useReducedMotion();

  const scrollToFeature = (id: string) => {
    const target = document.getElementById(`feature-${id}`);
    if (target) smoothScrollToElement(target, { offset: HEADER_SCROLL_OFFSET });
  };

  return (
    <section id="features" className="border-t border-white/15 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          marker="features"
          title="Everything in one workspace."
          description="Terminals, editors, browsers, and annotations — organized by project."
        />

        {/* Index: one link per feature */}
        <nav aria-label="Features" className="mt-12 flex flex-wrap gap-x-1 gap-y-1 font-mono text-sm">
          {features.map((feature) => (
            <a
              key={feature.id}
              href={`#feature-${feature.id}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToFeature(feature.id);
              }}
              title={feature.title}
              aria-label={`${feature.id} ${feature.title}`}
              className="border border-white/15 px-3 py-2 text-gray-400 transition-[color,background-color,border-color] duration-150 hover:border-white hover:bg-white hover:text-ink"
            >
              {feature.id}
            </a>
          ))}
        </nav>

        <div className="mt-12 sm:mt-16">
          {features.map((feature) => (
            <article
              key={feature.id}
              id={`feature-${feature.id}`}
              className="scroll-mt-24 border-t border-white/15 py-12 lg:grid lg:grid-cols-12 lg:gap-12 lg:py-20"
            >
              <Reveal className="lg:col-span-5">
                <div className="lg:sticky lg:top-28">
                  <p className="font-mono text-sm text-gray-400">
                    <span className="text-white">{feature.id}</span> / {features.length.toString().padStart(2, '0')}
                  </p>
                  <h3 className="mt-4 text-3xl font-semibold tracking-tight text-balance text-white lg:text-4xl">
                    {feature.title}
                  </h3>
                  <p className="mt-5 text-lg leading-relaxed text-gray-400">{feature.description}</p>
                </div>
              </Reveal>

              <Reveal className="mt-8 lg:col-span-7 lg:mt-0">
                <div className="overflow-hidden rounded-md border border-white/20 bg-graphite">
                  <div className="flex items-center gap-4 border-b border-white/15 px-4 py-2.5" aria-hidden="true">
                    <span className="flex gap-1.5">
                      <i className="h-2.5 w-2.5 border border-white/40" />
                      <i className="h-2.5 w-2.5 border border-white/40" />
                      <i className="h-2.5 w-2.5 border border-white/40" />
                    </span>
                    <span className="font-mono text-xs text-gray-400">{feature.navTitle.toLowerCase()}</span>
                  </div>
                  <div className="relative isolate aspect-[4/3] w-full overflow-hidden bg-ink">
                    {!reducedMotion && feature.video ? (
                      <FeatureVideo id={feature.id} video={feature.video} title={feature.title} />
                    ) : (
                      <FeatureVisual id={feature.id} />
                    )}
                  </div>
                </div>
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
