/**
 * editor/modals/ImageModal.tsx
 *
 * Lightbox overlay for displaying a full-size image. Clicking anywhere on the
 * overlay closes it.
 */

import React from 'react'

interface ImageModalProps {
  /** Whether the modal is currently shown. */
  visible: boolean
  /** Base64 data URL of the image to display, or null when not loaded. */
  dataUrl: string | null
  /** Called when the user clicks the overlay to close. */
  onClose: () => void
}

/** Full-screen lightbox that shows a single image. Clicking the backdrop closes it. */
const ImageModal: React.FC<ImageModalProps> = ({ visible, dataUrl, onClose }) => {
  if (!visible) return null
  return (
    <div className="image-modal-overlay" onClick={onClose}>
      <div className="image-modal-content">
        {dataUrl && <img src={dataUrl} className="image-modal-img" />}
      </div>
    </div>
  )
}

export default ImageModal
