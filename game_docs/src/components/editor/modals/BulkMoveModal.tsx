/**
 * editor/modals/BulkMoveModal.tsx
 *
 * First step of the bulk-move workflow: lets the user filter and select
 * multiple objects from the campaign, then proceeds to the parent-selection
 * step (MoveModal). Supports name and parent-path text filters plus an
 * "include descendants" toggle.
 */

import React from 'react'

interface BulkMoveModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** Items shown in the list after applying current filters. */
  filteredBulkItems: Array<{ id: string; name: string; path: string; parent_id: string | null }>
  /** All objects loaded for the bulk operation (used for the selection summary). */
  allObjectsForBulk: Array<{ id: string; name: string; path: string; parent_id: string | null }>
  /** Set of currently checked item ids. */
  selectedItems: Set<string>
  /** Current value of the name filter input. */
  bulkNameFilter: string
  /** Current value of the parent filter input. */
  bulkParentFilter: string
  /** Whether descendants of selected items should also be included. */
  includeDescendants: boolean
  onNameFilterChange: (v: string) => void
  onParentFilterChange: (v: string) => void
  onIncludeDescendantsChange: (v: boolean) => void
  /** Toggles selection for a single item. */
  onToggleItem: (id: string) => void
  onCancel: () => void
  /** Advances to the parent-picker step. */
  onNext: () => void
}

/** Bulk-select modal — pick items to move before choosing their new parent. */
const BulkMoveModal: React.FC<BulkMoveModalProps> = ({
  visible,
  filteredBulkItems,
  allObjectsForBulk,
  selectedItems,
  bulkNameFilter,
  bulkParentFilter,
  includeDescendants,
  onNameFilterChange,
  onParentFilterChange,
  onIncludeDescendantsChange,
  onToggleItem,
  onCancel,
  onNext,
}) => {
  if (!visible) return null
  return (
    <div className="bulk-move-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="bulk-move-width" onClick={e => e.stopPropagation()}>
        <div className="bulk-move-card">
          <div className="bulk-move-header">
            <h3 className="m-0">Select Items to Move</h3>
            <div className="flex-gap-8">
              <button onClick={onCancel}>Cancel</button>
              <button
                onClick={onNext}
                disabled={selectedItems.size === 0}
                style={{ opacity: selectedItems.size > 0 ? 1 : 0.5 }}
              >
                Next
              </button>
            </div>
          </div>

          <div className="bulk-move-filters">
            <div className="bulk-filter-row">
              <input
                type="text"
                className="bulk-filter-input"
                placeholder="Filter by name..."
                value={bulkNameFilter}
                onChange={e => onNameFilterChange(e.target.value)}
              />
              <input
                type="text"
                className="bulk-filter-input"
                placeholder="Filter by parent..."
                value={bulkParentFilter}
                onChange={e => onParentFilterChange(e.target.value)}
              />
            </div>
            <div className="bulk-filter-options">
              <label className="bulk-checkbox-label">
                <input
                  type="checkbox"
                  checked={includeDescendants}
                  onChange={e => onIncludeDescendantsChange(e.target.checked)}
                />
                Include descendants (not just direct children)
              </label>
            </div>
          </div>

          <div className="bulk-move-content">
            <div className="bulk-items-list">
              {filteredBulkItems.map(item => (
                <div
                  key={item.id}
                  className="bulk-item-row"
                  onClick={() => onToggleItem(item.id)}
                >
                  <input
                    type="checkbox"
                    className="bulk-item-checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={e => {
                      e.stopPropagation()
                      onToggleItem(item.id)
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="bulk-item-info">
                    <div className="bulk-item-name">{item.name}</div>
                    <div className="bulk-item-id">{item.id}</div>
                  </div>
                </div>
              ))}
              {filteredBulkItems.length === 0 && (
                <div className="bulk-no-results">No items found matching filters</div>
              )}
            </div>
          </div>

          {selectedItems.size > 0 && (
            <div className="bulk-selected-summary">
              <div className="bulk-summary-title">Selected Items ({selectedItems.size}):</div>
              <div className="bulk-summary-list">
                {Array.from(selectedItems).map(id => {
                  const item = allObjectsForBulk.find(o => o.id === id)
                  return item ? item.name : null
                }).filter(Boolean).join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkMoveModal
