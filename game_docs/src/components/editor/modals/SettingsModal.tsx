/**
 * editor/modals/SettingsModal.tsx
 *
 * The Settings modal — a two-column panel for all persistent UI preferences:
 *  - Left column: colour palette, type management, hover/sidebar tuning, fonts,
 *    and display toggle checkboxes.
 *  - Right column: keyboard shortcut bindings and template management.
 *
 * All settings values are owned by `useEditorSettings` (and related hooks) in
 * Editor.tsx; this component only renders them and calls change handlers.
 */

import React from 'react'
import ShortcutInput from '../../ShortcutInput'
import type { CustomColors, FontSettings, PaletteKey, ShortcutSettings } from '../useEditorSettings'
import type { TemplateDef } from '../types'

interface SettingsModalProps {
  /** Whether the modal is visible. */
  visible: boolean
  paletteKey: PaletteKey
  customColors: CustomColors
  fonts: FontSettings
  customFont: { fontName: string; fontPath: string; fileName: string } | null
  shortcuts: ShortcutSettings
  hoverDebounce: number
  sidebarWidth: number
  toggleStylingOptions: boolean
  exportTemplateStyled: boolean
  showTemplateFieldLabels: boolean
  pdfInlinePreferred: boolean
  templateDefs: TemplateDef[]
  /** Whether the template editor is currently in raw source mode. */
  templateRawMode: boolean
  /** The active campaign id (used for the "Open editor POC" button). */
  campaignId: string

  setPaletteKey: (k: PaletteKey) => void
  setCustomColors: React.Dispatch<React.SetStateAction<CustomColors>>
  setFonts: React.Dispatch<React.SetStateAction<FontSettings>>
  setShortcuts: React.Dispatch<React.SetStateAction<ShortcutSettings>>
  setHoverDebounce: (v: number) => void
  setSidebarWidth: (v: number) => void
  setToggleStylingOptions: (v: boolean) => void
  setExportTemplateStyled: (v: boolean) => void
  setShowTemplateFieldLabels: (v: boolean) => void
  setPdfInlinePreferred: (v: boolean) => void
  applyPalette: (key: PaletteKey, colors: CustomColors | null) => void
  applyFonts: (f: FontSettings) => void

  onClose: () => void
  onSave: () => void
  /** Opens the Type Manager modal (closes settings first). */
  onOpenTypeManager: () => void
  /** Opens the template editor for a new or existing template. */
  onOpenTemplateEditor: (tpl?: TemplateDef | null) => void
  /** Opens the template instance library modal. */
  onOpenTemplateInstanceLibrary: () => void
  /** Toggles the template editor between visual and raw modes. */
  onToggleTemplateMode: () => void
  /** Deletes a template definition by id. */
  onDeleteTemplate: (id: string) => void
  onChooseFontFile: () => void
}

