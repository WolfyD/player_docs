/**
 * editor/useEditorSettings.ts
 *
 * Custom hook that owns all user-configurable UI settings for the editor:
 * colour palettes, font preferences, keyboard shortcuts, hover debounce, and
 * various display toggles.
 *
 * On mount it reads all persisted values from the main process via
 * `gamedocs:get-setting` IPC calls and applies them immediately to the page's
 * CSS custom properties. This guarantees that the editor is styled correctly
 * before the first meaningful paint.
 *
 * State owned here is intentionally separated from the campaign/object navigation
 * state in Editor.tsx so settings changes don't trigger unnecessary re-renders of
 * the content tree.
 *
 * Exports:
 *  - useEditorSettings()  → returns all settings values, setters,
 *                           applyPalette(), applyFonts(),
 *                           settingsLoadedRef, loadedStylingEnabledRef
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type PaletteKey =
  | 'dracula' | 'solarized-dark' | 'solarized-light'
  | 'github-dark' | 'github-light' | 'night-owl'
  | 'monokai' | 'parchment' | 'primary-blue' | 'primary-green' | 'custom'

export type CustomColors = {
  primary: string
  surface: string
  text: string
  tagBg: string
  tagBorder: string
}

export type FontSettings = {
  family: string
  size: number
  weight: number
  color: string
}

export type ShortcutSettings = {
  settings: string
  editObject: string
  command: string
  command2: string
  newChild: string
  addImage: string
  miscStuff: string
  exportShare: string
  toggleLock: string
  goToParent: string
  goToPreviousSibling: string
  goToNextSibling: string
  linkLastWord: string
  showHelp: string
}

const DEFAULT_SHORTCUTS: ShortcutSettings = {
  settings: 'F1',
  editObject: 'F2',
  command: 'Ctrl+K',
  command2: 'Ctrl+Shift+K',
  newChild: 'Ctrl+N',
  addImage: 'Ctrl+I',
  miscStuff: 'Ctrl+Shift+M',
  exportShare: 'Ctrl+E',
  toggleLock: 'Ctrl+L',
  goToParent: 'Ctrl+ARROWUP',
  goToPreviousSibling: 'Ctrl+ArrowLeft',
  goToNextSibling: 'Ctrl+ArrowRight',
  linkLastWord: 'Ctrl+Shift+L',
  showHelp: 'Ctrl+H',
}

const DEFAULT_FONTS: FontSettings = {
  family: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif',
  size: 14,
  weight: 400,
  color: '#e5e5e5',
}

const DEFAULT_COLORS: CustomColors = {
  primary: '#6495ED',
  surface: '#1e1e1e',
  text: '#e5e5e5',
  tagBg: 'rgba(100,149,237,0.2)',
  tagBorder: '#6495ED',
}

/** Per-palette built-in theme colour definitions. */
const PALETTE_THEMES: Record<string, CustomColors> = {
  'dracula': { primary: '#bd93f9', surface: '#282a36', text: '#f8f8f2', tagBg: 'rgba(189,147,249,0.25)', tagBorder: '#bd93f9' },
  'solarized-dark': { primary: '#268bd2', surface: '#002b36', text: '#eee8d5', tagBg: 'rgba(38,139,210,0.2)', tagBorder: '#268bd2' },
  'solarized-light': { primary: '#268bd2', surface: '#fdf6e3', text: '#073642', tagBg: 'rgba(38,139,210,0.15)', tagBorder: '#268bd2' },
  'github-dark': { primary: '#2f81f7', surface: '#0d1117', text: '#c9d1d9', tagBg: 'rgba(47,129,247,0.2)', tagBorder: '#2f81f7' },
  'github-light': { primary: '#0969da', surface: '#ffffff', text: '#24292f', tagBg: 'rgba(9,105,218,0.15)', tagBorder: '#0969da' },
  'night-owl': { primary: '#7fdbca', surface: '#011627', text: '#d6deeb', tagBg: 'rgba(127,219,202,0.22)', tagBorder: '#7fdbca' },
  'monokai': { primary: '#a6e22e', surface: '#272822', text: '#f8f8f2', tagBg: 'rgba(166,226,46,0.25)', tagBorder: '#a6e22e' },
  'parchment': { primary: '#7b5e2a', surface: '#fbf3dc', text: '#3a2a0a', tagBg: 'rgba(123,94,42,0.18)', tagBorder: '#7b5e2a' },
  'primary-blue': { primary: '#3b82f6', surface: '#0b1220', text: '#e5e7eb', tagBg: 'rgba(59,130,246,0.22)', tagBorder: '#3b82f6' },
  'primary-green': { primary: '#22c55e', surface: '#0b1a12', text: '#e5e7eb', tagBg: 'rgba(34,197,94,0.22)', tagBorder: '#22c55e' },
}

