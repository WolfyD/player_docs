/**
 * editor/modals/AddChildModal.tsx
 *
 * Modal for creating a new child object under the currently active node.
 * Supports a name, optional description, and a type selector populated from the
 * global type catalog.
 *
 * Keyboard shortcuts:
 *  - Enter in the name field  → create (or create-and-enter when Ctrl is held)
 *  - Escape                   → close
 */

import React from 'react'
import ModalShell from '../ModalShell'
import type { ObjectType } from '../types'

interface AddChildModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** Current value of the name input field. */
  catName: string
  /** Currently selected type id. */
  catType: string
  /** Current value of the optional description textarea. */
  catDescription: string
  /** Validation error message to display, or null when the form is valid. */
  catErr: string | null
  /** Whether the Ctrl key is currently held (controls the button label). */
  ctrlKeyPressed: boolean
  /** Types to show in the type dropdown, filtered for campaign visibility. */
  selectableTypes: ObjectType[]
  onNameChange: (v: string) => void
  onTypeChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  /** Create the child and stay on the current object. */
  onCreate: () => void
  /** Create the child and navigate directly into it. */
  onCreateAndEnter: () => void
  onClose: () => void
}

/** Modal form for adding a new child object with name, description, and type. */
const AddChildModal: React.FC<AddChildModalProps> = ({
  visible,
  catName,
  catType,
  catDescription,
  catErr,
  ctrlKeyPressed,
  selectableTypes,
  onNameChange,
  onTypeChange,
  onDescriptionChange,
  onCreate,
  onCreateAndEnter,
  onClose,
}) => {
  if (!visible) return null
  return (
    <ModalShell onClose={onClose} width="360px">
      <h3 className="mt-0">Add Child</h3>
      <div className="grid-gap-8">
        <label>
          <div>Name</div>
          <input
            id="catName"
            autoFocus
            value={catName}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (e.ctrlKey) { onCreateAndEnter() } else { onCreate() }
              } else if (e.key === 'Escape') { onClose() }
            }}
            onChange={e => onNameChange(e.target.value)}
            className="input-100"
          />
        </label>
        <label>
          <div>Description</div>
          <textarea
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) { onCreateAndEnter() }
              else if (e.key === 'Escape') { onClose() }
            }}
            value={catDescription}
            onChange={e => onDescriptionChange(e.target.value)}
            className="new-child-description input-100"
          />
        </label>
        <label>
          <div>Type</div>
          <select value={catType} onChange={e => onTypeChange(e.target.value)} className="input-100">
            {selectableTypes.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.isHidden ? ' (hidden)' : ''}
              </option>
            ))}
          </select>
        </label>
        {catErr && <div className="text-tomato">{catErr}</div>}
      </div>
      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        {ctrlKeyPressed ? (
          <button onClick={onCreateAndEnter}>Create and Enter</button>
        ) : (
          <button onClick={onCreate}>Create</button>
        )}
      </div>
    </ModalShell>
  )
}

export default AddChildModal
