import { useMemo } from 'react'
import {
  WRANGL_TOOLS,
  type WranglToolEntry,
  type WranglToolState
} from '@/lib/composer/wrangl-tools'
import { useCanvasStore } from '@/stores/canvas-store'

export interface WranglToolRow {
  tool: WranglToolEntry
  state: WranglToolState
}

/** The Wrangl tools the + menu and the + sheet offer, with each one's state in this project. */
export function useWranglTools(projectId: string | null): WranglToolRow[] {
  const canvasReady = useCanvasStore((s) =>
    projectId ? s.sessions[projectId]?.phase.kind === 'ready' : false
  )
  return useMemo(
    () => WRANGL_TOOLS.map((tool) => ({ tool, state: tool.state({ canvasReady }) })),
    [canvasReady]
  )
}
