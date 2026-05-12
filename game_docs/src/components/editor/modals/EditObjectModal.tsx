/**
 * editor/modals/EditObjectModal.tsx
 *
 * The "Edit object" modal — a wide two-column panel for managing a single
 * object's metadata:
 *  - Left column: rename, change type, view/manage owned tags and incoming links.
 *  - Right column: images and file attachments.
 *
 * The modal can target either the currently active object or a different object
 * selected via the edit-picker (`editTargetId`). After saving, if the active
 * object was edited the caller is expected to re-select it to refresh the view.
 */

import React from 'react'
import type { Attachment, ObjectType } from '../types'

interface EditObjectModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** The id of the object being edited, or null to fall back to `activeId`. */
  editTargetId: string | null
  /** The id of the currently active (selected) object. */
  activeId: string
  /** Current value of the name input field. */
  editName: string
  /** Currently selected type id for this object. */
  wizardType: string
  /** Tags owned by this object. */
  ownerTags: Array<{ id: string; name: string; object_id: string }>
  /** Incoming links — other objects that link to this one. */
  incomingLinks: Array<{ tag_id: string; owner_id: string; owner_name: string; owner_path: string }>
  /** Types available in the type dropdown (filtered for campaign visibility). */
  selectableTypes: ObjectType[]
  /** Images attached to the active object. */
  images: Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>
  /** File attachments for the active object. */
  attachments: Attachment[]
  /** Converts a thumb image record to a displayable URL (prefers data URL over file path). */
  safeThumbSrc: (img: { thumb_data_url?: string | null; thumb_url?: string | null; thumb_path: string }) => string
  onNameChange: (v: string) => void
  onTypeChange: (v: string) => void
  onClose: () => void
  onSave: () => void
  /** Navigates to the given object and closes this modal. */
  onNavigateToObject: (id: string, name: string) => void
  onDeleteTag: (tagId: string) => void
  onRemoveIncomingLink: (tagId: string, targetId: string) => void
  /** Opens the full-size image lightbox. */
  onOpenImageLightbox: (dataUrl: string) => void
  onOpenImageExternal: (filePath: string) => void
  onRenameImage: (id: string, name: string) => void
  onSetDefaultImage: (imageId: string) => void
  onDeleteImage: (imageId: string) => void
  onOpenAttachment: (att: Attachment) => void
  onSetMainAttachment: (attId: string) => void
  onDeleteAttachment: (attId: string) => void
  /** Opens the add-file-attachment dialog. */
  onAddAttachment: () => void
}

/** Wide two-column edit panel for object metadata, tags, images, and attachments. */
const EditObjectModal: React.FC<EditObjectModalProps> = ({
  visible,
  editTargetId,
  activeId,
  editName,
  wizardType,
  ownerTags,
  incomingLinks,
  selectableTypes,
  images,
  attachments,
  safeThumbSrc,
  onNameChange,
  onTypeChange,
  onClose,
  onSave,
  onNavigateToObject,
  onDeleteTag,
  onRemoveIncomingLink,
  onOpenImageLightbox,
  onOpenImageExternal,
  onRenameImage,
  onSetDefaultImage,
  onDeleteImage,
  onOpenAttachment,
  onSetMainAttachment,
  onDeleteAttachment,
  onAddAttachment,
}) => {
  if (!visible) return null
  return (
    <div
      className="edit-modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="edit-modal-width" onClick={e => e.stopPropagation()}>
        <div className="edit-modal">
          <div className="edit-modal-header">
            <h3 className="m-0">Edit object</h3>
            <div className="flex-gap-8">
              <button onClick={onClose}>Close</button>
              <button onClick={onSave}>Save</button>
            </div>
          </div>
          <div className="edit-modal-grid">
            <div className="grid-gap-10-only">
              <div className="flex-gap-8">
                <label className="flex-1">
                  Name
                  <input value={editName} onChange={e => onNameChange(e.target.value)} className="input-100" />
                </label>
                <label className="w-160">
                  Type
                  <select value={wizardType} onChange={e => onTypeChange(e.target.value)} className="input-100">
                    {selectableTypes.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.isHidden ? ' (hidden)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="boxed">
                <div className="box-title">Tags owned by this object</div>
                {ownerTags.length === 0 ? (
                  <div className="muted">No tags</div>
                ) : (
                  <ul className="list-reset">
                    {ownerTags.map(t => (
                      <li key={t.id} className="list-item-row">
                        <code className="tag-id">{t.id}</code> -{' '}
                        <span
                          onClick={() => onNavigateToObject(t.object_id, t.name)}
                          className="tag-name"
                          title={t.name}
                        >
                          {t.name}
                        </span>
                        <div className="flex-gap-6">
                          <button
                            title="Delete tag and its links"
                            onClick={() => onDeleteTag(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="boxed">
                <div className="box-title">Objects linking to this</div>
                {incomingLinks.length === 0 ? (
                  <div className="muted">No incoming links</div>
                ) : (
                  <ul className="list-reset">
                    {incomingLinks.map(l => (
                      <li key={l.tag_id + l.owner_id} className="list-item-row">
                        <span
                          className="tag-name"
                          onClick={() => onNavigateToObject(l.owner_id, l.owner_name)}
                          title={l.owner_path}
                        >
                          {l.owner_name}
                        </span>
                        <div className="flex-gap-6">
                          <button
                            title="Remove link"
                            onClick={() => onRemoveIncomingLink(l.tag_id, activeId)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="boxed">
              <div className="box-title">Images</div>
              <div className="mt-6">
                <button onClick={onAddAttachment}>Add file attachment</button>
              </div>
              {images.length === 0 ? (
                <div className="muted">No images</div>
              ) : (
                <div className="thumb-list">
                  {images.map(img => (
                    <div key={img.id} className="thumb-card w-200">
                      <img
                        src={safeThumbSrc(img)}
                        className="thumb-img"
                        onClick={async e => {
                          if ((e as any).shiftKey) {
                            onOpenImageExternal(img.file_path)
                          } else {
                            const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', img.file_path)
                            if (res?.ok) onOpenImageLightbox(res.dataUrl)
                          }
                        }}
                      />
                      <input
                        defaultValue={img.name || ''}
                        placeholder="Name"
                        className="input-100 mt-6"
                        onBlur={e => onRenameImage(img.id, e.target.value)}
                      />
                      <div className="justify-between mt-6 items-center">
                        <label className="items-center flex-gap-6">
                          <input
                            type="radio"
                            checked={!!img.is_default}
                            onChange={() => onSetDefaultImage(img.id)}
                          />
                          Default
                        </label>
                        <button onClick={() => onDeleteImage(img.id)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="box-title mt-12">Files</div>
              {attachments.length === 0 ? (
                <div className="muted">No files</div>
              ) : (
                <ul className="list-reset">
                  {attachments.map(att => (
                    <li key={att.id} className="list-item-row">
                      <span className="tag-name">
                        {att.name || '(unnamed)'} {att.is_main ? '⭐' : ''}
                      </span>
                      <div className="flex-gap-6">
                        <button onClick={() => onOpenAttachment(att)}>Open</button>
                        <button onClick={() => onSetMainAttachment(att.id)}>Main</button>
                        <button onClick={() => onDeleteAttachment(att.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EditObjectModal
