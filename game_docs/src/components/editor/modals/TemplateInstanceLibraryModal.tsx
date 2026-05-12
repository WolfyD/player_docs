/**
 * editor/modals/TemplateInstanceLibraryModal.tsx
 *
 * Cross-object template instance library. Lists every template instance across
 * the entire campaign so the user can re-insert an existing instance (with an
 * optional clone to the active object) or delete stale ones.
 */

import React from 'react'
import { toast } from '../../Confirm'
import type { TemplateInstanceLibraryRow } from '../types'

interface TemplateInstanceLibraryModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** All template instance rows across the campaign. */
  rows: TemplateInstanceLibraryRow[]
  /** The currently selected object id. */
  activeId: string
  onClose: () => void
  /** Inserts the given marker text at the current selection in the editor. */
  insertTemplateMarker: (marker: string) => void
  /** Reloads data for the active object (attachments + instances). */
  loadObjectScopedData: (objectId: string) => Promise<void>
  /** Reloads the instance library rows. */
  loadTemplateInstanceLibrary: () => Promise<void>
}

/** Campaign-wide template instance browser with insert and delete actions. */
const TemplateInstanceLibraryModal: React.FC<TemplateInstanceLibraryModalProps> = ({
  visible,
  rows,
  activeId,
  onClose,
  insertTemplateMarker,
  loadObjectScopedData,
  loadTemplateInstanceLibrary,
}) => {
  if (!visible) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dialog-card w-520" onClick={e => e.stopPropagation()}>
        <h3 className="mt-0">Template Instances</h3>
        <div className="muted">Reuse existing instances or remove stale ones.</div>
        <div className="maxh-260 border-top mt-10">
          <ul className="list-reset">
            {rows.length === 0 ? (
              <div className="muted pad-8">No instances</div>
            ) : (
              rows.map(row => (
                <li key={row.id} className="list-item-row">
                  <span className="tag-name" title={row.id}>
                    {row.template_name} - {row.object_name}
                  </span>
                  <div className="flex-gap-6">
                    <button onClick={async () => {
                      if (!activeId) { toast('Select an object first', 'info'); return }
                      if (row.object_id === activeId) {
                        insertTemplateMarker(`{{tpl:${row.id}}}`)
                        toast('Inserted existing instance', 'success')
                        return
                      }
                      const cloned = await window.ipcRenderer.invoke('gamedocs:clone-template-instance-to-object', row.id, activeId).catch(() => null)
                      const newId = cloned?.id as string | undefined
                      if (!newId) { toast('Failed to clone instance', 'error'); return }
                      insertTemplateMarker(`{{tpl:${newId}}}`)
                      await loadObjectScopedData(activeId)
                      toast('Cloned and inserted instance', 'success')
                    }}>Insert Here</button>
                    <button onClick={async () => {
                      await window.ipcRenderer.invoke('gamedocs:delete-template-instance', row.id).catch(() => null)
                      await loadTemplateInstanceLibrary()
                      if (activeId) await loadObjectScopedData(activeId)
                    }}>Delete</button>
                  </div>
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

export default TemplateInstanceLibraryModal
