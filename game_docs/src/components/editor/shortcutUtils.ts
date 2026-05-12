/**
 * editor/shortcutUtils.ts
 *
 * Keyboard shortcut matching utilities. These are pure functions with no
 * dependencies on React or application state.
 */

/**
 * Tests whether a keyboard event matches a shortcut combo string.
 *
 * Combo format: modifier keys joined by `+` followed by the key name, e.g.
 * `"Ctrl+K"`, `"Ctrl+Shift+L"`, `"F1"`, `"Ctrl+ARROWUP"`.
 *
 * Arrow keys must be written as `ARROWUP`, `ARROWDOWN`, `ARROWLEFT`,
 * `ARROWRIGHT` (case-insensitive in the combo string; the event key is
 * compared case-sensitively to the standard `"ArrowUp"` etc. values).
 */
export function matchShortcut(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+').map(s => s.trim().toLowerCase())
  const key = parts[parts.length - 1]
  const wantArrowUp = parts.includes('arrowup')
  const wantArrowDown = parts.includes('arrowdown')
  const wantArrowLeft = parts.includes('arrowleft')
  const wantArrowRight = parts.includes('arrowright')
  if (wantArrowUp && e.key !== 'ArrowUp') return false
  if (wantArrowDown && e.key !== 'ArrowDown') return false
  if (wantArrowLeft && e.key !== 'ArrowLeft') return false
  if (wantArrowRight && e.key !== 'ArrowRight') return false
  const wantCtrl = parts.includes('ctrl') || parts.includes('control')
  const wantShift = parts.includes('shift')
  const wantAlt = parts.includes('alt')
  if (wantCtrl !== (!!e.ctrlKey || !!e.metaKey)) return false
  if (wantShift !== !!e.shiftKey) return false
  if (wantAlt !== !!e.altKey) return false
  return e.key.toLowerCase() === key
}