/** Two-column settings panel for all editor preferences and template management. */
const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  paletteKey, customColors, fonts, customFont, shortcuts,
  hoverDebounce, sidebarWidth, toggleStylingOptions, exportTemplateStyled,
  showTemplateFieldLabels, pdfInlinePreferred,
  templateDefs, templateRawMode, campaignId,
  setPaletteKey, setCustomColors, setFonts, setShortcuts,
  setHoverDebounce, setSidebarWidth, setToggleStylingOptions,
  setExportTemplateStyled, setShowTemplateFieldLabels, setPdfInlinePreferred,
  applyPalette, applyFonts,
  onClose, onSave, onOpenTypeManager, onOpenTemplateEditor,
  onOpenTemplateInstanceLibrary, onToggleTemplateMode, onDeleteTemplate,
  onChooseFontFile,
}) => {
  if (!visible) return null
  return (
    <div
      className="settings-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="settings-width" onClick={e => e.stopPropagation()}>
        <div className="settings-card">
          <div className="settings-header">
            <h3 className="m-0">Settings</h3>
            <div className="flex-gap-8">
              <button onClick={onClose}>Close</button>
              <button onClick={onSave}>Save</button>
            </div>
          </div>

          <div className="settings-columns">
            {/* Left column */}
            <div className="settings-col">
              <div className="settings-group">
                <label className="box-title">Color palette</label>
                <select
                  value={paletteKey}
                  onChange={e => { const k = e.target.value as PaletteKey; setPaletteKey(k); applyPalette(k, null) }}
                  className="settings-select"
                >
                  <option value="dracula">Dracula</option>
                  <option value="solarized-dark">Solarized (Dark)</option>
                  <option value="solarized-light">Solarized (Light)</option>
                  <option value="github-dark">GitHub (Dark)</option>
                  <option value="github-light">GitHub (Light)</option>
                  <option value="night-owl">Night Owl</option>
                  <option value="monokai">Monokai</option>
                  <option value="parchment">Parchment</option>
                  <option value="primary-blue">Primary Blue</option>
                  <option value="primary-green">Primary Green</option>
                  <option value="custom">Custom…</option>
                </select>
                {paletteKey === 'custom' && (
                  <div className="settings-custom-palette">
                    <label>Primary <input type="color" value={customColors.primary} onChange={e => setCustomColors(c => ({ ...c, primary: e.target.value }))} /></label>
                    <label>Surface <input type="color" value={customColors.surface} onChange={e => setCustomColors(c => ({ ...c, surface: e.target.value }))} /></label>
                    <label>Text <input type="color" value={customColors.text} onChange={e => setCustomColors(c => ({ ...c, text: e.target.value }))} /></label>
                    <label>Tag BG <input type="color" value={customColors.tagBg.startsWith('#') ? customColors.tagBg : '#6495ED'} onChange={e => setCustomColors(c => ({ ...c, tagBg: e.target.value }))} /></label>
                    <label>Tag Border <input type="color" value={customColors.tagBorder} onChange={e => setCustomColors(c => ({ ...c, tagBorder: e.target.value }))} /></label>
                    <button onClick={() => applyPalette('custom', customColors)}>Preview</button>
                  </div>
                )}
              </div>

              <div className="settings-group">
                <label className="box-title">Type management</label>
                <div className="settings-flex-wrap">
                  <button onClick={onOpenTypeManager}>Open Type Manager</button>
                </div>
              </div>

              <div className="settings-group">
                <label className="box-title">Hover Settings</label>
                <div className="debounce-settings settings-flex-wrap">
                  <label className="debounce-label">
                    Hover debounce (ms)
                    <input
                      type="number" min={0} max={2000} step={50}
                      value={hoverDebounce}
                      onChange={e => setHoverDebounce(parseInt(e.target.value || '300', 10))}
                      className="settings-number"
                    />
                  </label>
                </div>
              </div>

              <div className="settings-group">
                <label className="box-title">Sidebar Settings</label>
                <div className="debounce-settings settings-flex-wrap">
                  <label className="debounce-label">
                    Sidebar width (px)
                    <input
                      type="number" min={200} max={500} step={10}
                      value={sidebarWidth}
                      onChange={async e => {
                        const value = parseInt(e.target.value || '200', 10)
                        setSidebarWidth(value)
                        try { await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.sidebarWidth', value) } catch {}
                      }}
                      className="settings-number"
                    />
                  </label>
                </div>
              </div>

              <div className="settings-group">
                <label className="box-title">Fonts</label>
                <div className="settings-flex-wrap">
                  <label className="w-260" style={{ flex: '1 1 260px' }}>
                    Family
                    <div className="settings-flex">
                      <select
                        value={fonts.family}
                        onChange={e => { const f = { ...fonts, family: e.target.value }; setFonts(f); applyFonts(f) }}
                        className="flex-1"
                      >
                        <option value="system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif">System UI</option>
                        <option value="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">Inter</option>
                        <option value="Segoe UI, system-ui, -apple-system, Roboto, Inter, sans-serif">Segoe UI</option>
                        <option value="Roboto, system-ui, -apple-system, Segoe UI, Inter, sans-serif">Roboto</option>
                        <option value="Source Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif">Source Sans Pro</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Garamond, serif">Garamond</option>
                        <option value="Palatino Linotype, Book Antiqua, Palatino, serif">Palatino</option>
                        {customFont?.fontName && <option value={customFont.fontName}>Custom ({customFont.fontName})</option>}
                      </select>
                    </div>
                  </label>
                  <label className="w-110">
                    Size
                    <input
                      type="number" min={10} max={24}
                      value={fonts.size}
                      onChange={e => { const f = { ...fonts, size: parseInt(e.target.value || '14', 10) }; setFonts(f); applyFonts(f) }}
                      className="settings-number"
                    />
                  </label>
                  <label className="w-120">
                    Weight
                    <input
                      type="number" min={100} max={900} step={100}
                      value={fonts.weight}
                      onChange={e => { const f = { ...fonts, weight: parseInt(e.target.value || '400', 10) }; setFonts(f); applyFonts(f) }}
                      className="settings-number"
                    />
                  </label>
                  <button className="font-browse-button" title="Choose font file" onClick={onChooseFontFile}>Browse…</button>
                </div>
              </div>

              <div className="settings-group">
                <label className="box-title">Toggle Styling Options</label>
                <div className="styling-settings settings-flex-wrap">
                  <div className="single-column-checkbox">
                    <label className="styling-label">
                      Toggle Styling Options
                      <input type="checkbox" checked={toggleStylingOptions} onChange={() => setToggleStylingOptions(!toggleStylingOptions)} />
                    </label>
                  </div>
                  <div className="single-column-checkbox">
                    <label className="styling-label">
                      Styled template export
                      <input type="checkbox" checked={exportTemplateStyled} onChange={() => setExportTemplateStyled(!exportTemplateStyled)} />
                    </label>
                  </div>
                  <div className="single-column-checkbox">
                    <label className="styling-label">
                      Show template field labels
                      <input type="checkbox" checked={showTemplateFieldLabels} onChange={() => setShowTemplateFieldLabels(!showTemplateFieldLabels)} />
                    </label>
                  </div>
                  <div className="single-column-checkbox">
                    <label className="styling-label">
                      Open PDFs inline
                      <input type="checkbox" checked={pdfInlinePreferred} onChange={() => setPdfInlinePreferred(!pdfInlinePreferred)} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: shortcuts + templates */}
            <div className="settings-right">
              <div className="settings-title">Keyboard shortcuts</div>
              <div className="settings-grid-2">
                <div className="settings-shortcut-row"><label>Settings </label><ShortcutInput value={shortcuts.settings} onChange={v => setShortcuts(s => ({ ...s, settings: v }))} placeholder="F1" /></div>
                <div className="settings-shortcut-row"><label>Edit object </label><ShortcutInput value={shortcuts.editObject} onChange={v => setShortcuts(s => ({ ...s, editObject: v }))} placeholder="F2" /></div>
                <div className="settings-shortcut-row"><label>Search palette </label><ShortcutInput value={shortcuts.command} onChange={v => setShortcuts(s => ({ ...s, command: v }))} placeholder="Ctrl+K" /></div>
                <div className="settings-shortcut-row"><label>Command palette </label><ShortcutInput value={shortcuts.command2} onChange={v => setShortcuts(s => ({ ...s, command2: v }))} placeholder="Ctrl+Shift+K" /></div>
                <div className="settings-shortcut-row"><label>New child </label><ShortcutInput value={shortcuts.newChild} onChange={v => setShortcuts(s => ({ ...s, newChild: v }))} placeholder="Ctrl+N" /></div>
                <div className="settings-shortcut-row"><label>Add image </label><ShortcutInput value={shortcuts.addImage} onChange={v => setShortcuts(s => ({ ...s, addImage: v }))} placeholder="Ctrl+I" /></div>
                <div className="settings-shortcut-row"><label>Open Misc stuff </label><ShortcutInput value={shortcuts.miscStuff} onChange={v => setShortcuts(s => ({ ...s, miscStuff: v }))} placeholder="Ctrl+Shift+M" /></div>
                <div className="settings-shortcut-row"><label>Export to Share </label><ShortcutInput value={shortcuts.exportShare} onChange={v => setShortcuts(s => ({ ...s, exportShare: v }))} placeholder="Ctrl+E" /></div>
                <div className="settings-shortcut-row"><label>Toggle lock </label><ShortcutInput value={shortcuts.toggleLock} onChange={v => setShortcuts(s => ({ ...s, toggleLock: v }))} placeholder="Ctrl+L" /></div>
                <div className="settings-shortcut-row"><label>Go to parent </label><ShortcutInput value={shortcuts.goToParent} onChange={v => setShortcuts(s => ({ ...s, goToParent: v }))} placeholder="Ctrl+ARROWUP" /></div>
                <div className="settings-shortcut-row"><label>Help </label><ShortcutInput value={shortcuts.showHelp} onChange={v => setShortcuts(s => ({ ...s, showHelp: v }))} placeholder="Ctrl+H" /></div>
              </div>

              <div className="settings-title mt-12">Templates</div>
              <div className="settings-group-right">
                <div className="actions">
                  <button onClick={() => onOpenTemplateEditor(null)}>New template</button>
                  <button onClick={onOpenTemplateInstanceLibrary}>Manage instances</button>
                  <button onClick={() => {
                    const url = `${location.origin}${location.pathname}#/editor-next/${encodeURIComponent(campaignId)}`
                    window.open(url, '_blank', 'popup=yes,width=1400,height=900')
                  }}>Open editor POC</button>
                  <button onClick={onToggleTemplateMode}>{templateRawMode ? 'Visual mode' : 'Advanced source mode'}</button>
                </div>
                <div className="maxh-260 border-top mt-10">
                  <ul className="list-reset">
                    {templateDefs.map(tpl => (
                      <li key={tpl.id} className="list-item-row">
                        <span className="tag-name">{tpl.name}{tpl.is_builtin ? ' (built-in)' : ''}</span>
                        <div className="flex-gap-6">
                          <button onClick={() => onOpenTemplateEditor(tpl)}>Edit</button>
                          {tpl.is_builtin ? null : (
                            <button onClick={() => onDeleteTemplate(tpl.id)}>Delete</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
