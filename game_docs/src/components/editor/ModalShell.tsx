/**
 * editor/ModalShell.tsx
 *
 * Shared wrapper component used by every modal in the editor. Renders the
 * semi-transparent overlay background and the centred dialog card, and wires
 * up the backdrop-click-to-close behaviour via `createOverlayClickHandler`.
 *
 * Usage:
 * ```tsx
 * <ModalShell onClose={() => setVisible(false)} width="520px">
 *   <h2>My Modal</h2>
 *   ...content...
 * </ModalShell>
 * ```
 */

import React from 'react'
import { createOverlayClickHandler } from './overlayUtils'

interface ModalShellProps {
  /** Called when the user clicks outside the card or triggers close. */
  onClose: () => void
  /** Optional explicit width for the inner dialog card (e.g. `"520px"`). */
  width?: string
  /** Optional extra CSS class names added to the inner dialog card div. */
  cardClassName?: string
  children: React.ReactNode
}

/** Renders the standard modal overlay + centered dialog card pattern.
 *  Clicking the semi-transparent backdrop fires `onClose`. */
const ModalShell: React.FC<ModalShellProps> = ({ onClose, width, cardClassName, children }) => {
  const overlayHandlers = createOverlayClickHandler(onClose as any)

  return (
    <div
      className="modal-overlay"
      {...overlayHandlers}
    >
      <div
        className={`dialog-card${cardClassName ? ` ${cardClassName}` : ''}`}
        style={width ? { width } : undefined}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default ModalShell
