/**
 * Wrangl's file watcher events reach the canvas whose document changed,
 * once per burst, and nothing else.
 */

import type { FileChangeEvent } from '@shared/types/filesystem.types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = vi.hoisted(() => new Set<(event: FileChangeEvent) => void>())
vi.mock('@/lib/api', () => {
  const on = (callback: (event: FileChangeEvent) => void) => {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }
  return { filesystemApi: { onFileChanged: on, onFileCreated: on, onFileDeleted: on } }
})
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

import { useCanvasStore } from '@/stores/canvas-store'
import { startCanvasDiskWatch } from '../canvas-disk-watch'

function session(projectId: string, docPath: string) {
  return {
    projectId,
    docPath,
    phase: { kind: 'opening' as const },
    dirty: false,
    contentVersion: null,
    savedVersion: null,
    saving: false,
    saveError: null,
    closing: false,
    conflict: null,
    resolving: false,
    crash: null
  }
}

function emit(type: FileChangeEvent['type'], path: string): void {
  for (const listener of listeners) listener({ type, path })
}

const original = useCanvasStore.getState()
const checkDisk = vi.fn(async () => {})
let stop: () => void = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  useCanvasStore.setState({
    checkDisk,
    sessions: {
      a: session('a', 'C:\\proj-a\\design.corral'),
      b: session('b', '/home/u/proj-b/poster.corral')
    }
  })
  stop = startCanvasDiskWatch()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  checkDisk.mockClear()
  useCanvasStore.setState(original, true)
})

describe('startCanvasDiskWatch', () => {
  it('checks the canvas whose document changed, once per burst', () => {
    emit('unlink', 'c:/proj-a/design.corral')
    emit('add', 'C:/proj-a/design.corral')
    emit('change', 'C:/proj-a/design.corral')
    expect(checkDisk).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(checkDisk).toHaveBeenCalledTimes(1)
    expect(checkDisk).toHaveBeenCalledWith('a')
  })

  it('ignores other files, including the atomic write temp file', () => {
    emit('change', 'C:/proj-a/design.corral.tmp-123')
    emit('change', 'C:/proj-a/notes.md')
    emit('change', '/home/u/proj-b/Poster.corral')
    vi.advanceTimersByTime(300)
    expect(checkDisk).not.toHaveBeenCalled()
  })

  it('stops listening when stopped', () => {
    stop()
    emit('change', '/home/u/proj-b/poster.corral')
    vi.advanceTimersByTime(300)
    expect(checkDisk).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })
})
