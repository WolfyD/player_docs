/**
 * editor/modals/MiscModal.tsx
 *
 * "Misc stuff" modal that surfaces infrequently-used actions such as export
 * commands, map generation, and the list-all-items utility. Clicking outside
 * the card closes it.
 */

import React from 'react'

interface MiscModalProps {
  /** Whether the modal is currently shown. */
  visible: boolean
  /** Whether the active campaign has any objects with the location tag (needed
   *  to conditionally show the "Generate map" action). */
  hasPlaces: boolean
  /** Whether the currently active object is locked (hides the list-all-items action). */
  activeLocked: boolean
  /** Campaign id, used for the open-map IPC call. */
  campaignId: string
  /** Called when the modal should close. */
  onClose: () => void
  onExportToShare: () => void
  onExportToPdf: () => void
  onExportToHtml: () => void
  onListAllItems: () => void
}

/** Quick-access modal for export commands and miscellaneous utilities. */
const MiscModal: React.FC<MiscModalProps> = ({
  visible,
  hasPlaces,
  activeLocked,
  campaignId,
  onClose,
  onExportToShare,
  onExportToPdf,
  onExportToHtml,
  onListAllItems,
}) => {
  if (!visible) return null
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dialog-card w-360" onClick={e => e.stopPropagation()}>
        <h3 className="mt-0">Misc</h3>
        <div className="misc-list">
          <div className="misc-item" onClick={onExportToShare}>Export to Share</div>
          <div className="misc-item" onClick={onExportToPdf}>Export to PDF</div>
          <div className="misc-item" onClick={onExportToHtml}>Export to HTML</div>
          {hasPlaces && (
            <div className="misc-item" onClick={async () => {
              onClose()
              await window.ipcRenderer.invoke('gamedocs:open-map', campaignId).catch(() => null)
            }}>Generate map</div>
          )}
          {!activeLocked && (
            <div className="misc-item" onClick={onListAllItems}>List all items</div>
          )}
        </div>
        <div className="actions mt-12">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default MiscModal
