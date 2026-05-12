/**
 * editor/ui/ChildContextMenu.tsx
 *
 * Fixed-position context menu that appears when the user right-clicks a child
 * item in the sidebar panel. Exposes three actions: Delete, Edit, and Move.
 *
 * The parent must pass a `menuRef` so the parent's global mousedown handler can
 * detect clicks outside and close the menu.
 */

import React from 'react'

interface ChildContextMenuProps {
  /** Whether the menu is visible. */
  visible: boolean
  x: number
  y: number
  /** Display name of the right-clicked child item. */
  selText: string
  /** `ref` forwarded from the parent for outside-click detection. */
  menuRef: React.RefObject<HTMLDivElement>
  onDeleteChild: () => void
  onEditChildOpen: () => void
  onMoveChildOpen: () => void
  onClose: () => void
}

/** Compact three-item context menu for child object rows in the sidebar. */
const ChildContextMenu: React.FC<ChildContextMenuProps> = ({
  visible,
  x,
  y,
  selText,
  menuRef,
  onDeleteChild,
  onEditChildOpen,
  onMoveChildOpen,
  onClose,
}) => {
  if (!visible) return null
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} ref={menuRef}>
      <div className="ctx-menu-section-title">{selText}</div>
      <div className="separator" />
      <div className="ctx-menu-item" onClick={onDeleteChild}>Delete Child</div>
      <div
        className="ctx-menu-item"
        onClick={() => { onEditChildOpen(); onClose() }}
      >
        Edit Child
      </div>
      <div
        className="ctx-menu-item"
        onClick={() => { onMoveChildOpen(); onClose() }}
      >
        Move Child
      </div>
    </div>
  )
}

export default ChildContextMenu
