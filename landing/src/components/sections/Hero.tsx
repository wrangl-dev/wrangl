import { useReducedMotion } from '../../lib/useReducedMotion';
import { InstallCommand } from '../ui/InstallCommand';
import { ProductCta } from '../ui/ProductCta';
import { agents } from '../../data/agents';
import { AgentsHubVideo } from '../ui/AgentsHubVideo';

const featured = ['Claude Agent', 'Codex', 'Gemini CLI', 'GitHub Copilot', 'Cursor'].filter((n) => agents.includes(n));
const moreCount = agents.length - featured.length;
export const Hero = () => {
  const reducedMotion = useReducedMotion();

  return (
    <section className="px-6 pt-28 pb-16 sm:pt-32 sm:pb-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <h1 className="font-mono text-[clamp(1.875rem,7.4vw,4.75rem)] leading-[1.05] font-bold tracking-tighter text-white">
            A hundred agents
            <br />
            in one manager.
          </h1>
          <div className="flex flex-col gap-6">
            <p className="text-lg leading-relaxed text-gray-400">
              Wrangl treats workspaces as first-class citizens. Organize terminals by project with persistent sessions,
              snapshots, and a clean tabbed interface.
            </p>
            <ProductCta variant="hero" />
            <InstallCommand />
          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          {/* Capped so the 16:10 frame and the "Works with" line fit near the first fold. */}
          <div className="max-w-5xl">
            <AgentsHubVideo reducedMotion={reducedMotion} />
          </div>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-gray-300">
            Works with {featured.join(', ')} and {moreCount} more agents over ACP, the Agent Client Protocol.
          </p>
          <ul
            aria-label="Agents available over ACP"
            className="mt-4 flex flex-wrap font-mono text-sm leading-7 text-gray-500"
          >
            {agents.map((name, i) => (
              <li key={name} className="whitespace-nowrap">
                {name}
                {i < agents.length - 1 && (
                  <span aria-hidden="true" className="px-2 text-gray-600">
                    /
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
