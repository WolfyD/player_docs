/**
 * editor/modals/TypeEditorModal.tsx
 *
 * Form modal for creating a new object type or editing an existing one.
 * Fields: ID (read-only), name, Remix icon (searchable grid picker), and
 * tag list with autocomplete.
 *
 * Validation enforces:
 *  - Name must not be empty.
 *  - Name must be unique (case-insensitive) across all existing types.
 */

import React from 'react'
import type { ObjectType } from '../types'

interface TypeEditorModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** Whether we are creating a new type (`true`) or editing an existing one. */
  typeEditorIsNew: boolean
  typeEditorId: string
  typeEditorName: string
  typeEditorIcon: string
  typeIconQuery: string
  typeEditorTags: string[]
  typeTagInput: string
  typeTagSuggestions: Array<{ id: string; name: string }>
  typeEditorErr: string | null
  /** Remix icon names filtered by the current search query (capped at 240). */
  filteredRemixIcons: string[]
  /** The full type catalog, used for duplicate-name validation. */
  objectTypes: ObjectType[]
  setTypeEditorName: (v: string) => void
  setTypeEditorIcon: (v: string) => void
  setTypeIconQuery: (v: string) => void
  setTypeEditorTags: React.Dispatch<React.SetStateAction<string[]>>
  setTypeTagInput: (v: string) => void
  setTypeEditorErr: (v: string | null) => void
  addTypeTagDraft: (v: string) => void
  onClose: () => void
  onSave: () => Promise<void>
}

/** Type creation / edit form with icon grid and tag autocomplete. */
const TypeEditorModal: React.FC<TypeEditorModalProps> = ({
  visible,
  typeEditorIsNew, typeEditorId,
  typeEditorName, typeEditorIcon, typeIconQuery,
  typeEditorTags, typeTagInput, typeTagSuggestions, typeEditorErr,
  filteredRemixIcons, objectTypes,
  setTypeEditorName, setTypeEditorIcon, setTypeIconQuery,
  setTypeEditorTags, setTypeTagInput, setTypeEditorErr,
  addTypeTagDraft, onClose, onSave,
}) => {
  if (!visible) return null
  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="dialog-card w-520" onClick={e => e.stopPropagation()}>
        <h3 className="mt-0">{typeEditorIsNew ? 'Add type' : 'Edit type'}</h3>
        <div className="grid-gap-8">
          <label>
            <div>ID</div>
            <input value={typeEditorIsNew ? '(generated on save)' : typeEditorId} readOnly className="input-100" />
          </label>
          <label>
            <div>Name</div>
            <input
              value={typeEditorName}
              onChange={e => { setTypeEditorName(e.target.value); setTypeEditorErr(null) }}
              className="input-100"
            />
          </label>
          <label>
            <div>Remix icon</div>
            <div className="type-icon-picker">
              <div className="type-icon-picker-top">
                <input
                  value={typeIconQuery}
                  onChange={e => setTypeIconQuery(e.target.value)}
                  placeholder="Search Remix icons (e.g. map, user, sword)"
                  className="input-100"
                />
                <div className="type-icon-preview" title={typeEditorIcon}>
                  <i className={typeEditorIcon || 'ri-price-tag-3-line'}></i>
                  <code>{typeEditorIcon}</code>
                </div>
              </div>
              <div className="type-icon-grid">
                {filteredRemixIcons.map(iconName => (
                  <button
                    key={iconName}
                    type="button"
                    className={`type-icon-item ${typeEditorIcon === iconName ? 'active' : ''}`}
                    onClick={() => setTypeEditorIcon(iconName)}
                    title={iconName}
                  >
                    <i className={iconName}></i>
                    <span>{iconName}</span>
                  </button>
                ))}
              </div>
              {filteredRemixIcons.length === 0 && <div className="muted">No icon matches found.</div>}
            </div>
          </label>
          <label>
            <div>Tags</div>
            <div className="grid-gap-8">
              <input
                value={typeTagInput}
                onChange={e => setTypeTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTypeTagDraft(typeTagInput)
                  }
                }}
                placeholder="Type a tag and press Enter"
                className="input-100"
              />
              {typeTagSuggestions.length > 0 && typeTagInput.trim() ? (
                <div className="maxh-260 border-top">
                  <ul className="list-reset">
                    {typeTagSuggestions.map(s => (
                      <li key={s.id} className="list-item-click" onClick={() => addTypeTagDraft(s.name)}>
                        {s.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex-gap-6 settings-flex-wrap">
                {typeEditorTags.map(tag => (
                  <span key={tag} className="tag-span">
                    {tag}
                    <button
                      type="button"
                      className="icon-btn"
                      title="Remove tag"
                      onClick={() => setTypeEditorTags(prev => prev.filter(p => p.toLowerCase() !== tag.toLowerCase()))}
                    >
                      <i className="ri-close-line"></i>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </label>
          {typeEditorErr && <div className="text-tomato">{typeEditorErr}</div>}
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default TypeEditorModal