export interface UseEditorSettingsReturn {
  paletteKey: PaletteKey
  setPaletteKey: React.Dispatch<React.SetStateAction<PaletteKey>>
  customColors: CustomColors
  setCustomColors: React.Dispatch<React.SetStateAction<CustomColors>>
  fonts: FontSettings
  setFonts: React.Dispatch<React.SetStateAction<FontSettings>>
  customFont: { fontName: string; fontPath: string; fileName: string } | null
  setCustomFont: React.Dispatch<React.SetStateAction<{ fontName: string; fontPath: string; fileName: string } | null>>
  shortcuts: ShortcutSettings
  setShortcuts: React.Dispatch<React.SetStateAction<ShortcutSettings>>
  hoverDebounce: number
  setHoverDebounce: React.Dispatch<React.SetStateAction<number>>
  sidebarWidth: number
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>
  toggleStylingOptions: boolean
  setToggleStylingOptions: React.Dispatch<React.SetStateAction<boolean>>
  exportTemplateStyled: boolean
  setExportTemplateStyled: React.Dispatch<React.SetStateAction<boolean>>
  showTemplateFieldLabels: boolean
  setShowTemplateFieldLabels: React.Dispatch<React.SetStateAction<boolean>>
  pdfInlinePreferred: boolean
  setPdfInlinePreferred: React.Dispatch<React.SetStateAction<boolean>>
  /** Applies a palette to the document's CSS custom properties immediately. */
  applyPalette: (key: PaletteKey, colors: CustomColors | null) => void
  /** Applies font settings to the document's CSS custom properties immediately. */
  applyFonts: (f: FontSettings) => void
  /** Set to `true` once the async settings-load effect has completed. Used by
   *  the editor to decide whether to use the loaded value or the optimistic
   *  default when rendering immediately after mount. */
  settingsLoadedRef: React.MutableRefObject<boolean>
  /** Mirrors `toggleStylingOptions` but updated synchronously during the async
   *  settings load so that `selectObject` renders correctly even before the
   *  React state update has propagated. */
  loadedStylingEnabledRef: React.MutableRefObject<boolean>
}

// Needed for the return type annotation above
import type React from 'react'

/**
 * Loads all editor UI settings from the main process on mount and exposes them
 * as reactive state together with helpers for applying theme changes to CSS
 * custom properties.
 */
