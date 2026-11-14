import { moreFeatures } from '../../data/more-features';
import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';

export const MoreFeaturesSection = () => {
  return (
    <section id="more-features" className="border-t border-white/15 px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          marker="and more"
          title="Built for the whole workflow."
          description="Beyond the headline features, Wrangl is packed with the everyday conveniences that keep you in flow."
        />

        <ul className="mt-14 grid border-b border-white/15 lg:grid-cols-2 lg:gap-x-16">
          {moreFeatures.map((feature, i) => (
            <li key={feature.title} className="border-t border-white/15">
              <Reveal delay={(i % 2) * 60}>
                <div className="group grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 px-0 py-7 transition-colors duration-150 hover:bg-white/[0.04] sm:px-3">
                  <span
                    aria-hidden="true"
                    className="font-mono text-lg leading-snug text-gray-500 transition-colors duration-150 group-hover:text-white"
                  >
                    +
                  </span>
                  <div>
                    <h3 className="font-mono text-lg leading-snug font-semibold text-white">{feature.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-gray-400 transition-colors duration-150 group-hover:text-gray-300">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
