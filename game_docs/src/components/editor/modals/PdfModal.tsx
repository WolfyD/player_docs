/**
 * editor/modals/PdfModal.tsx
 *
 * Lightbox overlay for displaying a PDF file inline using InlinePdfViewer.
 * Falls back to a native window if the inline renderer fails.
 */

import React from 'react'
import InlinePdfViewer from '../../InlinePdfViewer'

interface PdfModalProps {
  /** Whether the modal is currently shown. */
  visible: boolean
  /** Absolute filesystem path of the PDF file to display. */
  filePath: string | null
  /** Display name shown in the modal header. */
  name: string
  /** Called when the user closes the modal or the overlay is clicked. */
  onClose: () => void
}

/** Full-screen lightbox that renders a PDF using the InlinePdfViewer component.
 *  Clicking outside the card area closes the modal. */
const PdfModal: React.FC<PdfModalProps> = ({ visible, filePath, name, onClose }) => {
  if (!visible) return null
  return (
    <div
      className="image-modal-overlay"
      onClick={onClose}
    >
      <div
        className="image-modal-content"
        style={{ width: 'min(96vw, 1100px)', height: 'min(92vh, 900px)', background: '#121212', padding: 12 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div>{name || 'PDF'}</div>
          <button onClick={onClose}>Close</button>
        </div>
        {filePath ? (
          <InlinePdfViewer
            filePath={filePath}
            onPopout={async () => {
              await window.ipcRenderer.invoke('gamedocs:open-pdf-window', filePath).catch(() => null)
            }}
            onExternal={async () => {
              await window.ipcRenderer.invoke('gamedocs:open-file-default', filePath).catch(() => null)
            }}
          />
        ) : (
          <div className="muted">Unable to load PDF preview.</div>
        )}
      </div>
    </div>
  )
}

export default PdfModal
