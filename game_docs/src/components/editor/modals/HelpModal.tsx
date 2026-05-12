/**
 * editor/modals/HelpModal.tsx
 *
 * Keyboard-shortcut reference and general usage tips modal. Content is fully
 * static except for the shortcut values which are injected from the user's
 * current shortcut settings.
 */

import React from 'react'
import ModalShell from '../ModalShell'
import type { ShortcutSettings } from '../useEditorSettings'

interface HelpModalProps {
  /** Whether the modal is currently shown. */
  visible: boolean
  /** The user's current shortcut bindings, used to render the shortcut list. */
  shortcuts: ShortcutSettings
  /** Converts a camelCase shortcut key identifier to a human-readable label. */
  getProperShortcutName: (key: string) => string
  /** Converts a raw shortcut combo string to a displayable format (e.g. `→` for `ARROWRIGHT`). */
  getProperShortcutValue: (value: string) => string
  /** Called when the modal should close. */
  onClose: () => void
}

/** Renders the help overlay with keyboard shortcuts and usage tips. */
const HelpModal: React.FC<HelpModalProps> = ({
  visible,
  shortcuts,
  getProperShortcutName,
  getProperShortcutValue,
  onClose,
}) => {
  if (!visible) return null
  return (
    <div
      className="help-modal-overlay"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="help-modal-content">
        <h3 className="help-title m-0">Help</h3>
        <div className="help-content" tabIndex={-1}>
          <p>Keyboard shortcuts:</p>
          <ul className="help-list">
            {Object.entries(shortcuts).map(([key, value]) => (
              <React.Fragment key={key}>
                {key !== 'goToPreviousSibling' && key !== 'goToNextSibling' && (
                  <li className="shortcut-item">
                    <span className="shortcut-value">{getProperShortcutName(key)}</span>
                    :<span className="shortcut-name">{getProperShortcutValue(value)}</span>
                  </li>
                )}
              </React.Fragment>
            ))}
          </ul>

          <div className="help-tips">
            <h3 className="help-title m-0">Other tips:</h3>
            <p>I made this tool with TTRPGs in mind, but it can be used to document pretty much anything.</p>
            <p><span className="shortcut-highlight">Right Click</span> on a word to create and edit links to other objects.</p>
            <p>You can connect multiple objects to the same word.</p>
            <p>When you have two or more objects linked to the same word, you can <span className="shortcut-highlight">Click</span> the tag to list all linked objects or <span className="shortcut-highlight">Shift + Click</span> to jump to the first linked object.</p>
            <p>You can also use the command palette to search for objects and tags.</p>
            <p>You can right click on a child object in the side bar to delete it.</p>
            <p>When adding a new child, you can press <span className="shortcut-highlight">Enter</span> in the name to create it. You can also press <span className="shortcut-highlight">Ctrl + Enter</span> to create it and jump straight into the new object.</p>
            <p>You can press <span className="shortcut-highlight">{getProperShortcutValue(shortcuts.linkLastWord)}</span> to link the last word in the current object to another object.</p>
            <p>You can lock and unlock objects to prevent them from being edited. (shortcut: <span className="shortcut-highlight">{getProperShortcutValue(shortcuts.toggleLock)}</span>)</p>
            <p>You can press <span className="shortcut-highlight">{getProperShortcutValue(shortcuts.goToParent)}</span> to go to the parent object.</p>
            <hr />
            <p>You can send me bug reports or feature requests at <a className="email-link" title="Click to email me, right click to copy" href="mailto:bugreports.wolfpaw@gmail.com" onMouseUp={e => { e.preventDefault(); if (e.button === 2) { navigator.clipboard.writeText('bugreports.wolfpaw@gmail.com').catch(() => null) } }}>bugreports.wolfpaw@gmail.com <i className="ri-cursor-line"></i></a></p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HelpModal
