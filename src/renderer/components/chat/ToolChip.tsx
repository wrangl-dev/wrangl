import { Edit2, Globe, Workflow, type WranglIcon } from '@/components/icons'
import type { WranglToolEntry, WranglToolId } from '@/lib/composer/wrangl-tools'
import { cn } from '@/lib/utils'

/** The Rail's icons for the same features (Canvas, Automations). */
export const WRANGL_TOOL_ICONS: Record<WranglToolId, WranglIcon> = {
  browser: Globe,
  canvas: Edit2,
  automations: Workflow
}

/**
 * Inline chip for a Wrangl tool pill, in the composer and the timeline. Same
 * inline metrics as `FileChip` so it stays in one line box.
 */
export function ToolChip({
  tool,
  className
}: {
  tool: WranglToolEntry
  className?: string
}): React.JSX.Element {
  const Icon = WRANGL_TOOL_ICONS[tool.id]
  return (
    <span
      className={cn(
        'inline-flex h-[1.1em] max-w-full items-center gap-1 align-baseline leading-none',
        'text-inherit font-medium text-foreground',
        className
      )}
      title={tool.wireText}
    >
      <span aria-hidden="true" className="inline-flex shrink-0 text-muted-foreground">
        <Icon size={12} />
      </span>
      <span className="truncate">{tool.label}</span>
    </span>
  )
}
