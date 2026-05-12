/**
 * editor/modals/TemplatePickerModal.tsx
 *
 * Simple list modal for inserting a template instance into the description at
 * the current caret position. Shows all available template definitions with an
 * "Insert" button per row.
 */

import React from 'react'
import type { TemplateDef } from '../types'

interface TemplatePickerModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** Available template definitions to insert from. */
  templateDefs: TemplateDef[]
  onInsert: (tpl: TemplateDef) => void
  onClose: () => void
}

/** Flat list picker for inserting a template instance at the current selection. */
const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
  visible,
  templateDefs,
  onInsert,
  onClose,
}) => {
  if (!visible) return null
  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
        <h3 className="mt-0">Insert Template</h3>
        <div className="maxh-260 border-top mt-10">
          <ul className="list-reset">
            {templateDefs.length === 0 ? (
              <div className="muted pad-8">No templates</div>
            ) : (
              templateDefs.map(tpl => (
                <li key={tpl.id} className="list-item-row">
                  <span className="tag-name">{tpl.name}</span>
                  <button onClick={() => onInsert(tpl)}>Insert</button>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default TemplatePickerModal