export function useEditorSettings(): UseEditorSettingsReturn {
  const [paletteKey, setPaletteKey] = useState<PaletteKey>('dracula')
  const [customColors, setCustomColors] = useState<CustomColors>(DEFAULT_COLORS)
  const [fonts, setFonts] = useState<FontSettings>(DEFAULT_FONTS)
  const [customFont, setCustomFont] = useState<{ fontName: string; fontPath: string; fileName: string } | null>(null)
  const [shortcuts, setShortcuts] = useState<ShortcutSettings>(DEFAULT_SHORTCUTS)
  const [hoverDebounce, setHoverDebounce] = useState(300)
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [toggleStylingOptions, setToggleStylingOptions] = useState(true)
  const [exportTemplateStyled, setExportTemplateStyled] = useState(true)
  const [showTemplateFieldLabels, setShowTemplateFieldLabels] = useState(false)
  const [pdfInlinePreferred, setPdfInlinePreferred] = useState(true)

  const settingsLoadedRef = useRef<boolean>(false)
  const loadedStylingEnabledRef = useRef<boolean>(true)

  /** Writes the chosen palette's colour values to the document's CSS custom
   *  properties so every themed element updates immediately without a React
   *  re-render cycle. Also initialises font custom properties to defaults if
   *  they haven't been set yet. */
  const applyPalette = useCallback((key: PaletteKey, colors: CustomColors | null) => {
    const rootEl = document.documentElement
    const c = key === 'custom' ? (colors || customColors) : (PALETTE_THEMES[key] || DEFAULT_COLORS)
    rootEl.style.setProperty('--pd-primary', c.primary)
    rootEl.style.setProperty('--pd-surface', c.surface)
    rootEl.style.setProperty('--pd-text', c.text)
    rootEl.style.setProperty('--pd-tag-bg', c.tagBg)
    rootEl.style.setProperty('--pd-tag-border', c.tagBorder)
    if (getComputedStyle(rootEl).getPropertyValue('--pd-font-family') === '') {
      rootEl.style.setProperty('--pd-font-family', DEFAULT_FONTS.family)
    }
    if (getComputedStyle(rootEl).getPropertyValue('--pd-font-size') === '') {
      rootEl.style.setProperty('--pd-font-size', '14px')
    }
    if (getComputedStyle(rootEl).getPropertyValue('--pd-font-weight') === '') {
      rootEl.style.setProperty('--pd-font-weight', '400')
    }
  }, [customColors])

  /** Applies font settings to the relevant CSS custom properties. */
  const applyFonts = useCallback((f: FontSettings) => {
    const rootEl = document.documentElement
    rootEl.style.setProperty('--pd-font-family', f.family)
    rootEl.style.setProperty('--pd-font-size', `${f.size}px`)
    rootEl.style.setProperty('--pd-font-weight', `${f.weight}`)
    rootEl.style.setProperty('--pd-text', f.color)
  }, [])

  /** Loads all persisted settings from the main process once on mount. Reads
   *  palette, fonts, custom font, shortcuts, and various display toggles in a
   *  single async pass then applies them to state and CSS variables. */
  useEffect(() => {
    ;(async () => {
      const savedPalette = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.palette').catch(() => null)
      if (savedPalette && savedPalette.key) {
        setPaletteKey(savedPalette.key)
        if (savedPalette.key === 'custom' && savedPalette.colors) setCustomColors(savedPalette.colors)
        applyPalette(savedPalette.key, savedPalette.colors || null)
      } else {
        applyPalette('dracula', null)
      }

      const savedFonts = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.fonts').catch(() => null)
      const customFontData = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.customFont').catch(() => null)

      if (customFontData?.fontPath && customFontData?.fontName) {
        setCustomFont(customFontData)
        try {
          const loaded = await window.ipcRenderer.invoke('gamedocs:read-font-as-dataurl', customFontData.fontPath).catch(() => null)
          if (loaded?.dataUrl) {
            const styleTagId = `pd-font-${customFontData.fontName}`
            if (!document.getElementById(styleTagId)) {
              const st = document.createElement('style')
              st.id = styleTagId
              st.innerHTML = `@font-face{ font-family: "${customFontData.fontName}"; src: url(${loaded.dataUrl}) format("${(loaded.mime || '').includes('woff') ? 'woff2' : 'truetype'}"); font-weight: 100 900; font-style: normal; font-display: swap; }`
              document.head.appendChild(st)
            }
          }
        } catch (e) {
          console.warn('Failed to load custom font:', e)
        }
      }

      if (savedFonts) {
        const f: FontSettings = {
          family: savedFonts.family || DEFAULT_FONTS.family,
          size: typeof savedFonts.size === 'number' ? savedFonts.size : DEFAULT_FONTS.size,
          weight: typeof savedFonts.weight === 'number' ? savedFonts.weight : DEFAULT_FONTS.weight,
          color: savedFonts.color || DEFAULT_FONTS.color,
        }
        setFonts(f)
        applyFonts(f)
      } else {
        applyFonts(DEFAULT_FONTS)
      }

      const savedShortcuts = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.shortcuts').catch(() => null)
      if (savedShortcuts) {
        setShortcuts({
          settings: savedShortcuts.settings || 'F1',
          editObject: savedShortcuts.editObject || 'F2',
          command: savedShortcuts.command || 'Ctrl+K',
          command2: savedShortcuts.command2 || 'Ctrl+Shift+K',
          newChild: savedShortcuts.newChild || 'Ctrl+N',
          addImage: savedShortcuts.addImage || 'Ctrl+I',
          miscStuff: savedShortcuts.miscStuff || 'Ctrl+Shift+M',
          exportShare: savedShortcuts.exportShare || 'Ctrl+E',
          toggleLock: savedShortcuts.toggleLock || 'Ctrl+L',
          goToParent: savedShortcuts.goToParent || 'Ctrl+ARROWUP',
          goToPreviousSibling: savedShortcuts.goToPreviousSibling || 'Ctrl+ArrowLeft',
          goToNextSibling: savedShortcuts.goToNextSibling || 'Ctrl+ArrowRight',
          linkLastWord: savedShortcuts.linkLastWord || 'Ctrl+Shift+L',
          showHelp: savedShortcuts.showHelp || 'Ctrl+H',
        })
      }

      const savedHoverDebounce = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.hoverDebounce').catch(() => null)
      if (savedHoverDebounce && typeof savedHoverDebounce === 'number') setHoverDebounce(savedHoverDebounce)

      const savedSidebarWidth = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.sidebarWidth').catch(() => null)
      if (savedSidebarWidth && typeof savedSidebarWidth === 'number') setSidebarWidth(savedSidebarWidth)

      const savedStylingEnabled = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.stylingEnabled').catch(() => null)
      const stylingEnabled = typeof savedStylingEnabled === 'boolean' ? savedStylingEnabled : true
      loadedStylingEnabledRef.current = stylingEnabled
      setToggleStylingOptions(stylingEnabled)

      const savedExportStyled = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.exportStyledTemplates').catch(() => null)
      if (typeof savedExportStyled === 'boolean') setExportTemplateStyled(savedExportStyled)

      const savedShowFieldLabels = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.templateShowFieldLabels').catch(() => null)
      if (typeof savedShowFieldLabels === 'boolean') setShowTemplateFieldLabels(savedShowFieldLabels)

      const savedPdfInlinePreferred = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.pdfInlinePreferred').catch(() => null)
      if (typeof savedPdfInlinePreferred === 'boolean') setPdfInlinePreferred(savedPdfInlinePreferred)

      settingsLoadedRef.current = true
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    paletteKey, setPaletteKey,
    customColors, setCustomColors,
    fonts, setFonts,
    customFont, setCustomFont,
    shortcuts, setShortcuts,
    hoverDebounce, setHoverDebounce,
    sidebarWidth, setSidebarWidth,
    toggleStylingOptions, setToggleStylingOptions,
    exportTemplateStyled, setExportTemplateStyled,
    showTemplateFieldLabels, setShowTemplateFieldLabels,
    pdfInlinePreferred, setPdfInlinePreferred,
    applyPalette,
    applyFonts,
    settingsLoadedRef,
    loadedStylingEnabledRef,
  }
}
