/**
 * The v2 model picker is the default. To fall back to the old picker, run
 * `localStorage.setItem('wrangl.modelPickerV2', '0')`, then reopen the picker.
 */
export const MODEL_PICKER_V2_KEY = 'wrangl.modelPickerV2'

export function isModelPickerV2Enabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return localStorage.getItem(MODEL_PICKER_V2_KEY) !== '0'
  } catch {
    return true
  }
}
