import { Reveal } from '../ui/Reveal';

// Only things the app and repo state elsewhere on this site (footer, feature copy).
const facts = [
  { key: 'platforms', value: 'Windows, macOS, Linux' },
  { key: 'built with', value: 'Tauri 2' },
  { key: 'license', value: 'MIT' },
  { key: 'updates', value: 'automatic' },
];

export const FactsStrip = () => (
  <section aria-label="Facts" className="border-y border-white/15 px-6">
    <Reveal className="mx-auto max-w-7xl">
      <dl className="grid grid-cols-2 font-mono md:grid-cols-4">
        {facts.map((fact, i) => (
          <div
            key={fact.key}
            className={`py-6 pr-4 ${i % 2 === 1 ? 'pl-4 border-l border-white/15' : ''} ${i > 1 ? 'border-t border-white/15 md:border-t-0' : ''} md:border-l md:pl-6 ${i === 0 ? 'md:border-l-0 md:pl-0' : ''}`}
          >
            <dt className="text-sm text-gray-400">{fact.key}</dt>
            <dd className="mt-1 text-base text-white sm:text-lg">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Reveal>
  </section>
);
