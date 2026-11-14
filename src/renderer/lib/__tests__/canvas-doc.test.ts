/**
 * Pins the canvas document rule used by the "Open canvas" command and the
 * file explorer: `.corral` files only (case-insensitive), alphabetical,
 * first match.
 */

import type { DirectoryEntry } from '@shared/types/filesystem.types'
import { describe, expect, it } from 'vitest'
import {
  canvasDocFile,
  isCanvasDocPath,
  pickCanvasDoc,
  projectRelativePath,
  sameCanvasDoc
} from '../canvas-doc'

function entry(path: string, type: DirectoryEntry['type']): DirectoryEntry {
  const name = path.split('/').at(-1) ?? path
  return { path, name, type, extension: null, size: 0, modifiedAt: 0 }
}

const file = (path: string): DirectoryEntry => entry(path, 'file')
const directory = (path: string): DirectoryEntry => entry(path, 'directory')

describe('pickCanvasDoc', () => {
  it('returns the alphabetically-first .corral file', () => {
    const picked = pickCanvasDoc([file('/proj/poster.corral'), file('/proj/design.corral')])
    expect(picked?.path).toBe('/proj/design.corral')
  })

  it('matches the extension case-insensitively', () => {
    expect(pickCanvasDoc([file('/proj/DESIGN.CORRAL')])?.path).toBe('/proj/DESIGN.CORRAL')
  })

  it('never picks directories, legacy .op documents or other files', () => {
    expect(
      pickCanvasDoc([
        directory('/proj/assets.corral'),
        file('/proj/old.op'),
        file('/proj/README.md')
      ])
    ).toBeUndefined()
    expect(pickCanvasDoc([])).toBeUndefined()
  })
})

describe('isCanvasDocPath', () => {
  it('accepts .corral paths only', () => {
    expect(isCanvasDocPath('C:/proj/design.corral')).toBe(true)
    expect(isCanvasDocPath('/proj/design.op')).toBe(false)
    expect(isCanvasDocPath('/proj/corral.md')).toBe(false)
  })
})

describe('sameCanvasDoc', () => {
  it('folds case for Windows paths, drive-letter and UNC alike', () => {
    expect(sameCanvasDoc(String.raw`C:\Proj\Design.corral`, 'c:/proj/design.corral')).toBe(true)
    expect(
      sameCanvasDoc(String.raw`\\Server\Share\Design.corral`, '//server/share/design.corral')
    ).toBe(true)
    expect(
      sameCanvasDoc(String.raw`\\?\UNC\Server\Share\Design.corral`, '//server/share/design.corral')
    ).toBe(true)
  })

  it('keeps POSIX paths case-sensitive', () => {
    expect(sameCanvasDoc('/proj/Design.corral', '/proj/design.corral')).toBe(false)
  })
})

describe('projectRelativePath', () => {
  it('strips the project root, folding case and separators for drive paths', () => {
    expect(projectRelativePath('C:/p/design/app.corral', 'c:\\P\\')).toBe('design/app.corral')
    expect(projectRelativePath('/home/u/p/a.corral', '/home/u/p')).toBe('a.corral')
  })

  it('treats a verbatim Windows root like its plain spelling, in any slash style', () => {
    const root = String.raw`\\?\D:\Work\Proj`
    expect(projectRelativePath('//?/d:/work/proj/design.corral', root)).toBe('design.corral')
    expect(projectRelativePath(String.raw`\\?\D:\Work\Proj/a.corral`, 'd:/work/proj')).toBe(
      'a.corral'
    )
    expect(projectRelativePath('D:/Work/Proj/sub/a.corral', root)).toBe('sub/a.corral')
    expect(
      projectRelativePath(String.raw`\\?\UNC\srv\share\p\a.corral`, String.raw`\\srv\share\p`)
    ).toBe('a.corral')
  })

  it('keeps the full path for a document outside the root or with no root', () => {
    expect(projectRelativePath('/home/u/other/a.corral', '/home/u/p')).toBe(
      '/home/u/other/a.corral'
    )
    expect(projectRelativePath('/home/u/pp/a.corral', '/home/u/p')).toBe('/home/u/pp/a.corral')
    expect(projectRelativePath('C:\\p\\a.corral', undefined)).toBe('C:/p/a.corral')
  })
})

describe('canvasDocFile', () => {
  const project = { name: 'wrangl', path: 'D:/git/wrangl' }

  it('names the file by its stem and reports the path save_file reports', () => {
    expect(canvasDocFile(String.raw`\?\D:\git\wrangl\design.corral`, project)).toEqual({
      name: 'design',
      path: 'design.corral',
      location: 'wrangl'
    })
    expect(canvasDocFile('D:/git/wrangl/ui/Poster.CORRAL', project)).toMatchObject({
      name: 'Poster',
      path: 'ui/Poster.CORRAL'
    })
  })

  it('never hands the editor an absolute path', () => {
    expect(canvasDocFile('E:/elsewhere/design.corral', project).path).toBe('design.corral')
    expect(canvasDocFile('/home/u/p/design.corral', undefined)).toEqual({
      name: 'design',
      path: 'design.corral',
      location: null
    })
  })
})
