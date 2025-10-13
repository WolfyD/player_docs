import React, { useCallback, useEffect, useRef, useState } from 'react'
import './editor.css'
import Fuse from 'fuse.js'
import { confirmDialog, toast } from './Confirm'
import { logger } from '../utils/logger'

type Campaign = { id: string; name: string }

export const Editor: React.FC = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [root, setRoot] = useState<{ id: string; name: string; type: string } | null>(null)
  const [children, setChildren] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null)
  const [showCat, setShowCat] = useState(false)
  const [catName, setCatName] = useState('')
  const [catType, setCatType] = useState<'Place' | 'Person' | 'Lore' | 'Other'>('Other')
  const [catErr, setCatErr] = useState<string | null>(null)

  useEffect(() => {
    const id = location.hash.replace(/^#\/editor\//, '')
    if (!id) return
    ;(async () => {
      try {
        const row = await window.ipcRenderer.invoke('gamedocs:get-campaign', id)
        setCampaign(row)
        
        // Initialize logger for this campaign
        await logger.initialize(id)
        
        // Load root and its children
        const r = await window.ipcRenderer.invoke('gamedocs:get-root', id)
        setRoot(r)
        const ch = await window.ipcRenderer.invoke('gamedocs:list-children', id, r.id)
        setChildren(ch)
        setParent(null)
      } catch (e: any) {
        setError(e?.message || 'Failed to load campaign')
      }
    })()
  }, [])

  const getHeight = () => {
    let title = document.querySelector('.header_line')?.clientHeight || 0
    return `calc(100vh - ${30 + title + 10 + 10 + 110}px)`
  }

  const [desc, setDesc] = useState<string>('')
  const [activeId, setActiveId] = useState<string>('')
  const [activeName, setActiveName] = useState<string>('')
  const [activeLocked, setActiveLocked] = useState<boolean>(false)
  const [hasPlaces, setHasPlaces] = useState<boolean>(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const selectionRangeRef = useRef<Range | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean
    x: number
    y: number
    selText: string
  }>({ visible: false, x: 0, y: 0, selText: '' })
  const [showWizard, setShowWizard] = useState(false)
  const [wizardName, setWizardName] = useState('')
  const [wizardType, setWizardType] = useState<'Place' | 'Person' | 'Lore' | 'Other'>('Other')
  // Edit target picker when a tag links to multiple objects
  const [showEditPicker, setShowEditPicker] = useState(false)
  const [editPickerItems, setEditPickerItems] = useState<Array<{ id: string; name: string; path: string }>>([])
  // Target being edited (can differ from active object)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  // Linker modal state
  const [showLinker, setShowLinker] = useState(false)
  const [linkerInput, setLinkerInput] = useState('')
  const [linkerMatches, setLinkerMatches] = useState<Array<{ id: string; name: string; path?: string }>>([])
  const [linkerTagId, setLinkerTagId] = useState<string | null>(null)
  const [allObjects, setAllObjects] = useState<Array<{ id: string; name: string; parent_id: string | null }>>([])
  const [pathChoices, setPathChoices] = useState<Array<{ id: string; name: string; path: string }>>([])
  const fuseRef = useRef<Fuse<any> | null>(null)
  const [ctxLinkedTargets, setCtxLinkedTargets] = useState<Array<{ id: string; name: string; path: string }>>([])
  // Hover preview for single-target tags
  const [hoverCard, setHoverCard] = useState<{ visible: boolean; x: number; y: number; name: string; snippet: string; imageUrl: string | null }>({ visible: false, x: 0, y: 0, name: '', snippet: '', imageUrl: null })
  const [imageModal, setImageModal] = useState<{ visible: boolean; dataUrl: string | null }>({ visible: false, dataUrl: null })
  const lastHoverTagRef = useRef<string | null>(null)
  // Left-click menu for multi-target tags
  const [tagMenu, setTagMenu] = useState<{ visible: boolean; x: number; y: number; items: Array<{ id: string; name: string; path: string }>; hoverPreview: { id: string; name: string; snippet: string; imageUrl: string | null } | null; source?: 'dropdown' | 'tag' }>({ visible: false, x: 0, y: 0, items: [], hoverPreview: null, source: undefined })
  const ctxMenuRef = useRef<HTMLDivElement | null>(null)
  const tagMenuRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const [images, setImages] = useState<Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>>([])
  const [editImages, setEditImages] = useState<Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>>([])
  const [addPictureModal, setAddPictureModal] = useState(false)
  const [picName, setPicName] = useState('')
  const [picIsDefault, setPicIsDefault] = useState(true)
  const [picSource, setPicSource] = useState<{ type: 'file' | 'url'; value: string }>({ type: 'file', value: '' })
  const [showMisc, setShowMisc] = useState(false)

  // Command palette: commands and parameter flow
  const [isCommandMode, setIsCommandMode] = useState(false)
  const [filteredCommands, setFilteredCommands] = useState<any[]>([])
  const [cmdParamMode, setCmdParamMode] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<any | null>(null)
  const [paletteSelIndex, setPaletteSelIndex] = useState(0)
  const paletteResultsRef = useRef<HTMLDivElement | null>(null)

  // Test function to manually trigger missing image cleanup
  const handleTestImageCleanup = useCallback(async () => {
    if (!campaign?.id) return
    try {
      await window.ipcRenderer.invoke('gamedocs:cleanup-missing-images', campaign.id)
      toast('Image cleanup completed - check logs for details')
    } catch (error: any) {
      toast(`Image cleanup failed: ${error?.message || 'Unknown error'}`)
    }
  }, [campaign?.id])

  // Build a recursive tree of children for the current object and append as a nicely
  // formatted listing three lines below the existing description
  const handleListAllItems = useCallback(async () => {
    if (!activeId || !campaign || activeLocked) { setShowMisc(false); return }
    const campaignId = campaign.id
    type TNode = { id: string; name: string; children: TNode[] }
    async function fetchTree(pid: string): Promise<TNode[]> {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-children', campaignId, pid).catch(() => []) as Array<{ id: string; name: string }>
      const out: TNode[] = []
      for (const r of rows) {
        out.push({ id: r.id, name: r.name, children: await fetchTree(r.id) })
      }
      return out
    }
    const tree = await fetchTree(activeId)
    // Build tag map by ensuring links for contentful nodes
    const tagMap = new Map<string, string>()
    let created = 0
    async function ensureTags(nodes: TNode[]) {
      for (const n of nodes) {
        const has = await window.ipcRenderer.invoke('gamedocs:object-has-content', n.id).catch(() => false)
        if (has) {
          const res = await window.ipcRenderer.invoke('gamedocs:get-or-create-tag-for-target', campaignId, activeId, n.id).catch(() => null)
          if (res?.tagId) { tagMap.set(n.id, res.tagId); created++ }
        }
        if (n.children && n.children.length) await ensureTags(n.children)
      }
    }
    await ensureTags(tree)
    function renderTreeWithTokens(nodes: TNode[], depth = 0): string {
      const indent = '\t'.repeat(depth * 2)
      const branchNodes = nodes.filter(n => n.children && n.children.length)
      const leafNodes = nodes.filter(n => !n.children || n.children.length === 0)
      const lines: string[] = []
      for (const n of branchNodes) {
        const tag = tagMap.get(n.id)
        const label = tag ? `[[${n.name}|${tag}]]` : n.name
        lines.push(`${indent}- ${label}`)
        lines.push(renderTreeWithTokens(n.children, depth + 1))
      }
      if (leafNodes.length > 0) {
        const row = leafNodes.map(n => {
          const tag = tagMap.get(n.id)
          return tag ? `[[${n.name}|${tag}]]` : n.name
        }).join(', ')
        lines.push(`${indent}- ${row}`)
      }
      return lines.join('\n')
    }
    const header = ['Contents:', '-----------'].join('\n')
    const body = [header, renderTreeWithTokens(tree)].join('\n')
    const base = desc || ''
    const needsGap = base.length > 0
    const spacer = needsGap ? (base.endsWith('\n\n\n') ? '' : base.endsWith('\n\n') ? '\n' : base.endsWith('\n') ? '\n\n' : '\n\n\n') : ''
    const next = `${base}${spacer}${body}`
    setDesc(next)
    if (editorRef.current) editorRef.current.innerHTML = descToHtml(next)
    toast(created > 0 ? `Generated ${created} tags from listed items` : 'No eligible items to tag', created > 0 ? 'success' : 'info')
    setShowMisc(false)
  }, [activeId, campaign, desc])

  const handleExportToShare = useCallback(async () => {
    try {
      const res = await window.ipcRenderer.invoke('gamedocs:export-to-share', activeId)
      if (res && res.ok) {
        toast('Export completed successfully', 'success')
      } else {
        toast('Export cancelled', 'info')
      }
    } catch {
      toast('Export failed', 'error')
    }
  }, [activeId])

  const handleExportToHtml = useCallback(async () => {
    if (!campaign) return
    try {
      const zip = await confirmDialog({ title: 'Zip export?', message: 'Create a zipped archive in addition to the folder?', variant: 'yes-no' })
      const reveal = await confirmDialog({ title: 'Reveal after export?', message: 'Open the export folder in Explorer when done?', variant: 'yes-no' })
      const cs = getComputedStyle(document.documentElement)
      const palette = {
        primary: (cs.getPropertyValue('--pd-primary') || '#6495ED').trim(),
        surface: (cs.getPropertyValue('--pd-surface') || '#1e1e1e').trim(),
        text: (cs.getPropertyValue('--pd-text') || '#e5e5e5').trim(),
        tagBg: (cs.getPropertyValue('--pd-tag-bg') || 'rgba(100,149,237,0.2)').trim(),
        tagBorder: (cs.getPropertyValue('--pd-tag-border') || '#6495ED').trim(),
      }
      const res = await window.ipcRenderer.invoke('gamedocs:export-to-html', campaign.id, { palette, zip })
      if (res && res.ok) {
        toast('HTML export completed', 'success')
        if (reveal) await window.ipcRenderer.invoke('gamedocs:reveal-path', res.outDir)
      } else {
        toast('Export cancelled', 'info')
      }
    } catch (e) {
      toast('Export to HTML failed', 'error')
    }
  }, [campaign])

  

  const listOfCommands = [
    { id: 'settings', name: 'Settings', description: 'Open settings modal' },
    { id: 'editObject', name: 'Edit object', description: 'Edit the current object' },
    { id: 'command', name: 'Command palette', description: 'Open command palette' },
    { id: 'newChild', name: 'New child', description: 'Create a new child object' },
    { id: 'addImage', name: 'Add image', description: 'Add a new image to the object' },
    { id: 'miscStuff', name: 'Open Misc stuff', description: 'Open misc stuff modal' },
    { id: 'exportShare', name: 'Export to Share', description: 'Export the current object to Share' },
    { id: 'exportPdf', name: 'Export to PDF', description: 'Export the current object to PDF' },
    { id: 'testImageCleanup', name: 'Test Image Cleanup', description: 'Manually test missing image cleanup' },
    { id: 'exportHtml', name: 'Export to HTML', description: 'Export the current object to HTML' },
    { id: 'generateMap', name: 'Generate map', description: 'Generate a map of all the places' },
    { id: 'chooseFontFile', name: 'Choose font file', description: 'Choose a font file for the custom font', setting: true },
    { id: 'createBackup', name: 'Create backup', description: 'Create a backup of the current object' },
    { id: 'listAllItems', name: 'List all items', description: 'List all the items in the current object' },
    { id: 'lockObject', name: 'Lock object', description: 'Make the current object read-only' },
    { id: 'unlockObject', name: 'Unlock object', description: 'Allow editing the current object' },
    { id: 'selectColorPalette', name: 'Select color palette', parameters: { palette: 'string', setting: true, choices: ['dracula', 'solarized-dark', 'solarized-light', 'github-dark', 'github-light', 'night-owl', 'monokai', 'parchment', 'primary-blue', 'primary-green', 'custom']}, description: 'Select a color palette for the editor' },
    { id: 'setFontFamily', name: 'Set font family', parameters: { family: 'string', setting: true, choices: ['Consolas', 'Times New Roman', 'Arial', 'Verdana', 'Courier New', 'Georgia', 'Garamond', 'Palatino', 'Lucida Console', 'Segoe UI', 'Inter', 'Roboto', 'Source Sans Pro', 'CustomFont']}, description: 'Set the font family for the editor' },
    { id: 'setFontSize', name: 'Set font size', parameters: { size: 'number', setting: true, choices: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]}, description: 'Set the font size for the editor' },
    { id: 'setFontWeight', name: 'Set font weight', parameters: { weight: 'number', setting: true, choices: [100, 200, 300, 400, 500, 600, 700, 800, 900]}, description: 'Set the font weight for the editor' },
    { id: 'setFontColor', name: 'Set font color', parameters: { color: 'string', setting: true}, description: 'Set the font color for the editor' },
    // { id: '', name: '' },
    // { id: '', name: '' },
    // { id: '', name: '' },
    /* Add other commands here*/
  ]

  const [showEditObject, setShowEditObject] = useState(false)
  const [editName, setEditName] = useState('')
  const [ownerTags, setOwnerTags] = useState<Array<{ id: string }>>([])
  const [incomingLinks, setIncomingLinks] = useState<Array<{ tag_id: string; owner_id: string; owner_name: string; owner_path: string }>>([])
  const [showPalette, setShowPalette] = useState(false)
  const [paletteInput, setPaletteInput] = useState('')
  const [paletteResults, setPaletteResults] = useState<{ objects: Array<{ id: string; name: string }>; tags: Array<{ id: string; object_id: string }> }>({ objects: [], tags: [] })
  const [showSettings, setShowSettings] = useState(false)
  const [paletteKey, setPaletteKey] = useState<'dracula' | 'solarized-dark' | 'solarized-light' | 'github-dark' | 'github-light' | 'night-owl' | 'monokai' | 'parchment' | 'primary-blue' | 'primary-green' | 'custom'>('dracula')
  const [customColors, setCustomColors] = useState<{ primary: string; surface: string; text: string; tagBg: string; tagBorder: string }>({ primary: '#6495ED', surface: '#1e1e1e', text: '#e5e5e5', tagBg: 'rgba(100,149,237,0.2)', tagBorder: '#6495ED' })
  const [fonts, setFonts] = useState<{ family: string; size: number; weight: number; color: string }>({ family: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', size: 14, weight: 400, color: '#e5e5e5' })
  const [shortcuts, setShortcuts] = useState<{ settings: string; editObject: string; command: string; newChild: string; addImage: string, miscStuff: string, exportShare: string, toggleLock: string }>({ settings: 'F1', editObject: 'F2', command: 'Ctrl+K', newChild: 'Ctrl+N', addImage: 'Ctrl+I', miscStuff: 'Ctrl+M', exportShare: 'Ctrl+E', toggleLock: 'Ctrl+L' })
  useEffect(() => {
    if (!root || !campaign) return
    selectObject(root.id, root.name)
    ;(async () => {
      try {
        const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign.id).catch(() => false)
        setHasPlaces(!!has)
      } catch { setHasPlaces(false) }
    })()
    // announce editor readiness for this game to main
    window.ipcRenderer.send('gamedocs:editor-ready', campaign.id)
  }, [root?.id, campaign])

  // Load palette from settings on mount
  useEffect(() => {
    (async () => {
      const savedPalette = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.palette').catch(() => null)
      if (savedPalette && savedPalette.key) {
        setPaletteKey(savedPalette.key)
        if (savedPalette.key === 'custom' && savedPalette.colors) setCustomColors(savedPalette.colors)
        applyPalette(savedPalette.key, savedPalette.colors || null)
      } else {
        applyPalette('dracula', null)
      }

      const savedFonts = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.fonts').catch(() => null)
      if (savedFonts) {
        const f = {
          family: savedFonts.family || fonts.family,
          size: typeof savedFonts.size === 'number' ? savedFonts.size : fonts.size,
          weight: typeof savedFonts.weight === 'number' ? savedFonts.weight : fonts.weight,
          color: savedFonts.color || fonts.color,
        }
        setFonts(f)
        applyFonts(f)
      } else {
        applyFonts(fonts)
      }

      const savedShortcuts = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.shortcuts').catch(() => null)
      if (savedShortcuts) setShortcuts({
        settings: savedShortcuts.settings || 'F1',
        editObject: savedShortcuts.editObject || 'F2',
        command: savedShortcuts.command || 'Ctrl+K',
        newChild: savedShortcuts.newChild || 'Ctrl+N',
        addImage: savedShortcuts.addImage || 'Ctrl+I',
        miscStuff: savedShortcuts.miscStuff || 'Ctrl+M',
        exportShare: savedShortcuts.exportShare || 'Ctrl+E',
        toggleLock: savedShortcuts.toggleLock || 'Ctrl+L'
      })
    })()
  }, [])

  // Inject global CSS once to bind typography variables across the app
  useEffect(() => {
    const styleId = 'pd-global-typography'
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style')
      s.id = styleId
      s.innerHTML = `
:root { color-scheme: light dark; }
body, input, button, select, textarea {
  font-family: var(--pd-font-family, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif);
  font-size: var(--pd-font-size, 14px);
  font-weight: var(--pd-font-weight, 400);
  color: var(--pd-text, #e5e5e5);
}
body, .pd-bg-surface {
  background: var(--pd-surface, #1e1e1e);
  color: var(--pd-text, #e5e5e5);
}
button, input, select, textarea {
  background: rgba(0,0,0,0.2);
  border: 1px solid #444;
  color: var(--pd-text, #e5e5e5);
  accent-color: var(--pd-primary, #6495ED);
  outline-color: var(--pd-primary, #6495ED);
}
a { color: var(--pd-primary, #6495ED); }
.editor_container [contenteditable="true"] {
  color: var(--pd-text, #e5e5e5);
}
span[data-tag] {
  background: var(--pd-tag-bg, rgba(100,149,237,0.2));
  border-bottom: 1px dotted var(--pd-tag-border, #6495ED);
}
      `
      document.head.appendChild(s)
    }
  }, [])

  function applyPalette(key: 'dracula' | 'solarized-dark' | 'solarized-light' | 'github-dark' | 'github-light' | 'night-owl' | 'monokai' | 'parchment' | 'primary-blue' | 'primary-green' | 'custom', colors: any) {
    const rootEl = document.documentElement
    const themes: Record<string, any> = {
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
      'custom': customColors,
    }
    const c = key === 'custom' ? (colors || customColors) : themes[key]
    rootEl.style.setProperty('--pd-primary', c.primary)
    rootEl.style.setProperty('--pd-surface', c.surface)
    rootEl.style.setProperty('--pd-text', c.text)
    rootEl.style.setProperty('--pd-tag-bg', c.tagBg)
    rootEl.style.setProperty('--pd-tag-border', c.tagBorder)
    // Basic font vars defaults; will be overridden by settings section below
    if (getComputedStyle(rootEl).getPropertyValue('--pd-font-family') === '') {
      rootEl.style.setProperty('--pd-font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif')
    }
    if (getComputedStyle(rootEl).getPropertyValue('--pd-font-size') === '') {
      rootEl.style.setProperty('--pd-font-size', '14px')
    }
    if (getComputedStyle(rootEl).getPropertyValue('--pd-font-weight') === '') {
      rootEl.style.setProperty('--pd-font-weight', '400')
    }
  }

  function applyFonts(f: { family: string; size: number; weight: number; color: string }) {
    const rootEl = document.documentElement
    rootEl.style.setProperty('--pd-font-family', f.family)
    rootEl.style.setProperty('--pd-font-size', `${f.size}px`)
    rootEl.style.setProperty('--pd-font-weight', `${f.weight}`)
    rootEl.style.setProperty('--pd-text', f.color)
  }

  function safeThumbSrc(img: { thumb_data_url?: string | null; thumb_url?: string | null; thumb_path: string }) {
    const data = (img.thumb_data_url || '').trim()
    if (data.startsWith('data:') && data.length > 30) return data
    const url = (img.thumb_url || '').trim()
    if (url) return url
    return `file:///${img.thumb_path.replace(/\\/g, '/')}`
  }

  function matchShortcut(e: KeyboardEvent, combo: string): boolean {
    const parts = combo.split('+').map(s => s.trim().toLowerCase())
    const key = parts[parts.length - 1]
    const wantCtrl = parts.includes('ctrl') || parts.includes('control')
    const wantShift = parts.includes('shift')
    const wantAlt = parts.includes('alt')
    if (wantCtrl !== (!!e.ctrlKey || !!e.metaKey)) return false
    if (wantShift !== !!e.shiftKey) return false
    if (wantAlt !== !!e.altKey) return false
    return e.key.toLowerCase() === key
  }

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcuts.command)) {
        e.preventDefault()
        setShowPalette(true)
        setPaletteInput('')
        setPaletteResults({ objects: [], tags: [] })
      } else if (e.key === 'Escape') {
        setShowPalette(false)
        setShowSettings(false)
        setShowEditObject(false)
      } else if (matchShortcut(e, shortcuts.settings)) {
        e.preventDefault(); setShowSettings(true)
      } else if (matchShortcut(e, shortcuts.editObject)) {
        e.preventDefault(); setTagMenu(m => ({ ...m, visible: false })); setEditName(activeName); setShowEditObject(true)
      } else if (matchShortcut(e, shortcuts.newChild)) {
        e.preventDefault(); setCatErr(null); setCatName(''); setShowCat(true)
      } else if (matchShortcut(e, shortcuts.addImage)) {
        e.preventDefault(); setAddPictureModal(true)
      } else if (matchShortcut(e, shortcuts.toggleLock)) {
        e.preventDefault();
        if(!activeLocked){
          window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, true);
          setActiveLocked(true); 
          toast('Object locked', 'success');
          window.location.reload();
        } else {
          window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, false);
          setActiveLocked(false); 
          toast('Object unlocked', 'success');
          window.location.reload();
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, activeName])

  useEffect(() => {
    const run = setTimeout(async () => {
      if (!showPalette || !campaign) return
      const q = paletteInput.trim()
      // If we are in parameter mode, keep command mode active and (optionally) filter choices by text
      if (cmdParamMode && selectedCommand) {
        setIsCommandMode(true)
        return
      }
      // Command mode: when input starts with '>'
      if (q.startsWith('>')) {
        const term = q.slice(1).trim().toLowerCase()
        setIsCommandMode(true)
        // do not reset cmdParamMode/selectedCommand here; handled explicitly on Enter/click
        if (!term) { setFilteredCommands(listOfCommands); return }
        const lc = listOfCommands.filter(c => c.name.toLowerCase().includes(term) || c.description.toLowerCase().includes(term) || c.id.toLowerCase().includes(term))
        setFilteredCommands(lc)
        return
      }
      setIsCommandMode(false)
      if (!q) { setPaletteResults({ objects: [], tags: [] }); return }
      const res = await window.ipcRenderer.invoke('gamedocs:quick-search', campaign.id, q).catch(() => ({ objects: [], tags: [] }))
      setPaletteResults(res || { objects: [], tags: [] })
    }, 150)
    return () => clearTimeout(run)
  }, [showPalette, paletteInput, campaign?.id])

  // External request: select a specific object (from map window)
  useEffect(() => {
    const handler = (_e: any, objectId: string) => {
      if (!objectId) return
      ;(async () => {
        try {
          const obj = await window.ipcRenderer.invoke('gamedocs:get-object', objectId)
          if (obj?.id) selectObject(obj.id, obj.name)
        } catch {}
      })()
    }
    window.ipcRenderer.on('gamedocs:select-object', handler)
    return () => {
      // Use .off exposed by preload
      try { window.ipcRenderer.off('gamedocs:select-object', handler) } catch {}
    }
  }, [])

  useEffect(() => { setPaletteSelIndex(0) }, [isCommandMode, cmdParamMode, filteredCommands.length, paletteResults.objects.length, paletteResults.tags.length])
  useEffect(() => {
    if (cmdParamMode && selectedCommand) setPaletteSelIndex(0)
  }, [paletteInput, cmdParamMode, selectedCommand])

  // Keep the highlighted item in view
  useEffect(() => {
    if (!showPalette) return
    const container = paletteResultsRef.current
    if (!container) return
    const items = Array.from(container.querySelectorAll<HTMLDivElement>('.palette-item'))
    if (items.length === 0) return
    const idx = Math.min(Math.max(0, paletteSelIndex), items.length - 1)
    const el = items[idx]
    if (el && typeof (el as any).scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [showPalette, paletteSelIndex, isCommandMode, cmdParamMode, filteredCommands.length, paletteResults.objects.length, paletteResults.tags.length])

  function runCommand(cmdId: string) {
    switch (cmdId) {
      case 'settings': setShowSettings(true); setShowPalette(false); return
      case 'editObject': if (activeLocked) { toast('Object is locked', 'error'); return } setEditName(activeName); setShowEditObject(true); setShowPalette(false); return
      case 'newChild': setCatErr(null); setCatName(''); setShowCat(true); setShowPalette(false); return
      case 'addImage': setAddPictureModal(true); setShowPalette(false); return
      case 'miscStuff': setShowMisc(true); setShowPalette(false); return
      case 'exportShare': handleExportToShare(); setShowPalette(false); return
      case 'testImageCleanup': handleTestImageCleanup(); setShowPalette(false); return
      case 'listAllItems': if (activeLocked) { toast('Object is locked', 'error'); return } handleListAllItems(); setShowPalette(false); return
      case 'command': setShowPalette(true); return
      case 'lockObject': (async () => { if (!activeId) return; await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, true); setActiveLocked(true); toast('Object locked', 'success'); setShowPalette(false) })(); return
      case 'unlockObject': (async () => { if (!activeId) return; await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, false); setActiveLocked(false); toast('Object unlocked', 'success'); setShowPalette(false) })(); return
      case 'chooseFontFile': (async () => {
        const pick = await window.ipcRenderer.invoke('gamedocs:choose-font-file').catch(() => null)
        if (pick?.path) {
          const loaded = await window.ipcRenderer.invoke('gamedocs:read-font-as-dataurl', pick.path).catch(() => null)
          if (loaded?.dataUrl) {
            const fontName = loaded.suggestedFamily || 'CustomFont'
            const styleTagId = `pd-font-${fontName}`
            if (!document.getElementById(styleTagId)) {
              const st = document.createElement('style')
              st.id = styleTagId
              st.innerHTML = `@font-face{ font-family: "${fontName}"; src: url(${loaded.dataUrl}) format("${(loaded.mime||'').includes('woff')?'woff2':'truetype'}"); font-weight: 100 900; font-style: normal; font-display: swap; }`
              document.head.appendChild(st)
            }
            const f = { ...fonts, family: `${fontName}, ${fonts.family}` }
            setFonts(f); applyFonts(f)
            toast('Custom font loaded', 'success')
          }
        }
        setShowPalette(false)
      })(); return
      default:
        toast('Command not implemented', 'info')
        return
    }
  }

  function beginParamMode(cmd: any) {
    setSelectedCommand(cmd)
    setCmdParamMode(true)
    // Keep command mode active and clear only the visible input text, preserving '>' handling in our update effect
    setPaletteInput('')
    setIsCommandMode(true)
  }

  function getParamMeta(cmd: any): { key: string; choices: any[] } {
    const params: any = cmd?.parameters || {}
    const keys = Object.keys(params).filter(k => k !== 'choices')
    const key = keys[0] || ''
    let choices: any[] = []
    if (Array.isArray(params?.choices)) choices = params.choices
    else if (key && params[key] && Array.isArray(params[key].choices)) choices = params[key].choices
    return { key, choices }
  }

  async function commitParam(value: string) {
    if (!selectedCommand) return
    if (selectedCommand.id === 'selectColorPalette') {
      // normalize to a valid palette key using available choices
      const { choices } = getParamMeta(selectedCommand)
      const lower = String(value).trim().toLowerCase()
      const picked = choices.find(c => String(c).toLowerCase() === lower)
      if (!picked) { toast('Unknown palette', 'error'); return }
      const key = picked as any
      setPaletteKey(key)
      applyPalette(key, key === 'custom' ? customColors : null)
      try {
        const payload = { key, colors: key === 'custom' ? customColors : null }
        await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.palette', payload)
      } catch {}
      setShowPalette(false)
      toast('Palette updated', 'success')
      setCmdParamMode(false); setSelectedCommand(null)
      return
    }
    if (selectedCommand.id === 'setFontColor') {
      const f = { ...fonts, color: value }
      setFonts(f); applyFonts(f)
      try { await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.fonts', f) } catch {}
      setShowPalette(false)
      toast('Font color updated', 'success')
      setCmdParamMode(false); setSelectedCommand(null)
      return
    }
    if (selectedCommand.id === 'setFontFamily') {
      const f = { ...fonts, family: value }
      setFonts(f); applyFonts(f)
      try { await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.fonts', f) } catch {}
      setShowPalette(false)
      toast('Font family updated', 'success')
      setCmdParamMode(false); setSelectedCommand(null)
      return
    }
    if (selectedCommand.id === 'setFontSize') {
      const size = parseInt(String(value), 10)
      if (!isNaN(size)) {
        const f = { ...fonts, size }
        setFonts(f); applyFonts(f)
        try { await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.fonts', f) } catch {}
        toast('Font size updated', 'success')
      }
      setShowPalette(false)
      setCmdParamMode(false); setSelectedCommand(null)
      return
    }
    if (selectedCommand.id === 'setFontWeight') {
      const weight = parseInt(String(value), 10)
      if (!isNaN(weight)) {
        const f = { ...fonts, weight }
        setFonts(f); applyFonts(f)
        try { await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.fonts', f) } catch {}
        toast('Font weight updated', 'success')
      }
      setShowPalette(false)
      setCmdParamMode(false); setSelectedCommand(null)
      return
    }
  }

  useEffect(() => {
    if (!activeId) return
    const handler = setTimeout(async () => {
      await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, desc)
    }, 500)
    return () => clearTimeout(handler)
  }, [desc, activeId])

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current
    if (el) setDesc(htmlToDesc(el))
  }, [])

  const expandSelectionToWord = useCallback((sel: Selection, e: React.MouseEvent) => {
    const caretRange = (document as any).caretRangeFromPoint ? (document as any).caretRangeFromPoint(e.clientX, e.clientY) : null
    const range = caretRange || (sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null)
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      const node = range.startContainer as Text
      const textContent = node.textContent || ''
      let start = range.startOffset
      let end = range.startOffset
      while (start > 0 && /[\w\p{L}\p{N}_]/u.test(textContent[start - 1])) start--
      while (end < textContent.length && /[\w\p{L}\p{N}_]/u.test(textContent[end])) end++
      const newRange = document.createRange()
      newRange.setStart(node, start)
      newRange.setEnd(node, end)
      sel.removeAllRanges()
      sel.addRange(newRange)
      return true
    }
    return false
  }, [])

  const handleEditorContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    console.log('activeLocked', activeLocked)
    if (activeLocked) { setCtxMenu(m => ({ ...m, visible: false })); return }
    const sel = window.getSelection()
    if (!sel) return
    if (sel.rangeCount === 0 || sel.isCollapsed) {
      const ok = expandSelectionToWord(sel, e)
      if (!ok) { setCtxMenu(m => ({ ...m, visible: false })); return }
    }
    selectionRangeRef.current = sel.getRangeAt(0).cloneRange()
    const selText = sel.toString()
    // If inside a tag span, fetch linked targets
    let tagId: string | null = null
    const node = selectionRangeRef.current.startContainer as Node
    let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement))
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { tagId = el.getAttribute('data-tag'); break }
      el = el.parentElement
    }
    if (tagId) {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => [])
      setCtxLinkedTargets(rows || [])
    } else {
      setCtxLinkedTargets([])
    }
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, selText })
  }, [expandSelectionToWord, activeLocked])

  const handleAddLinkOpen = useCallback(async () => {
    setCtxMenu(m => ({ ...m, visible: false }))
    setPathChoices([])
    // If selection is inside an existing tag span, reuse that tag id
    let existingTag: string | null = null
    if (selectionRangeRef.current) {
      const node = selectionRangeRef.current.startContainer as Node
      let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement))
      while (el) {
        if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { existingTag = el.getAttribute('data-tag'); break }
        el = el.parentElement
      }
    }
    setLinkerTagId(existingTag)
    setLinkerInput(ctxMenu.selText.trim())
    setShowLinker(true)
    // preload objects for fuzzy
    const rows = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaign!.id)
    setAllObjects(rows || [])
    fuseRef.current = new Fuse(rows || [], { keys: ['name'], threshold: 0.4 })
    setLinkerMatches((rows || []).slice(0, 10))
  }, [campaign, ctxMenu.selText])

  const openEditForObject = useCallback(async (targetId: string, targetName: string) => {
    // Do not change the currently visible object; populate edit modal directly
    setEditTargetId(targetId)
    setEditName(targetName)
    const obj = await window.ipcRenderer.invoke('gamedocs:get-object', targetId)
    setWizardType((obj?.type as any) || 'Other')
    const [ot, inc] = await Promise.all([
      window.ipcRenderer.invoke('gamedocs:list-owner-tags', targetId).catch(() => []),
      window.ipcRenderer.invoke('gamedocs:list-incoming-links', targetId).catch(() => []),
    ])
    setOwnerTags(ot || [])
    setIncomingLinks(inc || [])
    setShowEditObject(true)
  }, [])

  const handleEditOpen = useCallback(async () => {
    setCtxMenu(m => ({ ...m, visible: false }))
    if (!ctxLinkedTargets || ctxLinkedTargets.length === 0) return
    if (ctxLinkedTargets.length === 1) {
      const only = ctxLinkedTargets[0]
      await openEditForObject(only.id, only.name)
      return
    }
    setEditPickerItems(ctxLinkedTargets)
    setShowEditPicker(true)
  }, [ctxLinkedTargets, openEditForObject])

  const handleClearLink = useCallback(() => {
    const range = selectionRangeRef.current
    if (!range) { setCtxMenu(m => ({ ...m, visible: false })); return }
    let el: HTMLElement | null = (range.startContainer as any).parentElement
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { break }
      el = el.parentElement
    }
    if (el && editorRef.current) {
      const text = document.createTextNode(el.textContent || '')
      el.replaceWith(text)
      setDesc(htmlToDesc(editorRef.current))
    }
    setCtxMenu(m => ({ ...m, visible: false }))
  }, [])

  const handleLinkerInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setLinkerInput(v)
    setPathChoices([])
    if (!v.trim()) { setLinkerMatches(allObjects.slice(0, 10)); return }
    const fuse = fuseRef.current
    if (fuse) {
      const res = fuse.search(v).map(r => r.item).slice(0, 10)
      setLinkerMatches(res)
    }
  }, [allObjects])

  const handleSelectPathChoice = useCallback(async (pc: { id: string; name: string; path: string }) => {
    const createdNew = !linkerTagId
    let tid = linkerTagId
    if (!tid) {
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id)
      tid = res.tagId
      setLinkerTagId(tid)
    }
    if (!tid) return
    await window.ipcRenderer.invoke('gamedocs:add-link-target', tid, pc.id)
    if (createdNew) {
    replaceSelectionWithSpan(linkerInput || pc.name, tid)
    }
    setShowLinker(false)
  }, [campaign, linkerInput, linkerTagId])

  const handleSelectMatch = useCallback(async (m: { id: string; name: string }) => {
    const same = await window.ipcRenderer.invoke('gamedocs:get-objects-by-name-with-paths', campaign!.id, m.name)
    if ((same || []).length > 1) {
      setPathChoices(same || [])
      return
    }
    const createdNew = !linkerTagId
    let tid = linkerTagId
    if (!tid) {
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id)
      tid = res.tagId
      setLinkerTagId(tid)
    }
    if (!tid) return
    await window.ipcRenderer.invoke('gamedocs:add-link-target', tid, m.id)
    if (createdNew) {
    replaceSelectionWithSpan(linkerInput || m.name, tid)
    }
    setShowLinker(false)
  }, [campaign, linkerInput, linkerTagId])

  const handleWizardCreate = useCallback(async () => {
    const label = (wizardName || '').trim()
    if (!label) return
    const rootObj = await window.ipcRenderer.invoke('gamedocs:get-root', campaign!.id)
    const ownerId = activeId || rootObj.id
    const res = await window.ipcRenderer.invoke('gamedocs:create-object-and-link-tag', campaign!.id, activeId || rootObj.id, ownerId, label, (wizardType || null))
    setShowWizard(false)
    try {
      const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign!.id).catch(() => false)
      setHasPlaces(!!has)
    } catch {}
    replaceSelectionWithSpan(label, res.tagId)
  }, [wizardName, wizardType, campaign, activeId])

  const handleCreateCategory = useCallback(async () => {
    const name = (catName || '').trim()
    if (!name) { setCatErr('Name is required'); return }
    try {
      await window.ipcRenderer.invoke('gamedocs:create-category', campaign!.id, activeId || root!.id, name)
      // Reload children
      const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, activeId || root!.id)
      setChildren(kids)
      try {
        const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign!.id).catch(() => false)
        setHasPlaces(!!has)
      } catch {}
      setShowCat(false)
    } catch (e: any) {
      setCatErr(e?.message || 'Failed to create category')
    }
  }, [catName, campaign, activeId, root])

  const openAddChildModal = useCallback(() => {
    setCatErr(null)
    setCatName('')
    setShowCat(true)
  }, [])

  const handleParentClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (parent) selectObject(parent.id, parent.name)
  }, [parent])

  const handleMenuItemsClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const item = target.closest('[data-oid]') as HTMLElement | null
    if (!item) return
    const id = item.getAttribute('data-oid') || ''
    const name = item.getAttribute('data-oname') || ''
    if (id) selectObject(id, name)
  }, [])

  const handleCtxMenuLeave = useCallback(() => setCtxMenu(m => ({ ...m, visible: false })), [])

  const handleCloseLinker = useCallback(() => setShowLinker(false), [])

  const handlePathChoicesClick = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const el = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null
    if (!el) return
    const pc = { id: el.dataset.id!, name: el.dataset.name!, path: el.dataset.path! }
    handleSelectPathChoice(pc)
  }, [handleSelectPathChoice])

  const handleMatchesClick = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const el = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null
    if (!el) return
    const m = { id: el.dataset.id!, name: el.dataset.name! }
    handleSelectMatch(m)
  }, [handleSelectMatch])

  async function selectObject(id: string, name: string) {
    if (!id) return
    const obj = await window.ipcRenderer.invoke('gamedocs:get-object', id).catch(() => null)
    if (!obj) return
    setActiveId(obj.id)
    setActiveName(obj.name || name)
    const text = obj?.description || ''
    setDesc(text)
    setActiveLocked(!!obj?.locked)
    // Render tokens as span tags with data-tag
    requestAnimationFrame(async () => {
      if (editorRef.current) {
        // Strip broken/empty references: remove tokens whose tag id no longer exists
        const cleaned = await removeMissingTags(text)
        editorRef.current.innerHTML = descToHtml(cleaned)
        setDesc(cleaned)
      }
    })
    // Load children and parent
    const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, obj.id).catch(() => [])
    setChildren(kids)
    try {
      const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', obj.id)
      setImages(imgs || [])
    } catch { setImages([]) }
    const pId = obj?.parent_id as string | null
    if (pId) {
      const pobj = await window.ipcRenderer.invoke('gamedocs:get-object', pId)
      setParent({ id: pobj.id, name: pobj.name })
    } else {
      setParent(null)
    }
  }

  const handleCreateChild = useCallback(async () => {

    const name = (catName || '').trim()
    if (!name) { setCatErr('Name is required'); return }
    try {
      await window.ipcRenderer.invoke('gamedocs:create-category', campaign!.id, activeId || root!.id, name, catType)
      // Reload children
      const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, activeId || root!.id)
      setChildren(kids)
      try {
        const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign!.id).catch(() => false)
        setHasPlaces(!!has)
      } catch {}
      setShowCat(false)
    } catch (e: any) {
      setCatErr(e?.message || 'Failed to create category')
    }

  }, [catName, catType, campaign, activeId, root])

  function insertAtSelection(text: string) {
    // For contentEditable, prefer replacing current Range; fallback to append
    const selRange = selectionRangeRef.current
    const el = editorRef.current
    if (el && selRange) {
      selRange.deleteContents()
      selRange.insertNode(document.createTextNode(text))
      const txt = el.innerText
      setDesc(txt)
      return
    }
    setDesc(prev => (prev ? prev + text : text))
  }

  function replaceSelectionWith(text: string) {
    const selRange = selectionRangeRef.current
    const el = editorRef.current
    if (el && selRange) {
      selRange.deleteContents()
      selRange.insertNode(document.createTextNode(text))
      const txt = el.innerText
      setDesc(txt)
      return
    }
    insertAtSelection(text)
  }

  // removed erroneous function shadowing setAddPictureModal

  function replaceSelectionWithSpan(label: string, tagId: string) {
    const selRange = selectionRangeRef.current
    const el = editorRef.current
    const span = document.createElement('span')
    // Preserve the user's selected text if available; otherwise use the provided label
    const selectedText = selRange && !selRange.collapsed ? selRange.toString() : ''
    const displayLabel = selectedText && selectedText.length > 0 ? selectedText : label
    span.textContent = displayLabel
    span.setAttribute('data-tag', tagId)
    span.style.background = 'var(--pd-tag-bg, rgba(100, 149, 237, 0.2))'
    span.style.borderBottom = '1px dotted var(--pd-tag-border, #6495ED)'
    span.style.cursor = 'pointer'
    if (el && selRange) {
      selRange.deleteContents()
      selRange.insertNode(span)
      setDesc(htmlToDesc(el))
      return
    }
    if (el) {
      el.appendChild(span)
      setDesc(htmlToDesc(el))
    }
  }

  function descToHtml(text: string): string {
    // Convert [[label|tag_xxx]] tokens to span elements
    const withSpans = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, label, tag) => {
      const safeLabel = String(label)
      const safeTag = String(tag)
      return `<span data-tag="${safeTag}" style="background: var(--pd-tag-bg, rgba(100,149,237,0.2)); border-bottom: 1px dotted var(--pd-tag-border, #6495ED); cursor: pointer;">${safeLabel}</span>`
    })
    // Preserve explicit newlines using <br>
    return withSpans.replace(/\n/g, '<br>')
  }

  function htmlToDesc(container: HTMLElement): string {
    // Convert spans back to token syntax and preserve line breaks
    const clone = container.cloneNode(true) as HTMLElement
    clone.querySelectorAll('span[data-tag]').forEach((el) => {
      const label = el.textContent || ''
      const tag = el.getAttribute('data-tag') || ''
      const token = document.createTextNode(`[[${label}|${tag}]]`)
      el.replaceWith(token)
    })
    // Convert <br> to \n and treat block boundaries as newlines
    // First, BRs become newlines
    clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')))
    // Then add newline separators for block boundaries
    const blocks = new Set(['DIV', 'P'])
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, null)
    const toAppendNewline: HTMLElement[] = []
    const toInsertBefore: HTMLElement[] = []
    let node: Element | null = walker.nextNode() as Element | null
    while (node) {
      if (blocks.has(node.nodeName)) {
        toAppendNewline.push(node as HTMLElement)
        if ((node as HTMLElement).previousSibling) toInsertBefore.push(node as HTMLElement)
      }
      node = walker.nextNode() as Element | null
    }
    for (const el of toInsertBefore) {
      el.parentNode?.insertBefore(document.createTextNode('\n'), el)
    }
    for (const el of toAppendNewline) el.appendChild(document.createTextNode('\n'))
    // Extract text; collapse triple+ newlines to double to avoid runaway breaks
    const text = clone.textContent || ''
    return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n')
  }

  async function removeMissingTags(text: string): Promise<string> {
    const tokenRe = /\[\[([^\]|]+)\|([^\]]+)\]\]/g
    let m: RegExpExecArray | null
    let result = text
    const seen = new Set<string>()
    const missing = new Set<string>()
    while ((m = tokenRe.exec(text))) {
      const tagId = m[2]
      if (seen.has(tagId) || missing.has(tagId)) continue
      try {
        const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId)
        if (!Array.isArray(targets) || targets.length === 0) {
          missing.add(tagId)
        } else {
          seen.add(tagId)
        }
      } catch {
        missing.add(tagId)
      }
    }
    if (missing.size === 0) return text
    // Remove tokens with missing tag ids
    result = result.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, label, tid) => missing.has(String(tid)) ? String(label) : _m)
    return result
  }

  if (error) return <div className="pad-16 text-red">{error}</div>
  if (!campaign) return <div className="pad-16">Loading…</div>

  return (
    <div className="editor-grid">
      <div className="main_header">
        <h2 className="header-title">
          {root ? (
            <a className="home-link" onClick={(e) => { e.preventDefault(); selectObject(root.id, root.name) }}>
              <i className={root.id === activeId ? 'ri-home-2-line' : 'ri-home-2-fill'}></i>
            </a>
          ) : (
            <i className={'ri-home-2-line'}></i>
          )}
          {' '} {campaign.name}
        </h2>
        <button ref={menuButtonRef} className="menu_button"
          onClick={(e) => {
            e.preventDefault()
            setCtxMenu(m => ({ ...m, visible: false }))
            const btn = (e.target as HTMLElement)
            const rect = btn.getBoundingClientRect()
            const padding = 4
            const menuWidth = 260
            const x = Math.max(padding, rect.right - menuWidth)
            const y = rect.bottom + 6
            // toggle behavior: if already open via dropdown, close
            setTagMenu(prev => {
              if (prev.visible && prev.source === 'dropdown') {
                return { ...prev, visible: false, hoverPreview: null }
              }
              const items: Array<{ id: string; name: string; path: string }> = [
                { id: '__SETTINGS__', name: 'Settings', path: '' },
                { id: '__SEPARATOR_TOP__', name: '', path: '' },
                { id: '__ADDPICTURE__', name: 'Add picture', path: '' },
              ]
              if (!activeLocked) items.push({ id: '__EDITOBJECT__', name: 'Edit object', path: '' })
              items.push({ id: activeLocked ? '__UNLOCK__' : '__LOCK__', name: activeLocked ? 'Unlock object' : 'Lock object', path: '' })
              items.push({ id: '__SEPARATOR_MIDDLE__', name: '', path: '' })
              items.push({ id: '__MISC_STUFF__', name: 'Misc stuff', path: '' })
              items.push({ id: '__SEPARATOR_BOTTOM__', name: '', path: '' })
              if (!activeLocked) items.push({ id: '__DELETE__', name: 'Delete', path: '' })
              return { visible: true, x, y, items, hoverPreview: null, source: 'dropdown' }
            })
          }}
        >...</button>
      </div>
      <div className="content-grid" onClick={(e) => {
        // Close menus when clicking outside
        const target = e.target as Node
        if (ctxMenu.visible && ctxMenuRef.current && !ctxMenuRef.current.contains(target)) {
          setCtxMenu(m => ({ ...m, visible: false }))
        }
        if (tagMenu.visible && tagMenuRef.current && !tagMenuRef.current.contains(target)) {
          setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
        }
      }}>
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-title"></div>
          {root && (
            <div>
              {parent && parent.id && parent.id !== activeId && (
                <a className="jump-to-parent" onClick={(e) => { e.preventDefault(); selectObject(parent.id, parent.name) }}><span className="nowrap">parent <i className="ri-arrow-up-circle-line"></i></span></a>
              )}
              <div className="header_line">{activeName || root.name}</div>
              <a className="add-child" onClick={() => { setCatErr(null); setCatName(''); setShowCat(true) }}>Add Child <i className="ri-add-circle-line"></i></a>
              <div className="divider-line"></div>
              <div className="menu_items_container" style={{ height: getHeight() }}>
                {children.map(c => (
                  <div key={c.id} onClick={() => selectObject(c.id, c.name)} className="child-item">{c.name}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main panel: interactive editor (root description for now) */}
        <div className="editor_container" style={{ position: 'relative' }}>
          {activeLocked && (<div className="lock-badge" title="Locked"><i className="ri-lock-2-fill"></i></div>)}
          <div
            ref={editorRef}
            contentEditable={!activeLocked}
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onContextMenu={handleEditorContextMenu}
            onMouseMove={async (e) => {
              const target = e.target as HTMLElement
              const span = target && (target.closest && target.closest('span[data-tag]')) as HTMLElement | null
              if (!span) {
                lastHoverTagRef.current = null
                if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                return
              }
              // Capture pointer and anchor positions up-front (avoid stale React event after awaits)
              const clientX = (e as any).clientX as number
              const clientY = (e as any).clientY as number
              const rect = span.getBoundingClientRect()
              const anchorX = Math.max(0, Math.min(window.innerWidth, rect.left + Math.min(16, Math.max(0, rect.width / 2))))
              const anchorY = Math.max(0, Math.min(window.innerHeight, rect.bottom))
              const tagId = span.getAttribute('data-tag') || ''
              if (!tagId) return
              // Only show hover card for single-target tags
              if (lastHoverTagRef.current === tagId && hoverCard.visible) {
                // Reposition: center horizontally on pointer X; clamp to viewport
                const pad = 10
                const CARD_W = 300
                const baseX = anchorX // Number.isFinite(clientX) ? clientX : anchorX
                const baseY = anchorY + 10 + 30 // Number.isFinite(clientY) ? clientY : anchorY
                const targetX = baseX - (CARD_W / 2)
                const nx = Math.max(pad, Math.min(targetX, window.innerWidth - pad - CARD_W))
                const ny = baseY
                setHoverCard(h => ({ ...h, x: nx, y: ny }))
                return
              }
              lastHoverTagRef.current = tagId
              const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string; path: string }>
              if (!Array.isArray(targets) || targets.length !== 1) {
                if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                return
              }
              const only = targets[0]
              const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', only.id).catch(() => null) as { id: string; name: string; snippet: string; fileUrl?: string | null; thumbDataUrl?: string | null; thumbPath?: string | null; imagePath?: string | null } | null
              if (!preview) return
              let imgUrl = (preview as any).thumbDataUrl || null
              if (!imgUrl || imgUrl == 'data:image/png;base64,' || /^data:[^;]+;base64,?$/i.test(imgUrl as any) || (typeof imgUrl === 'string' && (imgUrl as string).length < 32)) {
                const primary = (preview as any).thumbPath as (string | undefined)
                const secondary = (preview as any).imagePath as (string | undefined)
                if (primary) {
                  const resA = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', primary).catch(() => null)
                  if (resA?.ok) imgUrl = resA.dataUrl
                }
                if (!imgUrl && secondary) {
                  const resB = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', secondary).catch(() => null)
                  if (resB?.ok) imgUrl = resB.dataUrl
                }
                if (!imgUrl && (preview as any).fileUrl) {
                  try {
                    const u = new URL((preview as any).fileUrl)
                    let p = decodeURIComponent(u.pathname)
                    if (p.startsWith('/') && p[2] === ':') p = p.slice(1)
                    const res2 = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', p).catch(() => null)
                    if (res2?.ok) imgUrl = res2.dataUrl
                  } catch {}
                }
              }
              // Debug dump for hover preview resolution
              {
                const pad = 10
                const CARD_W = 300
                const baseX = anchorX // Number.isFinite(clientX) ? clientX : anchorX
                const baseY = anchorY + 10 + 30 // Number.isFinite(clientY) ? clientY : anchorY
                const targetX = baseX - (CARD_W / 2)
                const nx = Math.max(pad, Math.min(targetX, window.innerWidth - pad - CARD_W))
                const ny = baseY
                setHoverCard({ visible: true, x: nx, y: ny, name: preview.name || only.name, snippet: preview.snippet || '', imageUrl: imgUrl })
              }
            }}
            onMouseLeave={() => { if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false })) }}
            onClick={async (e) => {
              const target = e.target as HTMLElement
              const span = target && (target.closest && target.closest('span[data-tag]')) as HTMLElement | null
              if (!span) return
              const tagId = span.getAttribute('data-tag') || ''
              if (!tagId) return
              const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string; path: string }>
              if (!Array.isArray(targets) || targets.length === 0) return
              // Shift+click jumps to first
              if ((e as React.MouseEvent).shiftKey) {
                const t0 = targets[0]
                selectObject(t0.id, t0.name)
                setHoverCard(h => ({ ...h, visible: false }))
                return
              }
              if (targets.length === 1) {
                const t0 = targets[0]
                selectObject(t0.id, t0.name)
                setHoverCard(h => ({ ...h, visible: false }))
              } else {
                setTagMenu({ visible: true, x: (e as any).clientX, y: (e as any).clientY, items: targets, hoverPreview: null, source: 'tag' })
                setHoverCard(h => ({ ...h, visible: false }))
              }
            }}
            onKeyDown={(e) => {
              // Insert literal tab characters in the content
              if (e.key === 'Tab') {
                e.preventDefault()
                const sel = window.getSelection()
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0)
                  const tabNode = document.createTextNode('\t')
                  range.deleteContents()
                  range.insertNode(tabNode)
                  // Move caret after the inserted tab
                  const newRange = document.createRange()
                  newRange.setStartAfter(tabNode)
                  newRange.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(newRange)
                  setDesc(htmlToDesc(editorRef.current!))
                }
                return
              }
              if (e.key !== ' ') return
              const sel = window.getSelection()
              if (!sel || sel.rangeCount === 0) return
              const range = sel.getRangeAt(0)
              const node = range.startContainer
              let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node.parentElement))
              while (el) {
                if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { break }
                el = el.parentElement
              }
              if (!el || !editorRef.current) return
              // Only special-handle when caret is at very start (<=1) or end (>=len)
              const textNode = (function findText(n: Node): Text | null {
                if (n.nodeType === Node.TEXT_NODE) return n as Text
                for (let i = 0; i < n.childNodes.length; i++) {
                  const r = findText(n.childNodes[i])
                  if (r) return r
                }
                return null
              })(el)
              if (!textNode) return
              const caretOffset = range.startContainer === textNode ? range.startOffset : (range.startContainer.nodeType === Node.ELEMENT_NODE ? 0 : 0)
              const len = textNode.textContent ? textNode.textContent.length : 0
              if (caretOffset <= 1 || caretOffset >= len) {
                e.preventDefault()
                const space = document.createTextNode(' ')
                if (caretOffset <= 1) {
                  el.parentElement?.insertBefore(space, el)
                } else {
                  if (el.nextSibling) el.parentElement?.insertBefore(space, el.nextSibling)
                  else el.parentElement?.appendChild(space)
                }
                // Move caret after inserted space
                const newRange = document.createRange()
                newRange.setStartAfter(space)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                setDesc(htmlToDesc(editorRef.current))
              }
            }}
            className="editor_content"
            style={activeLocked ? { opacity: 0.85 } : undefined}
          />
          {images.length > 0 ? (
            <></>
          ) : (
            <div className="editor_content_footer"></div>
          )}
          {/* Hover preview card for single-target tags */}
          {hoverCard.visible && (
            <div className="hover-card" style={{ left: hoverCard.x, top: hoverCard.y }}>
              <div className="hover-card-title">{hoverCard.name}</div>
              {hoverCard.imageUrl && (
                <img src={hoverCard.imageUrl} className="hover-card-image" />
              )}
              {hoverCard.snippet && (
                <div className="hover-card-snippet">{hoverCard.snippet}</div>
              )}
            </div>
          )}
          {ctxMenu.visible && (
            <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} ref={ctxMenuRef}>
              <div className="ctx-menu-section-title">Links</div>
              <div className="separator" />
              <div className="ctx-menu-item"  onClick={handleAddLinkOpen}>Link Object</div>

              {/* Only show edit and clear if there are linked targets */}
              {ctxLinkedTargets.length > 0 ? (
              <>
              <div className="ctx-menu-item"
                onClick={handleEditOpen}
              >Edit</div>
              <div className="ctx-menu-item" onClick={handleClearLink}
              >Clear</div>
              </>
              ):( "" )}
              <div className="separator" />
              {ctxLinkedTargets.length === 0 ? (
                <div className="ctx-menu-item muted">No objects linked</div>
              ) : (
                <div className="ctx-menu-scroll">
                  {ctxLinkedTargets.map(t => (
                    <div key={t.id} className="ctx-menu-item" dangerouslySetInnerHTML={{ __html: t.path }}
                      onMouseEnter={async (e) => {
                        const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', t.id).catch(() => null) as any
                        if (!preview) return
                        let imgUrl = preview.thumbDataUrl || null
                        if (!imgUrl) {
                          const primary = preview.thumbPath as (string | undefined)
                          const secondary = preview.imagePath as (string | undefined)
                          if (primary) {
                            const resA = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', primary).catch(() => null)
                            if (resA?.ok) imgUrl = resA.dataUrl
                          }
                          if (!imgUrl && secondary) {
                            const resB = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', secondary).catch(() => null)
                            if (resB?.ok) imgUrl = resB.dataUrl
                          }
                        }
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        const pad = 10, CARD_W = 300
                        const baseX = rect.left + Math.min(16, Math.max(0, rect.width / 2))
                        const baseY = rect.bottom + 10
                        const targetX = baseX - (CARD_W / 2)
                        const nx = Math.max(pad, Math.min(targetX, window.innerWidth - pad - CARD_W))
                        const ny = Math.max(0, Math.min(baseY, window.innerHeight - 40))
                        setHoverCard({ visible: true, x: nx, y: ny, name: (preview.name || t.name), snippet: (preview.snippet || ''), imageUrl: imgUrl })
                      }}
                      onMouseLeave={() => { if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false })) }}
                      onClick={() => { if (activeLocked) { setCtxMenu(m => ({ ...m, visible: false })); return } selectObject(t.id, t.name); setCtxMenu(m => ({ ...m, visible: false })); }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Left-click tag menu for multi-target links */}
          {tagMenu.visible && (
            <div className="tag-menu" style={{ left: tagMenu.x, top: tagMenu.y }}
              ref={tagMenuRef}
            >
              <div className="tag-menu-list">
                {tagMenu.items.map(t => {
                  if (/^__SEPARATOR/.test(t.id)) {
                    return <div key={t.id} className="separator" role="separator" />
                  }
                  return (
                  <div key={t.id} className="tag-menu-item"
                    onMouseEnter={async () => {
                      if (tagMenu.source !== 'tag') return
                      // fetch preview for object menu items
                      const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', t.id).catch(() => null) as { id: string; name: string; snippet: string; thumbDataUrl?: string | null; thumbPath?: string | null; imagePath?: string | null } | null
                      let imgUrl = (preview as any)?.thumbDataUrl || null
                      if (!imgUrl) {
                        const primary = (preview as any)?.thumbPath as (string | undefined)
                        const secondary = (preview as any)?.imagePath as (string | undefined)
                        if (primary) {
                          const resA = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', primary).catch(() => null)
                          if (resA?.ok) imgUrl = resA.dataUrl
                        }
                        if (!imgUrl && secondary) {
                          const resB = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', secondary).catch(() => null)
                          if (resB?.ok) imgUrl = resB.dataUrl
                        }
                      }
                      if (preview) setTagMenu(m => ({ ...m, hoverPreview: { id: t.id, name: preview.name || t.name, snippet: preview.snippet || '', imageUrl: imgUrl } }))
                    }}
                    onClick={async () => {
                      if (/^__SEPARATOR/.test(t.id)) return
                      if (t.id === '__DELETE__') {
                        const ok = await confirmDialog({ title: 'Delete', message: `Delete '${activeName}' and all descendants?`, variant: 'yes-no' })
                        if (!ok) { setTagMenu(m => ({ ...m, visible: false, hoverPreview: null })); return }
                        await window.ipcRenderer.invoke('gamedocs:delete-object-cascade', activeId)
                        // After delete, go to parent or root
                        if (parent) {
                          selectObject(parent.id, parent.name)
                        } else if (root) {
                          selectObject(root.id, root.name)
                        }
                        try {
                          const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign!.id).catch(() => false)
                          setHasPlaces(!!has)
                        } catch {}
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        return
                      }
                      if (t.id === '__SETTINGS__') {
                        setShowSettings(true)
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        return
                      }
                      if (t.id === '__EDITOBJECT__') {
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        setEditName(activeName)
                        // preload relations
                        const obj = await window.ipcRenderer.invoke('gamedocs:get-object', activeId)
                        setWizardType((obj?.type as any) || 'Other')
                        const [ot, inc] = await Promise.all([
                          window.ipcRenderer.invoke('gamedocs:list-owner-tags', activeId).catch(() => []),
                          window.ipcRenderer.invoke('gamedocs:list-incoming-links', activeId).catch(() => []),
                        ])
                        setOwnerTags(ot || [])
                        setIncomingLinks(inc || [])
                        setShowEditObject(true)
                        return
                      }
                      if (t.id === '__LOCK__') {
                        await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, true)
                        setActiveLocked(true)
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        return
                      }
                      if (t.id === '__UNLOCK__') {
                        await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, false)
                        setActiveLocked(false)
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        return
                      }
                      if (t.id === '__ADDPICTURE__') {
                        setAddPictureModal(true)
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        return
                      }
              if (t.id === '__MISC_STUFF__') {
                setShowMisc(true)
                setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                return
              }
                      selectObject(t.id, t.name); setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                    }}
                  >{t.name}</div>)
                })}
              </div>
              {tagMenu.hoverPreview && (
                <div className="preview-card">
                  <div className="preview-card-title">{tagMenu.hoverPreview.name}</div>
                  {tagMenu.hoverPreview.imageUrl && (
                    <img src={tagMenu.hoverPreview.imageUrl} className="preview-card-image" />
                  )}
                  {tagMenu.hoverPreview.snippet && (
                    <div className="preview-card-snippet">{tagMenu.hoverPreview.snippet}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Misc Stuff modal: compact context-like options */}
          {showMisc && (
            <div className="modal-overlay" onClick={() => setShowMisc(false)}>
              <div className="dialog-card w-360" onClick={e => e.stopPropagation()}>
                <h3 className="mt-0">Misc</h3>
                <div className="misc-list">
                  <div className="misc-item" onClick={handleExportToShare}>Export to Share</div>
                  <div className="misc-item" onClick={() => { /* TODO: Export to PDF */ }}>Export to PDF</div>
                  <div className="misc-item" onClick={handleExportToHtml}>Export to HTML</div>
                   {hasPlaces ? (
                     <div className="misc-item" onClick={async () => {
                       setShowMisc(false)
                       await window.ipcRenderer.invoke('gamedocs:open-map', campaign!.id).catch(() => toast('Failed to open map', 'error'))
                     }}>Generate map</div>
                   ) : null}
                  {activeLocked ? null : (
                    <div className="misc-item" onClick={handleListAllItems}>List all items</div>
                  )}
                  <div className="misc-item" onClick={() => { /* TODO: Create Backup */ }}>Create backup</div>
                </div>
                <div className="actions mt-12">
                  <button onClick={() => setShowMisc(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Add Picture modal */}
          {addPictureModal && (
            <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setAddPictureModal(false) }}>
              <div className="dialog-card w-520" onKeyDown={e => { if (e.key === 'Escape') { setAddPictureModal(false) } }}>
                <h3 className="dialog-title">Add Picture</h3>
                <div className="grid-gap-10">
                  <label>
                    <div>Name (optional)</div>
                    <input autoFocus placeholder="Name" value={picName} onChange={e => setPicName(e.target.value)} className="input-100" />
                  </label>
                  <div className="flex-row">
                    <label><input type="radio" checked={picSource.type === 'file'} onChange={() => setPicSource(s => ({ type: 'file', value: '' }))} /> File</label>
                    <button onClick={async () => {
                      const res = await window.ipcRenderer.invoke('gamedocs:choose-image')
                      if (res?.path) setPicSource({ type: 'file', value: res.path })
                    }}>Browse…</button>
                    <span className="muted-ellipsis">{picSource.type === 'file' ? (picSource.value || 'No file selected') : ''}</span>
                  </div>
                  <div className="flex-row">
                    <label><input id="picSourceUrl" type="radio" checked={picSource.type === 'url'} onChange={() => setPicSource(s => ({ type: 'url', value: '' }))} /> URL</label>
                    <input placeholder="https://..." value={picSource.type === 'url' ? picSource.value : ''} onChange={(e) => { setPicSource({ type: 'url', value: e.target.value }); }} className="flex-1" />
                  </div>
                  <label className="items-center flex-gap-8">
                    <input type="checkbox" checked={picIsDefault} onChange={e => setPicIsDefault(e.target.checked)} /> Default image
                  </label>
                </div>
                <div className="actions">
                  <button onClick={() => setAddPictureModal(false)}>Cancel</button>
                  <button onClick={async () => {
                    const src = picSource
                    if (!src.value) return
                    const row = await window.ipcRenderer.invoke('gamedocs:add-image', activeId, { name: (picName || null), source: src, isDefault: picIsDefault })
                    setAddPictureModal(false)
                    setPicName(''); setPicIsDefault(false); setPicSource({ type: 'file', value: '' })
                    // Refresh list
                    const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', activeId)
                    setImages(imgs || [])
                  }}>OK</button>
                </div>
              </div>
            </div>
          )}

          {/* Images under description */}
          {images.length > 0 && (
            <div className="images-section">
              <div className="images-title">Images</div>
              <div className="thumb-list">
                {images.map(img => (
                  <div key={img.id} className="thumb-card">
                    
                    <img src={safeThumbSrc(img)} className="thumb-img" onClick={async (e) => {
                      if ((e as any).shiftKey) {
                        await window.ipcRenderer.invoke('gamedocs:open-image-external', img.file_path)
                      } else {
                        const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', img.file_path)
                        if (res?.ok) setImageModal({ visible: true, dataUrl: res.dataUrl })
                      }
                    }} />
                    <div className="thumb-row">
                      <span title={img.name || ''}>{img.name || '(unnamed)'}</span>
                      {img.is_default ? <span title='Default'>⭐</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Object modal */}
          {showEditObject && (
            <div className="edit-modal-overlay" onClick={() => setShowEditObject(false)}>
              <div className="edit-modal-width" onClick={e => e.stopPropagation()}>
                <div className="edit-modal">
                  <div className="edit-modal-header">
                    <h3 className="m-0">Edit object</h3>
                    <div className="flex-gap-8">
                      <button onClick={() => setShowEditObject(false)}>Close</button>
                      <button onClick={async () => {
                        const target = editTargetId || activeId
                        await window.ipcRenderer.invoke('gamedocs:rename-object', target, editName)
                        await window.ipcRenderer.invoke('gamedocs:update-object-type', target, wizardType)
                        setShowEditObject(false)
                        // Keep the current visible object unchanged
                        if (!editTargetId) {
                          // If editing active object, refresh it to reflect changes
                        selectObject(activeId, editName)
                        }
                        setEditTargetId(null)
                      }}>Save</button>
                    </div>
                  </div>
                  <div className="edit-modal-grid">
                    <div className="grid-gap-10-only">
                      <div className="flex-gap-8">
                        <label className="flex-1">Name <input value={editName} onChange={e => setEditName(e.target.value)} className="input-100" /></label>
                        <label className="w-160">Type
                          <select value={wizardType} onChange={e => setWizardType(e.target.value as any)} className="input-100">
                            <option value='Other'>Other</option>
                            <option value='Place'>Place</option>
                            <option value='Person'>Person</option>
                            <option value='Lore'>Lore</option>
                          </select>
                        </label>
                      </div>
                      <div className="boxed">
                        <div className="box-title">Tags owned by this object</div>
                        {ownerTags.length === 0 ? <div className="muted">No tags</div> : (
                          <ul className="list-reset">
                            {ownerTags.map(t => (
                              <li key={t.id} className="list-item-row">
                                <code>{t.id}</code>
                                <div className="flex-gap-6">
                                  <button title='Delete tag and its links' onClick={async () => { await window.ipcRenderer.invoke('gamedocs:delete-link-tag', t.id); const ot = await window.ipcRenderer.invoke('gamedocs:list-owner-tags', activeId).catch(() => []); setOwnerTags(ot || []) }}>Delete</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="boxed">
                        <div className="box-title">Objects linking to this</div>
                        {incomingLinks.length === 0 ? <div className="muted">No incoming links</div> : (
                          <ul className="list-reset">
                            {incomingLinks.map(l => (
                              <li key={l.tag_id + l.owner_id} className="list-item-row">
                                <span title={l.owner_path}>{l.owner_name}</span>
                                <div className="flex-gap-6">
                                  <button title='Remove link' onClick={async () => { await window.ipcRenderer.invoke('gamedocs:remove-link-target', l.tag_id, activeId); const inc = await window.ipcRenderer.invoke('gamedocs:list-incoming-links', activeId).catch(() => []); setIncomingLinks(inc || []) }}>Remove</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    <div className="boxed">
                      <div className="box-title">Images</div>
                      {images.length === 0 ? <div className="muted">No images</div> : (
                        <div className="thumb-list">
                          {images.map(img => (
                            <div key={img.id} className="thumb-card w-200">
                              <img src={safeThumbSrc(img)} className="thumb-img" onClick={async (e) => {
                                if ((e as any).shiftKey) {
                                  await window.ipcRenderer.invoke('gamedocs:open-image-external', img.file_path)
                                } else {
                                  const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', img.file_path)
                                  if (res?.ok) setImageModal({ visible: true, dataUrl: res.dataUrl })
                                }
                              }} />
                              <input defaultValue={img.name || ''} placeholder='Name' className="input-100 mt-6" onBlur={async (e) => { const v = e.target.value; await window.ipcRenderer.invoke('gamedocs:rename-image', img.id, v) }} />
                              <div className="justify-between mt-6 items-center">
                                <label className="items-center flex-gap-6"><input type='radio' checked={!!img.is_default} onChange={async () => { await window.ipcRenderer.invoke('gamedocs:set-default-image', activeId, img.id); const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', activeId); setImages(imgs || []) }} /> Default</label>
                                <button onClick={async () => { await window.ipcRenderer.invoke('gamedocs:delete-image', img.id); const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', activeId); setImages(imgs || []) }}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit picker when multiple objects linked in a tag */}
          {showEditPicker && (
            <div className="modal-overlay" onClick={() => setShowEditPicker(false)}>
              <div className="dialog-card w-420" onClick={e => e.stopPropagation()}>
                <h3 className="mt-0">Choose object to edit</h3>
                <div className="mt-10 maxh-260 border-top">
                  <ul className="list-reset">
                    {editPickerItems.map(it => (
                      <li key={it.id} className="list-item-click"
                        onClick={async () => { setShowEditPicker(false); await openEditForObject(it.id, it.name) }}
                        dangerouslySetInnerHTML={{ __html: it.path }}
                      />
                    ))}
                  </ul>
                </div>
                <div className="actions mt-12">
                  <button onClick={() => setShowEditPicker(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Command Palette */}
          {showPalette && (
            <div className="palette-overlay" onClick={() => setShowPalette(false)}>
              <div className="palette-container" onClick={(e) => e.stopPropagation()}>
                <div className="palette-card">
                  {cmdParamMode && selectedCommand ? (
                    <div className="muted pad-8" style={{ marginBottom: 6 }}>{selectedCommand.description || ''}</div>
                  ) : null}
                  <input
                    autoFocus
                    placeholder={isCommandMode ? (cmdParamMode && selectedCommand ? (
                      (() => {
                        const meta = getParamMeta(selectedCommand)
                        if (meta.key === 'palette') return 'palette'
                        if (meta.key === 'color') return "color eg: 'red', '(255, 0, 0)' or '#FF0000'"
                        return 'Enter parameter'
                      })()
                    ) : 'Type > to run a command') : 'Search objects, tags, or type a command'}
                    value={paletteInput}
                    onChange={e => setPaletteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && isCommandMode) {
                        if (cmdParamMode) { setCmdParamMode(false); setSelectedCommand(null); setPaletteInput('>') }
                        else { setIsCommandMode(false); setPaletteInput('') }
                      }
                      if (e.key === 'Enter' && isCommandMode && cmdParamMode && selectedCommand) {
                        const meta = getParamMeta(selectedCommand)
                        const key = meta.key
                        const v = paletteInput.trim()
                        if (!key) return
                        // If choices exist, commit currently highlighted choice; otherwise commit free text
                        const hasChoices = Array.isArray(meta.choices) && meta.choices.length > 0
                        if (hasChoices) {
                          const all: any[] = meta.choices
                          const term = paletteInput.trim().toLowerCase()
                          const filtered = all.filter(ch => String(ch).toLowerCase().includes(term))
                          const idx = Math.min(Math.max(0, paletteSelIndex), Math.max(0, filtered.length - 1))
                          const choice = filtered[idx]
                          if (choice) commitParam(String(choice))
                        } else {
                          if (v) commitParam(v)
                        }
                      }
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setPaletteSelIndex(i => i + 1)
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setPaletteSelIndex(i => Math.max(0, i - 1))
                      }
                      if (e.key === 'Enter' && isCommandMode && !cmdParamMode) {
                        const list = filteredCommands
                        const idx = Math.min(Math.max(0, paletteSelIndex), Math.max(0, list.length - 1))
                        const cmd = list[idx]
                        if (cmd) {
                          const hasParam = !!(cmd as any).parameters
                          if (!hasParam) runCommand(cmd.id)
                          else beginParamMode(cmd)
                        }
                      }
                    }}
                    className="palette-input"
                  />
                  <div className="palette-results" ref={paletteResultsRef as any}>
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
                                <div key={String(ch)} className="palette-item" style={{ background: idx === paletteSelIndex ? '#333' : undefined }} onClick={() => { commitParam(String(ch)) }}>{String(ch)}</div>
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
                              <div key={cmd.id} className="palette-item" style={{ background: idx === paletteSelIndex ? '#333' : undefined }} onClick={() => {
                                const hasParam = !!(cmd as any).parameters
                                if (!hasParam) runCommand(cmd.id)
                                else beginParamMode(cmd)
                              }}>{cmd.name}</div>
                            ))}
                          </div>
                        )
                      )
                    ) : (
                      (paletteResults.objects.length === 0 && paletteResults.tags.length === 0) ? (
                      <div className="muted pad-8">No results</div>
                    ) : (
                      <>
                        {paletteResults.objects.length > 0 && (
                          <div className="pad-8">
                            <div className="palette-section-title">Objects</div>
                            {paletteResults.objects.map(o => (
                              <div key={o.id} className="palette-item" onClick={() => { setShowPalette(false); selectObject(o.id, o.name) }}>{o.name}</div>
                            ))}
                          </div>
                        )}
                        {paletteResults.tags.length > 0 && (
                          <div className="pad-8">
                            <div className="palette-section-title">Tags</div>
                            {paletteResults.tags.map(t => (
                              <div key={t.id} className="palette-item" onClick={() => { setShowPalette(false); /* could show tag usage or navigate owner */ }}>{t.id}</div>
                            ))}
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
          )}

          {/* Fullscreen image modal */}
          {imageModal.visible && (
            <div className="image-modal-overlay" onClick={() => setImageModal({ visible: false, dataUrl: null })}>
              <div className="image-modal-content">
                {imageModal.dataUrl && <img src={imageModal.dataUrl} className="image-modal-img" />}
              </div>
            </div>
          )}

          {/* Settings modal */}
          {showSettings && (
            <div className="settings-overlay" onClick={() => setShowSettings(false)}>
              <div className="settings-width" onClick={e => e.stopPropagation()}>
                <div className="settings-card">
                  <div className="settings-header">
                    <h3 className="m-0">Settings</h3>
                    <div className="flex-gap-8">
                      <button onClick={() => setShowSettings(false)}>Close</button>
                      <button onClick={async () => {
                        const payload = { key: paletteKey, colors: paletteKey === 'custom' ? customColors : null }
                        await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.palette', payload)
                        await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.fonts', fonts)
                        applyPalette(paletteKey, paletteKey === 'custom' ? customColors : null)
                        applyFonts(fonts)
                        setShowSettings(false)
                      }}>Save</button>
                    </div>
                  </div>

                  <div className="settings-columns">
                    {/* Left column: palette + fonts */}
                    <div className="settings-col">
                      <div className="settings-group">
                        <label className="box-title">Color palette</label>
                        <select value={paletteKey} onChange={e => { const k = e.target.value as any; setPaletteKey(k); applyPalette(k, null) }} className="settings-select">
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
                        <label className="box-title">Fonts</label>
                        <div className="settings-flex-wrap">
                          <label className="w-260" style={{ flex: '1 1 260px' }}>Family
                            <div className="settings-flex">
                              <select value={fonts.family} onChange={(e) => { const f = { ...fonts, family: e.target.value }; setFonts(f); applyFonts(f) }} className="flex-1">
                                <option value="system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif">System UI</option>
                                <option value="Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">Inter</option>
                                <option value="Segoe UI, system-ui, -apple-system, Roboto, Inter, sans-serif">Segoe UI</option>
                                <option value="Roboto, system-ui, -apple-system, Segoe UI, Inter, sans-serif">Roboto</option>
                                <option value="Source Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif">Source Sans Pro</option>
                                <option value="Georgia, serif">Georgia</option>
                                <option value="Garamond, serif">Garamond</option>
                                <option value="Palatino Linotype, Book Antiqua, Palatino, serif">Palatino</option>
                              </select>
                              
                            </div>
                          </label>
                          <label className="w-110">Size <input type="number" min={10} max={24}
                            value={fonts.size}
                            onChange={(e) => { const f = { ...fonts, size: parseInt(e.target.value || '14', 10) }; setFonts(f); applyFonts(f) }}
                            className="settings-number" /></label>
                          <label className="w-120">Weight <input type="number" min={100} max={900} step={100}
                            value={fonts.weight}
                            onChange={(e) => { const f = { ...fonts, weight: parseInt(e.target.value || '400', 10) }; setFonts(f); applyFonts(f) }}
                            className="settings-number" /></label>
                          <label>Text Color <input type="color"
                            value={fonts.color}
                            onChange={(e) => { const f = { ...fonts, color: e.target.value }; setFonts(f); applyFonts(f) }} /></label>
                          
                          <button title="Choose font file" onClick={async () => {
                                const pick = await window.ipcRenderer.invoke('gamedocs:choose-font-file').catch(() => null)
                                if (pick?.path) {
                                  const loaded = await window.ipcRenderer.invoke('gamedocs:read-font-as-dataurl', pick.path).catch(() => null)
                                  if (loaded?.dataUrl) {
                                    const fontName = loaded.suggestedFamily || 'CustomFont'
                                    const styleTagId = `pd-font-${fontName}`
                                    if (!document.getElementById(styleTagId)) {
                                      const st = document.createElement('style')
                                      st.id = styleTagId
                                      st.innerHTML = `@font-face{ font-family: "${fontName}"; src: url(${loaded.dataUrl}) format("${(loaded.mime||'').includes('woff')?'woff2':'truetype'}"); font-weight: 100 900; font-style: normal; font-display: swap; }`
                                      document.head.appendChild(st)
                                    }
                                    const f = { ...fonts, family: `${fontName}, ${fonts.family}` }
                                    setFonts(f); applyFonts(f)
                                  }
                                }
                              }}>Browse…</button>

                          {/* <button onClick={async () => {
                            const res = await window.ipcRenderer.invoke('gamedocs:choose-font-file').catch(() => null)
                            if (res?.path) {
                              // Placeholder: user can install font system-wide; we simply store path for future
                              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.customFontPath', { path: res.path })
                            }
                          }}>Choose Font File…</button> */}
                        </div>
                      </div>
                    </div>

                    {/* Right column: shortcuts */}
                    <div className="settings-right">
                      <div className="settings-title">Keyboard shortcuts</div>
                      <div className="settings-grid-2">
                        <div className="settings-shortcut-row"><label htmlFor="settings">Settings </label><input id="settings" value={shortcuts.settings} onChange={e => setShortcuts(s => ({ ...s, settings: e.target.value }))} placeholder='F1' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="editObject">Edit object </label><input id="editObject" value={shortcuts.editObject} onChange={e => setShortcuts(s => ({ ...s, editObject: e.target.value }))} placeholder='F2' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="command">Command palette </label><input id="command" value={shortcuts.command} onChange={e => setShortcuts(s => ({ ...s, command: e.target.value }))} placeholder='Ctrl+K' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="newChild">New child </label><input id="newChild" value={shortcuts.newChild} onChange={e => setShortcuts(s => ({ ...s, newChild: e.target.value }))} placeholder='Ctrl+N' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="addImage">Add image </label><input id="addImage" value={shortcuts.addImage} onChange={e => setShortcuts(s => ({ ...s, addImage: e.target.value }))} placeholder='Ctrl+I' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="miscStuff">Open Misc stuff </label><input id="miscStuff" value={shortcuts.miscStuff} onChange={e => setShortcuts(s => ({ ...s, miscStuff: e.target.value }))} placeholder='Ctrl+M' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="exportShare">Export to Share </label><input id="exportShare" value={shortcuts.exportShare} onChange={e => setShortcuts(s => ({ ...s, exportShare: e.target.value }))} placeholder='Ctrl+E' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="toggleLock">Toggle lock </label><input id="toggleLock" value={shortcuts.toggleLock} onChange={e => setShortcuts(s => ({ ...s, toggleLock: e.target.value }))} placeholder='Ctrl+L' /></div>
                        <button className="settings-save-row" onClick={async () => { await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.shortcuts', shortcuts) }}>Save shortcuts</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Child modal */}
          {showCat && (
            <div className="modal-overlay">
              <div className="dialog-card w-360">
                <h3 className="mt-0">Add Child</h3>
                <div className="grid-gap-8">
                  <label>
                    <div>Name</div>
                    <input autoFocus value={catName} onKeyDown={e => { if (e.key === 'Enter') { handleCreateChild() } else if (e.key === 'Escape') { setShowCat(false) } }} onChange={e => setCatName(e.target.value)} className="input-100" />
                  </label>
                  <label>
                    <div>Type</div>
                    <select value={catType} onChange={e => setCatType(e.target.value as any)} className="input-100">
                      <option value='Other'>Other</option>
                      <option value='Place'>Place</option>
                      <option value='Person'>Person</option>
                      <option value='Lore'>Lore</option>
                    </select>
                  </label>
                  {catErr && <div className="text-tomato">{catErr}</div>}
                </div>
                <div className="actions">
                  <button onClick={() => setShowCat(false)}>Cancel</button>
                  <button onClick={async () => { handleCreateChild() }}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Create linked object modal */}
          {showWizard && (
            <div className="modal-overlay">
              <div className="dialog-card w-420">
                <h3 className="mt-0">Create linked object</h3>
                <div className="grid-gap-8">
                  <label>
                    <div>Name</div>
                    <input value={wizardName} onChange={e => setWizardName(e.target.value)} className="input-100" />
                  </label>
                  <label>
                    <div>Type</div>
                    <select value={wizardType} onChange={e => setWizardType(e.target.value as any)} className="input-100">
                      <option value='Other'>Other</option>
                      <option value='Place'>Place</option>
                      <option value='Person'>Person</option>
                      <option value='Lore'>Lore</option>
                    </select>
                  </label>
                </div>
                <div className="actions">
                  <button onClick={() => setShowWizard(false)}>Cancel</button>
                  <button onClick={async () => {
                  const label = (wizardName || '').trim()
                    if (!label) return
                    const rootObj = await window.ipcRenderer.invoke('gamedocs:get-root', campaign!.id)
                  const res = await window.ipcRenderer.invoke('gamedocs:create-object-and-link-tag', campaign!.id, activeId || rootObj.id, label, (wizardType as string))
                    setShowWizard(false)
                  replaceSelectionWithSpan(label, res.tagId)
                  }}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Link to object modal */}
          {showLinker && (
            <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setShowLinker(false) }}>
              <div className="dialog-card w-520" onKeyDown={e => { if (e.key === 'Escape') { setShowLinker(false) } }}>
                <h3 className="mt-0">Link to object</h3>
                <div className="flex-row">
                  <input value={linkerInput} autoFocus onChange={async e => {
                    const v = e.target.value
                    setLinkerInput(v)
                    setPathChoices([])
                    if (!v.trim()) { setLinkerMatches(allObjects.slice(0, 10)); return }
                    const fuse = fuseRef.current
                    if (fuse) {
                      const res = fuse.search(v).map(r => r.item).slice(0, 10)
                      setLinkerMatches(res)
                    }
                  }} className="flex-1" placeholder={'Search or type new name'} />
                  {linkerTagId ? <span title='Existing link'>🔗</span> : <span title='New item'>⎇</span>}
                </div>

                {/* Path choices */}
                {pathChoices.length > 0 ? (
                  <div className="mt-10 maxh-260 border-top">
                    <ul className="list-reset">
                      {pathChoices.map(pc => (
                        <li key={pc.id} className="list-item-click"
                          onClick={async () => {
                            let tid = linkerTagId
                            if (!tid) {
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id, activeId || root!.id)
                              tid = res.tagId
                              setLinkerTagId(tid)
                            }
                            await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, pc.id)
                            replaceSelectionWithSpan(linkerInput || pc.name, tid as string)
                            setShowLinker(false)
                          }}
                        >{pc.path}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-10 maxh-260 border-top">
                    {linkerMatches.length === 0 ? (
                      <div className="muted pad-8">No objects</div>
                    ) : (
                      <ul className="list-reset">
                        {linkerMatches.map(m => (
                          <li key={m.id} className="list-item-click"
                            onClick={async () => {
                              // Check if multiple with same name
                              const same = await window.ipcRenderer.invoke('gamedocs:get-objects-by-name-with-paths', campaign!.id, m.name)
                              if ((same || []).length > 1) {
                                setPathChoices(same || [])
                                return
                              }
                              let tid = linkerTagId
                              if (!tid) {
                                const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id, activeId || root!.id)
                                tid = res.tagId
                                setLinkerTagId(tid)
                              }
                              await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, m.id)
                              replaceSelectionWithSpan(linkerInput || m.name, tid as string)
                              setShowLinker(false)
                            }}
                          >{m.name}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Close button */}
                <div className="actions">
                  <button onClick={() => setShowLinker(false)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function insertTextAt(el: HTMLTextAreaElement, text: string) {
  // legacy helper; unused with contentEditable
  const start = el.selectionStart || 0
  const end = el.selectionEnd || 0
  const value = el.value
  const newValue = value.slice(0, start) + text + value.slice(end)
  el.value = newValue
  const newPos = start + text.length
  el.selectionStart = el.selectionEnd = newPos
}




