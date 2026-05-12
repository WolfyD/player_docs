/**
 * editor/modals/MoveModal.tsx
 *
 * Two-column modal for moving one or more objects to a new parent.
 * Left column shows the items being moved; right column shows a searchable list
 * of possible parent objects with a radio selector.
 */

import React from 'react'

interface MoveModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** The items being moved. `path` is an HTML string with breadcrumb markup. */
  moveItems: Array<{ id: string; name: string; path: string }>
  /** The currently selected parent id, or null when none is chosen. */
  selectedParent: string | null
  /** All possible parent objects filtered by the current search input. */
  filteredParents: Array<{ id: string; name: string; path: string }>
  /** Current value of the parent search input. */
  parentSearchInput: string
  onParentSearchChange: (v: string) => void
  onSelectParent: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}

/** Move modal — select a new parent for the listed items. */
const MoveModal: React.FC<MoveModalProps> = ({
  visible,
  moveItems,
  selectedParent,
  filteredParents,
  parentSearchInput,
  onParentSearchChange,
  onSelectParent,
  onCancel,
  onConfirm,
}) => {
  if (!visible) return null
  return (
    <div className="move-overlay" onClick={onCancel}>
      <div className="move-width" onClick={e => e.stopPropagation()}>
        <div className="move-card">
          <div className="move-header">
            <h3 className="m-0">Move Items</h3>
            <div className="flex-gap-8">
              <button onClick={onCancel}>Cancel</button>
              <button
                onClick={onConfirm}
                disabled={!selectedParent}
                style={{ opacity: selectedParent ? 1 : 0.5 }}
              >
                Move
              </button>
            </div>
          </div>

          <div className="move-columns">
            <div className="move-col">
              <div className="move-section-title">Items to Move</div>
              <div className="move-list">
                {moveItems.map(item => (
                  <div key={item.id} className="move-item" title={item.path}>
                    <div className="move-item-id">{item.id}</div>
                    <div className="move-item-name">{item.name}</div>
                    <div className="move-item-path">{item.path}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="move-col">
              <div className="move-section-title">Select New Parent</div>
              <input
                type="text"
                className="move-search-input"
                placeholder="Search parents..."
                value={parentSearchInput}
                onChange={e => onParentSearchChange(e.target.value)}
                autoFocus
              />
              <div className="move-list">
                {filteredParents.map(parent => (
                  <div
                    key={parent.id}
                    className="move-parent-item"
                    onClick={() => onSelectParent(parent.id)}
                  >
                    <input
                      type="radio"
                      className="move-parent-radio"
                      checked={selectedParent === parent.id}
                      onChange={() => onSelectParent(parent.id)}
                    />
                    <div className="move-parent-info">
                      <div className="move-parent-name">{parent.name}</div>
                      <div className="move-parent-path">{parent.path}</div>
                    </div>
                  </div>
                ))}
                {filteredParents.length === 0 && parentSearchInput && (
                  <div className="move-no-results">No parents found matching "{parentSearchInput}"</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MoveModal
