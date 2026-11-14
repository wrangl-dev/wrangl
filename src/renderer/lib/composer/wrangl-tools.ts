/**
 * Wrangl's own agent tools that the composer can point the agent at. Each
 * entry becomes a "tool" pill; on the wire the pill reads as a plain-language
 * request naming the tool and the `wrangl` MCP server, so any ACP agent can
 * act on it (no agent-specific tool ids such as `mcp__wrangl__browser`).
 *
 * The host serves these tools from its `wrangl` MCP server
 * (`src-tauri/src/acp/host_mcp/child.rs`): the browser tool, the canvas
 * tools and the automation tools.
 */

/** The MCP server name the host registers for its own tools. */
const HOST_MCP_SERVER = 'wrangl'

export type WranglToolId = 'browser' | 'canvas' | 'automations'

/**
 * `closed`: the agent can call the tool, but it fails until the user opens
 * the thing it drives. The pill still inserts; the menu says so.
 */
export type WranglToolState = 'available' | 'closed'

export interface WranglToolContext {
  /** The project's canvas is mounted and ready (`CANVAS_CLOSED` otherwise). */
  canvasReady: boolean
}

export interface WranglToolEntry {
  id: WranglToolId
  /** Pill and menu label. */
  label: string
  /** Muted line under the label in the menus. */
  description: string
  /** What the agent reads in place of the pill. */
  wireText: string
  state: (context: WranglToolContext) => WranglToolState
}

function wire(tools: string): Pick<WranglToolEntry, 'wireText'> {
  return { wireText: `(Use ${tools} from the ${HOST_MCP_SERVER} MCP server)` }
}

const always = (): WranglToolState => 'available'

export const WRANGL_TOOLS: readonly WranglToolEntry[] = [
  {
    id: 'browser',
    label: 'Browser',
    description: 'Open, click and read pages',
    ...wire('the browser tool'),
    // The host lists the tool on every surface; with no browser host (the
    // standalone server) a call fails with a clear reason.
    state: always
  },
  {
    id: 'canvas',
    label: 'Canvas',
    description: 'Design on the project canvas',
    ...wire('the canvas tools'),
    state: ({ canvasReady }) => (canvasReady ? 'available' : 'closed')
  },
  {
    id: 'automations',
    label: 'Automations',
    description: 'Schedule background work',
    ...wire('the automation tools'),
    state: always
  }
]

export function wranglTool(id: string): WranglToolEntry | undefined {
  return WRANGL_TOOLS.find((tool) => tool.id === id)
}
