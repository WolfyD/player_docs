/**
 * editor/overlayUtils.ts
 *
 * Utility helpers for modal overlay behaviour. Extracted from Editor.tsx so
 * they can be shared by every modal without re-defining them inline.
 */

import type React from 'react'

/**
 * Creates the `onMouseDown` and `onClick` handlers needed by a modal overlay
 * `<div>` so that clicking the backdrop (but not the modal card itself) closes
 * the modal.
 *
 * The two-event approach (track mousedown target, act on click) prevents
 * accidental closes when the user starts a text-selection drag inside the card
 * and releases the mouse over the overlay.
 *
 * @param closeFn  A state setter or callback that accepts `false` / `undefined`
 *                 to signal "close the modal".
 */
export function createOverlayClickHandler(
  closeFn: React.Dispatch<React.SetStateAction<boolean>> | ((next: boolean) => void)
): {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
} {
  let mouseDownOnOverlay = false

  return {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      mouseDownOnOverlay = e.target === e.currentTarget
    },
    onClick: (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      if (mouseDownOnOverlay && e.target === e.currentTarget) {
        ;(closeFn as any)(false)
      }
    },
  }
}
