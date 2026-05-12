/**
 * editor/modals/CommandPalette.tsx
 *
 * The command palette overlay (Ctrl+K / Ctrl+Shift+K). Supports two modes:
 *  - Search mode: fuzzy-search objects and tags by typing normally.
 *  - Command mode: prefix input with `>` to filter and run commands; some
 *    commands open a secondary parameter-selection step.
 *
 * Navigation: ArrowUp/Down move the highlight, Enter commits the selection,
 * Escape backs out (param mode → command mode → close).
 */

import React from 'react'

interface CommandPaletteProps {
  /** Whether the palette is visible. */
  visible: boolean
  /** Current text in the search input. */
  paletteInput: string
  /** Whether the input currently starts with `>` (command mode active). */
  isCommandMode: boolean
  /** Whether a command has been selected and is waiting for a parameter value. */
  cmdParamMode: boolean
  /** The command currently selected for parameter input. */
  selectedCommand: any | null
  /** Index of the currently highlighted result row. */
  paletteSelIndex: number
  /** Commands filtered by the current search term. */
  filteredCommands: any[]
  /** Search results for objects and tags in non-command mode. */
  paletteResults: { objects: Array<{ id: string; name: string }>; tags: Array<{ id: string; object_id: string }> }
  /** Ref forwarded to the results container for programmatic scroll. */
  paletteResultsRef: React.RefObject<HTMLDivElement>
  onInputChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onClose: () => void
  /** Navigates to the given object and closes the palette. */
  onSelectObject: (id: string, name: string) => void
  /** Runs a command by id when the command has no parameters. */
  runCommand: (id: string) => void
  /** Transitions to param-input mode for commands that require a parameter. */
  beginParamMode: (cmd: any) => void
  /** Commits the typed or selected parameter value and runs the command. */
  commitParam: (value: string) => void
  setPaletteSelIndex: React.Dispatch<React.SetStateAction<number>>
  /** Returns the param metadata `{ key, choices? }` for the given command. */
  getParamMeta: (cmd: any) => { key: string; choices?: any[] }
}

/** Floating command/search palette overlay rendered over the editor. */
const CommandPalette: React.FC<CommandPaletteProps> = ({
  visible,
  paletteInput,
  isCommandMode,
  cmdParamMode,
  selectedCommand,
  paletteSelIndex,
  filteredCommands,
  paletteResults,
  paletteResultsRef,
  onInputChange,
  onKeyDown,
  onClose,
  onSelectObject,
  runCommand,
  beginParamMode,
  commitParam,
  setPaletteSelIndex,
  getParamMeta,
}) => {
  if (!visible) return null
  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-container" onClick={e => e.stopPropagation()}>
        <div className="palette-card">
          {cmdParamMode && selectedCommand ? (
            <div className="muted pad-8" style={{ marginBottom: 6 }}>{selectedCommand.description || ''}</div>
          ) : null}
          <input
            autoFocus
            placeholder={
              isCommandMode
                ? cmdParamMode && selectedCommand
                  ? (() => {
                      const meta = getParamMeta(selectedCommand)
                      if (meta.key === 'palette') return 'palette'
                      if (meta.key === 'color') return "color eg: 'red', '(255, 0, 0)' or '#FF0000'"
                      return 'Enter parameter'
                    })()
                  : 'Type > to run a command'
                : 'Search objects, tags, or type a command'
            }
            value={paletteInput}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            className="palette-input"
          />
          <div className="palette-results" ref={paletteResultsRef}>
            {isCommandMode ? (
              cmdParamMode && selectedCommand ? (
                (() => {
                  const meta = getParamMeta(selectedCommand)
                  const choices: any[] = meta.choices || []
                  const term = paletteInput.trim().toLowerCase()
                  const filtered = choices.filter(ch => String(ch).toLowerCase().includes(term))
                  return filtered.length === 0 ? (
                    <div className="muted pad-8">Type a value and press Enter</div>
                  ) : (
                    <div className="pad-8">
                      <div className="palette-section-title">Choices</div>
                      {filtered.map((ch, idx) => (
                        <div
                          key={String(ch)}
                          className="palette-item"
                          style={{ background: idx === paletteSelIndex ? '#333' : undefined }}
                          onClick={() => commitParam(String(ch))}
                        >
                          {String(ch)}
                        </div>
                      ))}
                    </div>
                  )
                })()
              ) : (
                filteredCommands.length === 0 ? (
                  <div className="muted pad-8">No commands</div>
                ) : (
                  <div className="pad-8">
                    <div className="palette-section-title">Commands</div>
                    {filteredCommands.map((cmd, idx) => (
                      <div
                        key={cmd.id}
                        className="palette-item"
                        style={{ background: idx === paletteSelIndex ? '#333' : undefined }}
                        onClick={() => {
                          const hasParam = !!(cmd as any).parameters
                          if (!hasParam) runCommand(cmd.id)
                          else beginParamMode(cmd)
                        }}
                      >
                        {cmd.name}
                      </div>
                    ))}
                  </div>
                )
              )
            ) : (
              paletteResults.objects.length === 0 && paletteResults.tags.length === 0 ? (
                <div className="muted pad-8">No results</div>
              ) : (
                <>
                  {paletteResults.objects.length > 0 && (
                    <div className="pad-8">
                      <div className="palette-section-title">Objects</div>
                      {paletteResults.objects.map((o, idx) => (
                        <div
                          key={o.id}
                          className="palette-item"
                          style={{ background: idx === paletteSelIndex ? '#333' : undefined }}
                          onClick={() => { onClose(); onSelectObject(o.id, o.name) }}
                        >
                          {o.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {paletteResults.tags.length > 0 && (
                    <div className="pad-8">
                      <div className="palette-section-title">Tags</div>
                      {paletteResults.tags.map((t, idx) => {
                        const globalIdx = paletteResults.objects.length + idx
                        return (
                          <div
                            key={t.id}
                            className="palette-item"
                            style={{ background: globalIdx === paletteSelIndex ? '#333' : undefined }}
                            onClick={() => { onClose() }}
                          >
                            {t.id}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )
            )}
          </div>
          <div className="palette-footer"><span>Esc to close</span><span>Ctrl+K</span></div>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
