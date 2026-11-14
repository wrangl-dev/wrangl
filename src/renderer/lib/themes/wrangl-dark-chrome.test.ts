import { describe, expect, it } from 'vitest'
import { BUNDLED_COLOR_THEMES } from './bundled-themes'
import { contrastRatio, hexToOklch } from './color-utils'
import { WRANGL_DARK_CHROME } from './wrangl-dark-chrome'

describe('wrangl dark chrome', () => {
  it('holds hue across the neutral ramp', () => {
    const steps = [
      WRANGL_DARK_CHROME.background,
      WRANGL_DARK_CHROME.card,
      WRANGL_DARK_CHROME.elevated,
      WRANGL_DARK_CHROME.muted,
      WRANGL_DARK_CHROME.border
    ]
    const voidHue = hexToOklch(steps[0]).h
    for (const hex of steps) {
      expect(Math.abs(hexToOklch(hex).h - voidHue)).toBeLessThan(3)
    }
  })

  it('keeps the border at graphite lightness on the void hue', () => {
    const border = hexToOklch(WRANGL_DARK_CHROME.border)
    const graphite = hexToOklch('#23252a')
    const voidHue = hexToOklch(WRANGL_DARK_CHROME.background).h
    expect(Math.abs(border.l - graphite.l)).toBeLessThan(0.01)
    expect(Math.abs(border.h - voidHue)).toBeLessThan(3)
    expect(Math.abs(graphite.h - voidHue)).toBeGreaterThan(15)
  })

  it('places the recessed well between obsidian and the border', () => {
    const muted = hexToOklch(WRANGL_DARK_CHROME.muted).l
    expect(muted).toBeGreaterThan(hexToOklch(WRANGL_DARK_CHROME.elevated).l)
    expect(muted).toBeLessThan(hexToOklch(WRANGL_DARK_CHROME.border).l)
  })

  it('keeps bone on void and fog on carbon at AA', () => {
    expect(
      contrastRatio(WRANGL_DARK_CHROME.foreground, WRANGL_DARK_CHROME.background)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(WRANGL_DARK_CHROME.mutedForeground, WRANGL_DARK_CHROME.card)
    ).toBeGreaterThanOrEqual(4.5)
    expect(
      contrastRatio(WRANGL_DARK_CHROME.secondaryForeground, WRANGL_DARK_CHROME.elevated)
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('is attached only to the default dark theme', () => {
    expect(BUNDLED_COLOR_THEMES.wrangl.dark.chrome).toEqual(WRANGL_DARK_CHROME)
    expect(BUNDLED_COLOR_THEMES.wrangl.dark.palette.primary).toBe('#3b9eff')
    expect(BUNDLED_COLOR_THEMES.nord.dark.chrome).toBeUndefined()
  })
})
