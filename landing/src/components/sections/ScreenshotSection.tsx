import { Reveal } from '../ui/Reveal';
import { SectionHeader } from '../ui/SectionHeader';

export const ScreenshotSection = () => (
  <section className="px-6 py-24 sm:py-32">
    <div className="mx-auto max-w-7xl">
      <SectionHeader
        marker="the app"
        title="This is Wrangl."
        description="A real screenshot: four projects in the sidebar, the agent prompt open."
      />
      <Reveal className="mt-12">
        <div className="overflow-hidden rounded-md border border-white/20 bg-graphite">
          <div className="flex items-center gap-4 border-b border-white/15 px-4 py-2.5" aria-hidden="true">
            <span className="flex gap-1.5">
              <i className="h-2.5 w-2.5 border border-white/40" />
              <i className="h-2.5 w-2.5 border border-white/40" />
              <i className="h-2.5 w-2.5 border border-white/40" />
            </span>
            <span className="font-mono text-xs text-gray-400">wrangl</span>
          </div>
          <img
            src="/wrangl-mock.png"
            alt="Wrangl workspace with four projects in the sidebar and the agent prompt open"
            className="block h-auto w-full"
            width={1024}
            height={640}
            loading="lazy"
            decoding="async"
          />
        </div>
      </Reveal>
    </div>
  </section>
);
