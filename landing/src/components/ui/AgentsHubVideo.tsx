import { useState } from 'react';

const BASE = '/hero/agents-hub';

type AgentsHubVideoProps = {
  reducedMotion: boolean;
};

/**
 * Looping, silent hero clip inside a window frame. Under reduced motion only the poster is shown.
 * If the video fails, the poster stays; if the poster is missing too, the whole frame is dropped
 * so the page never shows an empty box.
 */
export function AgentsHubVideo({ reducedMotion }: AgentsHubVideoProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  if (posterFailed && (videoFailed || reducedMotion)) return null;

  const label = 'Animation of the Wrangl W_ mark in the centre, connected by thin lines to the names of AI coding agents';
  const showImage = reducedMotion || videoFailed;

  return (
    <div className="overflow-hidden rounded-md border border-white/20 bg-graphite font-mono">
      <div className="flex items-center gap-4 border-b border-white/15 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 border border-white/40" />
          <i className="h-2.5 w-2.5 border border-white/40" />
          <i className="h-2.5 w-2.5 border border-white/40" />
        </span>
        <span className="text-xs text-gray-400">wrangl / agents</span>
      </div>
      <div className="aspect-[16/10] w-full bg-ink">
        {showImage ? (
          <img
            src={`${BASE}.jpg`}
            alt={label}
            width={1600}
            height={1000}
            className="h-full w-full object-cover"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <video
            className="h-full w-full object-cover"
            poster={`${BASE}.jpg`}
            width={1600}
            height={1000}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            aria-label={label}
            onError={() => setVideoFailed(true)}
          >
            {/* H.264 only. A VP9 WebM of this clip was smaller by nothing and failed to decode in
                Chromium on most loads (PIPELINE_ERROR_DECODE at frame 0), so it was dropped.
                A failed <source> fires `error` on itself, not on <video>, and does not bubble. */}
            <source src={`${BASE}.mp4`} type="video/mp4" onError={() => setVideoFailed(true)} />
          </video>
        )}
      </div>
    </div>
  );
}
