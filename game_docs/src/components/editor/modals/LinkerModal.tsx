/**
 * editor/modals/LinkerModal.tsx
 *
 * The "Link to object" modal that lets the user search for existing objects to
 * link to, or type a new name to create one.
 *
 * Two-phase interaction:
 *  1. The user types in the search box; results are shown as a flat list.
 *  2. If the chosen name matches multiple objects (different paths), a path-
 *     disambiguation sub-list is shown instead so the user can pick the right one.
 *
 * When `linkerTagId` is already set the link token already exists; otherwise a
 * new tag is created on commit.
 */

import React from 'react'
import ModalShell from '../ModalShell'

interface LinkerModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  /** Current search input value. */
  linkerInput: string
  /** Fuzzy-search matches for the current query. */
  linkerMatches: Array<{ id: string; name: string; path?: string }>
  /** When non-null, a disambiguation list of path-annotated results is shown. */
  pathChoices: Array<{ id: string; name: string; path: string }>
  /** The existing tag id when editing an existing link, or null for a new one. */
  linkerTagId: string | null
  /** Index of the currently keyboard-highlighted result row. */
  linkerSelIndex: number
  /** Whether this was opened via the "link last word" shortcut. */
  isLinkLastWordMode: boolean
  /** Ref for the results list container (used for programmatic arrow-key scrolling). */
  linkerResultsRef: React.RefObject<HTMLDivElement>
  onInputChange: (v: string) => void
  onInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** Selects a path-disambiguation result as the link target. */
  onSelectPathChoice: (choice: { id: string; name: string; path: string }) => void
  /** Selects a fuzzy-search match as the link target. */
  onSelectMatch: (match: { id: string; name: string; path?: string }) => void
  onClose: () => void
}

/** Search-and-link modal for creating or updating object link tokens in the editor. */
const LinkerModal: React.FC<LinkerModalProps> = ({
  visible,
  linkerInput,
  linkerMatches,
  pathChoices,
  linkerTagId,
  linkerSelIndex,
  isLinkLastWordMode,
  linkerResultsRef,
  onInputChange,
  onInputKeyDown,
  onSelectPathChoice,
  onSelectMatch,
  onClose,
}) => {
  if (!visible) return null
  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="dialog-card"
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      >
        <h3 className="mt-0">Link to object</h3>
        <div className="flex-row">
          <input
            value={linkerInput}
            autoFocus
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="flex-1"
            placeholder="Search or type new name"
          />
          {linkerTagId ? <span title="Existing link">🔗</span> : <span title="New item">⎇</span>}
        </div>

        {pathChoices.length > 0 ? (
          <div className="overflow-x-hidden mt-10 maxh-260 border-top" ref={linkerResultsRef}>
            <ul className="list-reset">
              {pathChoices.map((pc, idx) => (
                <li
                  key={pc.id}
                  className="list-item-click"
                  style={{ background: idx === linkerSelIndex ? '#333' : undefined }}
                  onClick={() => onSelectPathChoice(pc)}
                  dangerouslySetInnerHTML={{ __html: pc.path }}
                />
              ))}
            </ul>
          </div>
        ) : (
          <div className="overflow-x-hidden mt-10 maxh-260 border-top" ref={linkerResultsRef}>
            {linkerMatches.length === 0 ? (
              <div className="muted pad-8">No objects</div>
            ) : (
              <ul className="list-reset">
                {linkerMatches.map((m, idx) => (
                  <li
                    key={m.id}
                    className="list-item-click"
                    style={{ background: idx === linkerSelIndex ? '#333' : undefined }}
                    onClick={() => onSelectMatch(m)}
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default LinkerModal
