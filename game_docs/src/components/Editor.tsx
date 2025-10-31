import React, { useCallback, useEffect, useRef, useState } from 'react'
import './editor.css'
import Fuse from 'fuse.js'
import { confirmDialog, toast } from './Confirm'
import { logger } from '../utils/logger'
import ShortcutInput from './ShortcutInput'


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
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [catDescription, setCatDescription] = useState<string>('')
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
  const [childCtxMenu, setChildCtxMenu] = useState<{
    visible: boolean
    x: number
    y: number
    selText: string
    selId: string
  }>({ visible: false, x: 0, y: 0, selText: '', selId: '' })
  const [showWizard, setShowWizard] = useState(false)
  const [wizardName, setWizardName] = useState('')
  const [wizardType, setWizardType] = useState<'Place' | 'Person' | 'Lore' | 'Other'>('Other')
  // Edit target picker when a tag links to multiple objects
  const [showEditPicker, setShowEditPicker] = useState(false)
  const [editPickerItems, setEditPickerItems] = useState<Array<{ id: string; tag_id: string; name: string; path: string }>>([])
  // Target being edited (can differ from active object)
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  // Linker modal state
  const [showLinker, setShowLinker] = useState(false)
  const [linkerInput, setLinkerInput] = useState('')
  const [linkerMatches, setLinkerMatches] = useState<Array<{ id: string; name: string; path?: string }>>([])
  const [linkerTagId, setLinkerTagId] = useState<string | null>(null)
  const [linkerSelIndex, setLinkerSelIndex] = useState(0)
  const [isLinkLastWordMode, setIsLinkLastWordMode] = useState(false)
  const [allObjects, setAllObjects] = useState<Array<{ id: string; name: string; parent_id: string | null }>>([])
  const [pathChoices, setPathChoices] = useState<Array<{ id: string; name: string; path: string }>>([])
  const fuseRef = useRef<Fuse<any> | null>(null)
  const [ctxLinkedTargets, setCtxLinkedTargets] = useState<Array<{ id: string; name: string; path: string; tag_id: string }>>([])
  // Hover preview for single-target tags
  const [hoverCard, setHoverCard] = useState<{ visible: boolean; x: number; y: number; name: string; snippet: string; imageUrl: string | null }>({ visible: false, x: 0, y: 0, name: '', snippet: '', imageUrl: null })
  const [imageModal, setImageModal] = useState<{ visible: boolean; dataUrl: string | null }>({ visible: false, dataUrl: null })
  const lastHoverTagRef = useRef<string | null>(null)
  const hoverDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Left-click menu for multi-target tags
  const [tagMenu, setTagMenu] = useState<{ visible: boolean; x: number; y: number; items: Array<{ id: string; name: string; path: string }>; hoverPreview: { id: string; name: string; snippet: string; imageUrl: string | null } | null; source?: 'dropdown' | 'tag' }>({ visible: false, x: 0, y: 0, items: [], hoverPreview: null, source: undefined })
  const ctxMenuRef = useRef<HTMLDivElement | null>(null)
  const childCtxMenuRef = useRef<HTMLDivElement | null>(null)
  const tagMenuRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const childItemMouseStateRef = useRef<Map<string, { mouseDownOnItem: boolean; hasMoved: boolean; startX: number; startY: number; startItemId: string }>>(new Map())
  const [images, setImages] = useState<Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>>([])
  const [editImages, setEditImages] = useState<Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>>([])
  const [addPictureModal, setAddPictureModal] = useState(false)
  const [picName, setPicName] = useState('')
  const [picIsDefault, setPicIsDefault] = useState(true)
  const [picSource, setPicSource] = useState<{ type: 'file' | 'url'; value: string }>({ type: 'file', value: '' })
  const [showMisc, setShowMisc] = useState(false)
  const [ctrlKeyPressed, setCtrlKeyPressed] = useState(false)
  const [hoverDebounce, setHoverDebounce] = useState(300) // milliseconds

  // Command palette: commands and parameter flow
  const [isCommandMode, setIsCommandMode] = useState(false)
  const [filteredCommands, setFilteredCommands] = useState<any[]>([])
  const [cmdParamMode, setCmdParamMode] = useState(false)
  const [selectedCommand, setSelectedCommand] = useState<any | null>(null)
  const [paletteSelIndex, setPaletteSelIndex] = useState(0)
  const paletteResultsRef = useRef<HTMLDivElement | null>(null)
  const linkerResultsRef = useRef<HTMLDivElement | null>(null)

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
    if (editorRef.current) {
      // Preserve scroll position before updating content
      const scrollTop = editorRef.current.scrollTop
      
      editorRef.current.innerHTML = descToHtml(next)
      
      // Restore scroll position after content update
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.scrollTop = scrollTop
        }
      })
    }
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

  const writeToClipboard = useCallback(async (text: string) => {
    try {
      if (await window.ipcRenderer.invoke('gamedocs:write-to-clipboard', text)) {
        toast('Email address copied to clipboard', 'success')
      } else {
        toast('Failed to copy email address to clipboard', 'error')
      }
    } catch {
      toast('Failed to copy email address to clipboard', 'error')
    }
  }, [])

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

  const handleExportToPdf = useCallback(async () => {
    if (!campaign) return
    try {
      const cs = getComputedStyle(document.documentElement)
      const palette = {
        primary: (cs.getPropertyValue('--pd-primary') || '#6495ED').trim(),
        surface: (cs.getPropertyValue('--pd-surface') || '#1e1e1e').trim(),
        text: (cs.getPropertyValue('--pd-text') || '#e5e5e5').trim(),
        tagBg: (cs.getPropertyValue('--pd-tag-bg') || 'rgba(100,149,237,0.2)').trim(),
        tagBorder: (cs.getPropertyValue('--pd-tag-border') || '#6495ED').trim(),
      }
      const res = await window.ipcRenderer.invoke('gamedocs:export-to-pdf', campaign.id, { palette })
      if (res && res.ok) {
        toast('PDF export completed', 'success')
        
        // Ask if user wants to open the folder
        const openFolder = await confirmDialog({ 
          title: 'PDF Export Complete', 
          message: `PDF "${res.fileName}" has been saved successfully. Would you like to open the folder where it was saved?`, 
          variant: 'yes-no' 
        })
        
        if (openFolder) {
          await window.ipcRenderer.invoke('gamedocs:reveal-path', res.filePath)
        }
      } else {
        toast('Export cancelled', 'info')
      }
    } catch (e) {
      toast('Export to PDF failed', 'error')
    }
  }, [campaign])

  const handleCreateBackup = useCallback(async () => {
    try {
      const res = await window.ipcRenderer.invoke('gamedocs:create-backup')
      if (res && res.ok) {
        toast('Database backup created successfully', 'success')
        
        // Ask if user wants to open the folder
        const openFolder = await confirmDialog({ 
          title: 'Backup Complete', 
          message: `Database backup "${res.fileName}" has been created successfully. Would you like to open the folder where it was saved?`, 
          variant: 'yes-no' 
        })
        
        if (openFolder) {
          await window.ipcRenderer.invoke('gamedocs:reveal-path', res.filePath)
        }
      } else {
        toast('Backup cancelled', 'info')
      }
    } catch (e) {
      toast('Failed to create backup', 'error')
    }
  }, [])

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
  const [ownerTags, setOwnerTags] = useState<Array<{ id: string, name: string, object_id: string }>>([])
  const [incomingLinks, setIncomingLinks] = useState<Array<{ tag_id: string; owner_id: string; owner_name: string; owner_path: string }>>([])
  const [showPalette, setShowPalette] = useState(false)
  const [paletteInput, setPaletteInput] = useState('')
  const [paletteResults, setPaletteResults] = useState<{ objects: Array<{ id: string; name: string }>; tags: Array<{ id: string; object_id: string }> }>({ objects: [], tags: [] })
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveItems, setMoveItems] = useState<Array<{ id: string; name: string; path: string }>>([])
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [possibleParents, setPossibleParents] = useState<Array<{ id: string; name: string; path: string }>>([])
  const [parentSearchInput, setParentSearchInput] = useState('')
  const [filteredParents, setFilteredParents] = useState<Array<{ id: string; name: string; path: string }>>([])
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false)
  const [allObjectsForBulk, setAllObjectsForBulk] = useState<Array<{ id: string; name: string; path: string; parent_id: string | null }>>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkNameFilter, setBulkNameFilter] = useState('')
  const [bulkParentFilter, setBulkParentFilter] = useState('')
  const [includeDescendants, setIncludeDescendants] = useState(false)
  const [filteredBulkItems, setFilteredBulkItems] = useState<Array<{ id: string; name: string; path: string; parent_id: string | null }>>([])
  const [paletteKey, setPaletteKey] = useState<'dracula' | 'solarized-dark' | 'solarized-light' | 'github-dark' | 'github-light' | 'night-owl' | 'monokai' | 'parchment' | 'primary-blue' | 'primary-green' | 'custom'>('dracula')
  const [customColors, setCustomColors] = useState<{ primary: string; surface: string; text: string; tagBg: string; tagBorder: string }>({ primary: '#6495ED', surface: '#1e1e1e', text: '#e5e5e5', tagBg: 'rgba(100,149,237,0.2)', tagBorder: '#6495ED' })
  const [fonts, setFonts] = useState<{ family: string; size: number; weight: number; color: string }>({ family: 'system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif', size: 14, weight: 400, color: '#e5e5e5' })
  const [customFont, setCustomFont] = useState<{ fontName: string; fontPath: string; fileName: string } | null>(null)
  const [shortcuts, setShortcuts] = useState<{ settings: string; editObject: string; command: string; command2: string; newChild: string; addImage: string, miscStuff: string, exportShare: string, toggleLock: string, goToParent: string, goToPreviousSibling: string, goToNextSibling: string, linkLastWord: string, showHelp: string, }>({ settings: 'F1', editObject: 'F2', command: 'Ctrl+K', command2: 'Ctrl+Shift+K', newChild: 'Ctrl+N', addImage: 'Ctrl+I', miscStuff: 'Ctrl+Shift+M', exportShare: 'Ctrl+E', toggleLock: 'Ctrl+L', goToParent: 'Ctrl+ARROWUP', goToPreviousSibling: 'Ctrl+ArrowLeft', goToNextSibling: 'Ctrl+ArrowRight', linkLastWord: 'Ctrl+Shift+L', showHelp: 'Ctrl+H' })
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
      const customFontData = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.customFont').catch(() => null)
      
      // Load custom font if it exists
      if (customFontData?.fontPath && customFontData?.fontName) {
        setCustomFont(customFontData)
        try {
          const loaded = await window.ipcRenderer.invoke('gamedocs:read-font-as-dataurl', customFontData.fontPath).catch(() => null)
          if (loaded?.dataUrl) {
            const styleTagId = `pd-font-${customFontData.fontName}`
            if (!document.getElementById(styleTagId)) {
              const st = document.createElement('style')
              st.id = styleTagId
              st.innerHTML = `@font-face{ font-family: "${customFontData.fontName}"; src: url(${loaded.dataUrl}) format("${(loaded.mime||'').includes('woff')?'woff2':'truetype'}"); font-weight: 100 900; font-style: normal; font-display: swap; }`
              document.head.appendChild(st)
            }
          }
        } catch (e) {
          console.warn('Failed to load custom font:', e)
        }
      }
      
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

      const savedHoverDebounce = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.hoverDebounce').catch(() => null)
      if (savedHoverDebounce && typeof savedHoverDebounce === 'number') {
        setHoverDebounce(savedHoverDebounce)
      }

      const savedSidebarWidth = await window.ipcRenderer.invoke('gamedocs:get-setting', 'ui.sidebarWidth').catch(() => null)
      if (savedSidebarWidth && typeof savedSidebarWidth === 'number') {
        setSidebarWidth(savedSidebarWidth)
      }
    })()
  }, [])

  const handleDeleteLink = useCallback(async (tag_id: string, id: string) => {
    await window.ipcRenderer.invoke('gamedocs:delete-tag-link', tag_id, id)
    toast('Link deleted', 'success')
    setShowEditPicker(false)
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
    const wantArrowUp = parts.includes('arrowup')
    const wantArrowDown = parts.includes('arrowdown')
    const wantArrowLeft = parts.includes('arrowleft')
    const wantArrowRight = parts.includes('arrowright')
    if (wantArrowUp && e.key !== 'ArrowUp') return false
    if (wantArrowDown && e.key !== 'ArrowDown') return false
    if (wantArrowLeft && e.key !== 'ArrowLeft') return false
    if (wantArrowRight && e.key !== 'ArrowRight') return false
    const wantCtrl = parts.includes('ctrl') || parts.includes('control')
    const wantShift = parts.includes('shift')
    const wantAlt = parts.includes('alt')
    if (wantCtrl !== (!!e.ctrlKey || !!e.metaKey)) return false
    if (wantShift !== !!e.shiftKey) return false
    if (wantAlt !== !!e.altKey) return false
    return e.key.toLowerCase() === key
  }

  // Track Ctrl key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setCtrlKeyPressed(true)
      }
    }
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        setCtrlKeyPressed(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchShortcut(e, shortcuts.command)) {
        e.preventDefault()
        setShowPalette(true)
        setPaletteInput('')
        setPaletteResults({ objects: [], tags: [] })
      } else if (matchShortcut(e, shortcuts.command2)) {
        e.preventDefault()
        setShowPalette(true)
        setPaletteInput('>')
        setPaletteResults({ objects: [], tags: [] })
      } else if (e.key === 'Escape') {
        setShowPalette(false)
        setShowSettings(false)
        setShowEditObject(false)
        setShowMoveModal(false)
        setShowBulkMoveModal(false)
      } else if (matchShortcut(e, shortcuts.settings)) {
        e.preventDefault(); setShowSettings(true)
      } else if (matchShortcut(e, shortcuts.editObject)) {
        e.preventDefault(); setTagMenu(m => ({ ...m, visible: false })); setEditName(activeName); setShowEditObject(true)
      } else if (matchShortcut(e, shortcuts.newChild)) {
        e.preventDefault(); setCatErr(null); setCatName(''); setCatDescription(''); setShowCat(true)
      } else if (matchShortcut(e, shortcuts.addImage)) {
        e.preventDefault(); setAddPictureModal(true)
      } else if (matchShortcut(e, shortcuts.miscStuff)) {
        e.preventDefault(); setShowMisc(true)
      } else if (matchShortcut(e, shortcuts.goToParent)) {
        e.preventDefault(); handleGoToParent()
      } else if (matchShortcut(e, shortcuts.goToPreviousSibling)) {
        e.preventDefault(); handleGoToPreviousSibling()
      } else if (matchShortcut(e, shortcuts.goToNextSibling)) {
        e.preventDefault(); handleGoToNextSibling()
      } else if (matchShortcut(e, shortcuts.linkLastWord)) {
        e.preventDefault(); handleLinkLastWord()
      } else if (matchShortcut(e, shortcuts.showHelp)) {
        e.preventDefault(); setShowHelp(true)
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

  // Reset linker selection index when results change
  useEffect(() => { setLinkerSelIndex(0) }, [linkerMatches.length, pathChoices.length])

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

  // Keep the highlighted item in view for linker
  useEffect(() => {
    if (!showLinker) return
    const container = linkerResultsRef.current
    if (!container) return
    const items = Array.from(container.querySelectorAll<HTMLLIElement>('.list-item-click'))
    if (items.length === 0) return
    const idx = Math.min(Math.max(0, linkerSelIndex), items.length - 1)
    const el = items[idx]
    if (el && typeof (el as any).scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [showLinker, linkerSelIndex])

  function runCommand(cmdId: string) {
    switch (cmdId) {
      case 'settings': setShowSettings(true); setShowPalette(false); return
      case 'editObject': if (activeLocked) { toast('Object is locked', 'error'); return } setEditName(activeName); setShowEditObject(true); setShowPalette(false); return
      case 'newChild': setCatErr(null); setCatName(''); setCatDescription(''); setShowCat(true); setShowPalette(false); return
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
    //console.log('activeLocked', activeLocked)
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
    setIsLinkLastWordMode(false) // Reset flag for right-click linking
    setShowLinker(true)
    // preload objects for fuzzy
    const rows = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaign!.id)
    setAllObjects(rows || [])
    fuseRef.current = new Fuse(rows || [], { keys: ['name'], threshold: 0.4 })
    setLinkerMatches((rows || []).slice(0, 10))
  }, [campaign, ctxMenu.selText])

  const handleAddLinkOpenOnSelectedWord = useCallback(async () => {
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
    setLinkerInput(selectionRangeRef.current?.toString() || '')
    setShowLinker(true)
    const rows = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaign!.id)
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

  const handleMoveConfirm = useCallback(async () => {
    if (!selectedParent || moveItems.length === 0) return
    
    try {
      // Move each item to the selected parent
      for (const item of moveItems) {
        await window.ipcRenderer.invoke('gamedocs:move-object', item.id, selectedParent)
      }
      
      // Refresh the children list
      const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, activeId || root!.id)
      setChildren(kids)
      
      setShowMoveModal(false)
      toast('Items moved successfully', 'success')
    } catch (error: any) {
      console.error('Failed to move items:', error)
      const errorMessage = error?.message || 'Failed to move items'
      toast(errorMessage, 'error')
    }
  }, [selectedParent, moveItems, campaign, activeId, root])

  const handleMoveCancel = useCallback(() => {
    setShowMoveModal(false)
    setSelectedParent(null)
    setMoveItems([])
    setPossibleParents([])
    setParentSearchInput('')
    setFilteredParents([])
  }, [])

  const handleBulkMoveOpen = useCallback(async () => {
    // Get all objects for bulk move
    const allObjects = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaign!.id).catch(() => [])
    
    // Convert to the format we need with paths
    const objectsWithPaths = allObjects.map((obj: any) => ({
      id: obj.id,
      name: obj.name,
      path: obj.name, // For now, just use the name as the path
      parent_id: obj.parent_id
    }))
    
    setAllObjectsForBulk(objectsWithPaths)
    setFilteredBulkItems(objectsWithPaths)
    setSelectedItems(new Set())
    setBulkNameFilter('')
    setBulkParentFilter('')
    setIncludeDescendants(false)
    setShowBulkMoveModal(true)
  }, [campaign])

  const handleBulkMoveCancel = useCallback(() => {
    setShowBulkMoveModal(false)
    setSelectedItems(new Set())
    setBulkNameFilter('')
    setBulkParentFilter('')
    setIncludeDescendants(false)
    setAllObjectsForBulk([])
    setFilteredBulkItems([])
  }, [])

  const handleBulkMoveNext = useCallback(() => {
    if (selectedItems.size === 0) return
    
    // Get the selected items
    const selectedObjects = allObjectsForBulk.filter(obj => selectedItems.has(obj.id))
    
    // Close bulk modal and open move modal
    setShowBulkMoveModal(false)
    setMoveItems(selectedObjects.map(obj => ({ id: obj.id, name: obj.name, path: obj.path })))
    
    // Get possible parents (exclude all selected items and their descendants)
    const excludedIds = new Set<string>()
    
    // Build parent-child map
    const parentChildMap = new Map<string, string[]>()
    for (const obj of allObjectsForBulk) {
      if (obj.parent_id) {
        if (!parentChildMap.has(obj.parent_id)) {
          parentChildMap.set(obj.parent_id, [])
        }
        parentChildMap.get(obj.parent_id)!.push(obj.id)
      }
    }
    
    // Find all descendants of selected items
    const findAllDescendants = (itemId: string): string[] => {
      const descendants: string[] = []
      const children = parentChildMap.get(itemId) || []
      
      for (const childId of children) {
        descendants.push(childId)
        descendants.push(...findAllDescendants(childId))
      }
      
      return descendants
    }
    
    // Add all selected items and their descendants to excluded list
    for (const selectedId of selectedItems) {
      excludedIds.add(selectedId)
      const descendants = findAllDescendants(selectedId)
      descendants.forEach(descId => excludedIds.add(descId))
    }
    
    // Filter possible parents
    const possibleParents = allObjectsForBulk.filter(obj => !excludedIds.has(obj.id))
      .map(obj => ({ id: obj.id, name: obj.name, path: obj.path }))
    
    setPossibleParents(possibleParents)
    setFilteredParents(possibleParents)
    setSelectedParent(null)
    setParentSearchInput('')
    setShowMoveModal(true)
  }, [selectedItems, allObjectsForBulk])

  // Filter parents based on search input
  useEffect(() => {
    if (!parentSearchInput.trim()) {
      setFilteredParents(possibleParents)
    } else {
      const searchTerm = parentSearchInput.toLowerCase()
      const filtered = possibleParents.filter(parent => 
        parent.name.toLowerCase().includes(searchTerm) ||
        parent.path.toLowerCase().includes(searchTerm)
      )
      setFilteredParents(filtered)
    }
  }, [parentSearchInput, possibleParents])

  // Filter bulk items based on name and parent filters
  useEffect(() => {
    let filtered = allObjectsForBulk

    // Apply name filter
    if (bulkNameFilter.trim()) {
      const nameTerm = bulkNameFilter.toLowerCase()
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(nameTerm)
      )
    }

    // Apply parent filter
    if (bulkParentFilter.trim()) {
      const parentTerm = bulkParentFilter.toLowerCase()
      
      // Build parent-child map for hierarchy traversal
      const parentChildMap = new Map<string, string[]>()
      for (const obj of allObjectsForBulk) {
        if (obj.parent_id) {
          if (!parentChildMap.has(obj.parent_id)) {
            parentChildMap.set(obj.parent_id, [])
          }
          parentChildMap.get(obj.parent_id)!.push(obj.id)
        }
      }
      
      // Find all descendants of items matching the parent term
      const findAllDescendants = (itemId: string): string[] => {
        const descendants: string[] = []
        const children = parentChildMap.get(itemId) || []
        
        for (const childId of children) {
          descendants.push(childId)
          descendants.push(...findAllDescendants(childId))
        }
        
        return descendants
      }
      
      // Find items that match the parent term
      const matchingParents = allObjectsForBulk.filter(obj => 
        obj.name.toLowerCase().includes(parentTerm)
      )
      
      if (includeDescendants) {
        // Include all descendants of matching parents
        const allDescendantIds = new Set<string>()
        for (const parent of matchingParents) {
          const descendants = findAllDescendants(parent.id)
          descendants.forEach(descId => allDescendantIds.add(descId))
        }
        
        filtered = filtered.filter(item => allDescendantIds.has(item.id))
      } else {
        // Filter by direct parent only
        const matchingParentIds = new Set(matchingParents.map(p => p.id))
        filtered = filtered.filter(item => 
          item.parent_id && matchingParentIds.has(item.parent_id)
        )
      }
    }

    setFilteredBulkItems(filtered)
  }, [bulkNameFilter, bulkParentFilter, includeDescendants, allObjectsForBulk])

  const handleEditChildOpen = useCallback(() => {
    console.log('handleEditChildOpen', childCtxMenu)
    openEditForObject(childCtxMenu.selId, childCtxMenu.selText)
  }, [openEditForObject, childCtxMenu])

  const handleMoveChildOpen = useCallback(async () => {
    console.log('handleMoveChildOpen', childCtxMenu)
    
    // Get the item to move
    const itemToMove = await window.ipcRenderer.invoke('gamedocs:get-object', childCtxMenu.selId).catch(() => null)
    if (!itemToMove) return
    
    // Get all possible parent objects using the existing handler
    const allObjects = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaign!.id).catch(() => [])
    
    // Build a map of parent-child relationships to find descendants
    const parentChildMap = new Map<string, string[]>()
    for (const obj of allObjects) {
      if (obj.parent_id) {
        if (!parentChildMap.has(obj.parent_id)) {
          parentChildMap.set(obj.parent_id, [])
        }
        parentChildMap.get(obj.parent_id)!.push(obj.id)
      }
    }
    
    // Recursively find all descendants of the item being moved
    const findAllDescendants = (itemId: string): string[] => {
      const descendants: string[] = []
      const children = parentChildMap.get(itemId) || []
      
      for (const childId of children) {
        descendants.push(childId)
        descendants.push(...findAllDescendants(childId))
      }
      
      return descendants
    }
    
    const itemDescendants = findAllDescendants(childCtxMenu.selId)
    const excludedIds = new Set([childCtxMenu.selId, ...itemDescendants])
    
    // Filter out the item itself and all its descendants
    const possibleParents = allObjects.filter((obj: any) => {
      return !excludedIds.has(obj.id)
    }).map((obj: any) => ({
      id: obj.id,
      name: obj.name,
      path: obj.name // For now, just use the name as the path
    }))
    
    setMoveItems([{ id: itemToMove.id, name: itemToMove.name, path: itemToMove.name }])
    setPossibleParents(possibleParents)
    setFilteredParents(possibleParents)
    setSelectedParent(null)
    setParentSearchInput('')
    setShowMoveModal(true)
  }, [campaign, childCtxMenu])

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

  const handleClearLink = useCallback(async () => {
    const range = selectionRangeRef.current
    if (!range) { setCtxMenu(m => ({ ...m, visible: false })); return }
    let el: HTMLElement | null = (range.startContainer as any).parentElement
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { break }
      el = el.parentElement
    }
    if (el && editorRef.current) {
      const tagId = el.getAttribute('data-tag')
      if (tagId) {
        // Remove the link tag from the database (this will also clean up tag_links)
        try {
          await window.ipcRenderer.invoke('gamedocs:delete-link-tag', tagId)
        } catch (e) {
          console.warn('Failed to delete link tag from database:', e)
        }
      }
      
      // Remove the span element and replace with plain text
      const text = document.createTextNode(el.textContent || '')
      el.replaceWith(text)
      setDesc(htmlToDesc(editorRef.current))
      
      toast('Link cleared', 'success')
    }
    setCtxMenu(m => ({ ...m, visible: false }))
  }, [])

  // const handleLinkerInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  //   const v = e.target.value
  //   setLinkerInput(v)
  //   setPathChoices([])
  //   if (!v.trim()) { setLinkerMatches(allObjects.slice(0, 10)); return }
  //   const fuse = fuseRef.current
  //   if (fuse) {
  //     const res = fuse.search(v).map(r => r.item).slice(0, 10)
  //     setLinkerMatches(res)
  //   }
  // }, [allObjects])

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
    replaceSelectionWithSpan(linkerInput || pc.name, tid, isLinkLastWordMode)
    }
    setShowLinker(false)
  }, [campaign, linkerInput, linkerTagId, isLinkLastWordMode])

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
    replaceSelectionWithSpan(linkerInput || m.name, tid, isLinkLastWordMode)
    }
    setShowLinker(false)
  }, [campaign, linkerInput, linkerTagId, isLinkLastWordMode])

  // const handleWizardCreate = useCallback(async () => {
  //   const label = (wizardName || '').trim()
  //   if (!label) return
  //   const rootObj = await window.ipcRenderer.invoke('gamedocs:get-root', campaign!.id)
  //   const ownerId = activeId || rootObj.id
  //   const res = await window.ipcRenderer.invoke('gamedocs:create-object-and-link-tag', campaign!.id, activeId || rootObj.id, ownerId, label, (wizardType || null))
  //   setShowWizard(false)
  //   try {
  //     const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign!.id).catch(() => false)
  //     setHasPlaces(!!has)
  //   } catch {}
  //   replaceSelectionWithSpan(label, res.tagId)
  // }, [wizardName, wizardType, campaign, activeId])

  // const openAddChildModal = useCallback(() => {
  //   setCatErr(null)
  //   setCatName('')
  //   setCatDescription('')
  //   setShowCat(true)
  // }, [])

  const toSentenceCase = useCallback((str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }, [])

  const getProperShortcutName = useCallback((key: string) => {
    //Split the key by capital letters and join them with a space
    return key.split(/(?=[A-Z])/).map(s => toSentenceCase(s)).join(' ')
  }, [shortcuts])

  const getProperShortcutValue = useCallback((value: string) => {
    value = value.replace('ARROWUP', '↑')
    value = value.replace('ARROWDOWN', '↓')
    value = value.replace('ARROWLEFT', '←')
    value = value.replace('ARROWRIGHT', '→')
    let rx = /\+/g
    let matches = value.match(rx)
    if (matches) {
      value = value.replace(rx, ' + ')
    }
    return value
  }, [getProperShortcutName])

  // const handleParentClick = useCallback((e: React.MouseEvent) => {
  //   e.preventDefault()
  //   if (parent) selectObject(parent.id, parent.name)
  // }, [parent])

  // const handleMenuItemsClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  //   const target = e.target as HTMLElement
  //   const item = target.closest('[data-oid]') as HTMLElement | null
  //   if (!item) return
  //   const id = item.getAttribute('data-oid') || ''
  //   const name = item.getAttribute('data-oname') || ''
  //   if (id) selectObject(id, name)
  // }, [])

  //const handleCtxMenuLeave = useCallback(() => setCtxMenu(m => ({ ...m, visible: false })), [])

  // const handleCloseLinker = useCallback(() => setShowLinker(false), [])

  // const handlePathChoicesClick = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
  //   const el = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null
  //   if (!el) return
  //   const pc = { id: el.dataset.id!, name: el.dataset.name!, path: el.dataset.path! }
  //   handleSelectPathChoice(pc)
  // }, [handleSelectPathChoice])

  // const handleMatchesClick = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
  //   const el = (e.target as HTMLElement).closest('li[data-id]') as HTMLElement | null
  //   if (!el) return
  //   const m = { id: el.dataset.id!, name: el.dataset.name! }
  //   handleSelectMatch(m)
  // }, [handleSelectMatch])

  const handleShowChildContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>, id: string, name: string) => {
    console.log('handleShowChildContextMenu', id, name)
    e.preventDefault()
    e.stopPropagation()
    setChildCtxMenu(m => ({ ...m, visible: false }))
    setChildCtxMenu(m => ({ ...m, visible: true, selText: name, selId: id, x: e.clientX, y: e.clientY }))
  }, [])

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
    editorRef?.current?.focus()
    // move the caret to the end of the editor
    requestAnimationFrame(() => {
      if (editorRef.current) {
        const sel = window.getSelection()
        if (sel) {
          const range = document.createRange()
          // Find the last text node or element in the editor
          const walker = document.createTreeWalker(
            editorRef.current,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            null
          )
          let lastNode: Node = editorRef.current
          let node
          while (node = walker.nextNode()) {
            lastNode = node
          }
          
          // Position the range at the end of the last node
          if (lastNode.nodeType === Node.TEXT_NODE) {
            range.setStart(lastNode, lastNode.textContent?.length || 0)
          } else {
            range.selectNodeContents(lastNode)
            range.collapse(false) // false = collapse to end
          }
          
          range.collapse(true)
          sel.removeAllRanges()
          sel.addRange(range)
          selectionRangeRef.current = range
        }
      }
    })
  }

  const handleCreateChild = useCallback(async () => {
    let newChild = null;
    const name = (catName || '').trim()
    const description = (catDescription || '').trim()
    if (!name) { setCatErr('Name is required'); return }
    try {
      await window.ipcRenderer.invoke('gamedocs:create-category', campaign!.id, activeId || root!.id, name, catType, description)
      newChild = await window.ipcRenderer.invoke('gamedocs:get-latest-child', campaign!.id, activeId || root!.id) as { id: string; name: string }

      setCatDescription('')
      setCatName('')
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


    return newChild;

  }, [catName, catDescription, catType, campaign, activeId, root])

  const handleCreateChildAndEnter = useCallback(async () => {
    let newChild = await handleCreateChild()

    if (newChild) {
      selectObject(newChild.id, newChild.name)
    }
  }, [handleCreateChild])

  const handleDeleteChild = useCallback(async () => {
    const ok = await confirmDialog({ title: 'Delete', message: `Delete '${childCtxMenu.selText}' and all descendants?`, variant: 'yes-no' })
    if (!ok) return
    await window.ipcRenderer.invoke('gamedocs:delete-object-cascade', childCtxMenu.selId)
    setChildCtxMenu(m => ({ ...m, visible: false }))
    const kids = await window.ipcRenderer.invoke('gamedocs:list-children', campaign!.id, activeId || root!.id)
    setChildren(kids)
  }, [campaign, activeId, root, childCtxMenu.selId])

  // function insertAtSelection(text: string) {
  //   // For contentEditable, prefer replacing current Range; fallback to append
  //   const selRange = selectionRangeRef.current
  //   const el = editorRef.current
  //   if (el && selRange) {
  //     selRange.deleteContents()
  //     selRange.insertNode(document.createTextNode(text))
  //     const txt = el.innerText
  //     setDesc(txt)
  //     return
  //   }
  //   setDesc(prev => (prev ? prev + text : text))
  // }

  // function replaceSelectionWith(text: string) {
  //   const selRange = selectionRangeRef.current
  //   const el = editorRef.current
  //   if (el && selRange) {
  //     selRange.deleteContents()
  //     selRange.insertNode(document.createTextNode(text))
  //     const txt = el.innerText
  //     setDesc(txt)
  //     return
  //   }
  //   insertAtSelection(text)
  // }

  // removed erroneous function shadowing setAddPictureModal

  function replaceSelectionWithSpan(label: string, tagId: string, addSpaceAfter: boolean = false) {
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
      // Preserve scroll position before updating content
      const scrollTop = el.scrollTop
      
      selRange.deleteContents()
      selRange.insertNode(span)
      setDesc(htmlToDesc(el))
      
      // Restore scroll position after content update
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = scrollTop
        }
      })
      
      // Restore focus to editor and position cursor after the new link
      el.focus()

      if (addSpaceAfter) {
        // Create a text node with a space after the span to ensure cursor is outside the tag
        const textNode = document.createTextNode(' ')
        span.parentNode?.insertBefore(textNode, span.nextSibling)
        
        const newRange = document.createRange()
        newRange.setStart(textNode, 1) // Position after the space
        newRange.collapse(true)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(newRange)
          selectionRangeRef.current = newRange
        }
      } else {
        // Position cursor right after the span without adding extra space
        const newRange = document.createRange()
        newRange.setStartAfter(span)
        newRange.collapse(true)
        const selection = window.getSelection()
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(newRange)
          selectionRangeRef.current = newRange
        }
      }
      return
    }
    if (el) {
      // Preserve scroll position before updating content
      const scrollTop = el.scrollTop
      
      el.appendChild(span)
      setDesc(htmlToDesc(el))
      
      // Restore scroll position after content update
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = scrollTop
        }
      })
      
      // Restore focus to editor and position cursor after the new link
      el.focus()
      
      // Create a text node with a space after the span to ensure cursor is outside the tag
      const textNode = document.createTextNode(' ')
      span.parentNode?.insertBefore(textNode, span.nextSibling)
      
      const newRange = document.createRange()
      newRange.setStart(textNode, 1) // Position after the space
      newRange.collapse(true)
      const selection = window.getSelection()
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(newRange)
        selectionRangeRef.current = newRange
      }
    }
  }

  function moveCaretRight() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
  
    const range = sel.getRangeAt(0);
    const node = range.endContainer;
    const offset = range.endOffset;
  
    if (node.nodeType !== Node.TEXT_NODE) return;
    if (offset >= (node.textContent?.length || 0)) return;
  
    const newRange = document.createRange();
    newRange.setStart(node, offset + 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
  
  
  

  function hasNextCharOnSameLine() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
  
    const range = sel.getRangeAt(0);
    const node = range.endContainer;
    const offset = range.endOffset;
  
    if (node.nodeType !== Node.TEXT_NODE) return false;
  
    const textNode = node as Text;
    if (offset >= textNode.length) return false;
  
    // Current caret position
    const baseRange = range.cloneRange();
    baseRange.collapse(true);
    const baseRect = baseRange.getBoundingClientRect();
  
    // Range of next character
    const nextRange = range.cloneRange();
    nextRange.setStart(textNode, offset);
    nextRange.setEnd(textNode, offset + 1);
    const nextRect = nextRange.getBoundingClientRect();
  
    if (!baseRect || !nextRect) return false;
  
    // Different line if y changed noticeably or x "wrapped around"
    const yDiff = Math.abs(baseRect.top - nextRect.top);
    const wrapped = nextRect.left < baseRect.left - 2; // jumped back to start of line
  
    return yDiff < 1 && !wrapped;
  }
  
  

  function descToHtml(text: string): string {
    // Helper: render style tokens in plain text using classed spans. Supports [{italic|...}] initially.
    function renderStylesToHtml(input: string): string {
      const OPEN = '[{'
      const CLOSE = '}]'
      let i = 0
      const out: string[] = []

      function parseSegment(): string {
        const seg: string[] = []
        while (i < input.length) {
          // Handle escape of special sequences
          if (input[i] === '\\' && i + 1 < input.length) {
            seg.push(input[i + 1])
            i += 2
            continue
          }
          // Look for opening token '[{'
          if (input.startsWith(OPEN, i)) {
            i += OPEN.length
            // parse style name until first unescaped '|'
            let name = ''
            while (i < input.length && !(input[i] === '|' )) {
              if (input[i] === '\\' && i + 1 < input.length) { name += input[i + 1]; i += 2; continue }
              name += input[i++]
            }
            if (i >= input.length || input[i] !== '|') {
              // malformed, emit literally
              seg.push(OPEN + name)
              continue
            }
            i++ // skip '|'
            // parse inner content with nesting
            const innerStart = i
            let depth = 1
            const innerParts: string[] = []
            while (i < input.length) {
              if (input[i] === '\\' && i + 1 < input.length) {
                innerParts.push(input[i + 1])
                i += 2
                continue
              }
              if (input.startsWith(OPEN, i)) { depth++; innerParts.push(OPEN); i += OPEN.length; continue }
              if (input.startsWith(CLOSE, i)) { depth--; if (depth === 0) { i += CLOSE.length; break } innerParts.push(CLOSE); i += CLOSE.length; continue }
              innerParts.push(input[i++])
            }
            const innerRaw = innerParts.join('')
            const innerHtml = renderStylesToHtml(innerRaw)
            const styleName = name.trim().toLowerCase()
            const known = new Set(['bold','italic','underline','strike','code','redacted','h1','quote'])
            if (known.has(styleName)) {
              seg.push(`<span class="styleTag style-${styleName}">${innerHtml}</span>`)
            } else {
              // Unknown style: emit content without wrapper to avoid breaking
              seg.push(innerHtml)
            }
            continue
          }
          // normal char
          seg.push(input[i++])
        }
        return seg.join('')
      }

      out.push(parseSegment())
      return out.join('')
    }

    // Phase 1: protect tags with placeholders and collect them (scanner supports styles in label)
    const placeholders: Array<{ key: string; label: string; tag: string }> = []
    let phIndex = 0
    const src = String(text)
    let iScan = 0
    const protectedParts: string[] = []
    while (iScan < src.length) {
      if (src[iScan] === '\\' && iScan + 1 < src.length) { protectedParts.push(src[iScan + 1]); iScan += 2; continue }
      if (src.startsWith('[[', iScan)) {
        const start = iScan
        iScan += 2
        // parse label until '|' at styleDepth=0
        let styleDepth = 0
        let labelBuf: string[] = []
        let ok = false
        while (iScan < src.length) {
          if (src[iScan] === '\\' && iScan + 1 < src.length) { labelBuf.push(src[iScan + 1]); iScan += 2; continue }
          if (src.startsWith('[{', iScan)) { styleDepth++; labelBuf.push('[{'); iScan += 2; continue }
          if (src.startsWith('}]', iScan)) { if (styleDepth > 0) styleDepth--; labelBuf.push('}]'); iScan += 2; continue }
          if (src[iScan] === '|' && styleDepth === 0) { iScan++; ok = true; break }
          labelBuf.push(src[iScan++])
        }
        if (!ok) { // not a well-formed tag, emit literally
          protectedParts.push(src.substring(start, iScan))
          continue
        }
        // parse tag id until ']]'
        const tagStart = iScan
        const closeIdx = src.indexOf(']]', iScan)
        if (closeIdx === -1) {
          // no closing, emit literally
          protectedParts.push(src.substring(start))
          iScan = src.length
          continue
        }
        const tagId = src.substring(tagStart, closeIdx)
        iScan = closeIdx + 2
        const key = `\u0001TAG${phIndex++}\u0001`
        placeholders.push({ key, label: labelBuf.join(''), tag: tagId })
        protectedParts.push(key)
        continue
      }
      protectedParts.push(src[iScan++])
    }
    const protectedText = protectedParts.join('')

    // Phase 2: render style tokens outside of tags
    const withStyles = renderStylesToHtml(protectedText)

    // Phase 3: restore tags; also render styles inside tag labels now
    let restored = withStyles
    for (const ph of placeholders) {
      const safeLabelHtml = renderStylesToHtml(ph.label)
      const tagSpan = `<span data-tag="${ph.tag}" style="background: var(--pd-tag-bg, rgba(100,149,237,0.2)); border-bottom: 1px dotted var(--pd-tag-border, #6495ED); cursor: pointer;">${safeLabelHtml}</span>`
      restored = restored.split(ph.key).join(tagSpan)
    }

    // Preserve explicit newlines using <br>
    // First normalize line endings by removing \r, then convert \n to <br>
    const result = restored.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>')
    return result
  }

  function htmlToDesc(container: HTMLElement): string {
    // Convert spans back to token syntax and preserve line breaks
    const clone = container.cloneNode(true) as HTMLElement

    // First convert style spans into tokens, recursively serializing their contents
    const serializeNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return (node as Text).data
      if (node.nodeType !== Node.ELEMENT_NODE) return ''
      const el = node as HTMLElement
      if (el.tagName === 'BR') return '\n'
      if (el.tagName === 'DIV') {
        let s = ''
        // mimic existing behavior: newline before div content when there is a previous sibling
        if (el.previousSibling) s += '\n'
        el.childNodes.forEach((c) => { s += serializeNode(c) })
        return s
      }
      if (el.matches('span.styleTag')) {
        const inner = Array.from(el.childNodes).map(serializeNode).join('')
        // Skip empty style tags (no content or only whitespace)
        if (!inner || inner.trim().length === 0) {
          return inner // Return empty content without style token
        }
        const style = Array.from(el.classList).find(cls => cls.startsWith('style-'))
        if (style) {
          const token = style.replace('style-', '')
          const allowed = new Set(['bold','italic','underline','strike','code','redacted','h1','quote'])
          if (allowed.has(token)) return `[{${token}|${inner}}]`
        }
        return inner
      }
      if (el.matches('span[data-tag]')) {
        const label = Array.from(el.childNodes).map(serializeNode).join('')
        const tag = el.getAttribute('data-tag') || ''
        return `[[${label}|${tag}]]`
      }
      let s = ''
      el.childNodes.forEach((c) => { s += serializeNode(c) })
      return s
    }

    const raw = Array.from(clone.childNodes).map(serializeNode).join('')
    // Normalize Windows/Mac newlines to \n; do not alter other whitespace
    let result = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Remove empty style tokens: [{styleName|}]
    result = result.replace(/\[\{[^|]+\|\}\]/g, '')
    return result
  }

  async function handleGoToParent() {
    let parent = await window.ipcRenderer.invoke('gamedocs:get-parent', campaign!.id, activeId || root!.id) as { id: string; name: string }
    console.log('parent->' + JSON.stringify(parent))
    if (parent) selectObject(parent.id, parent.name)
  }
  function handleGoToPreviousSibling() {
    // TODO: Implement this
    //if (previousSibling) selectObject(previousSibling.id, previousSibling.name)
  }
  function handleGoToNextSibling() {
    // TODO: Implement this
    //if (nextSibling) selectObject(nextSibling.id, nextSibling.name)
  }
  function handleLinkLastWord() {
    console.log('handleLinkLastWord')
    const editor = editorRef.current
    if (!editor) return
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    // Get the current range and caret position
    const currentRange = selection.getRangeAt(0)
    const caretContainer = currentRange.startContainer
    const caretOffset = currentRange.startOffset
    
    // Find the text node containing the caret
    let textNode: Text | null = null
    if (caretContainer.nodeType === Node.TEXT_NODE) {
      textNode = caretContainer as Text
    } else {
      // If caret is in an element, find the text node at the offset
      const walker = document.createTreeWalker(
        caretContainer,
        NodeFilter.SHOW_TEXT,
        null
      )
      let node: Node | null = walker.nextNode()
      let currentOffset = 0
      
      while (node && currentOffset < caretOffset) {
        const nodeLength = node.textContent?.length || 0
        if (currentOffset + nodeLength >= caretOffset) {
          textNode = node as Text
          break
        }
        currentOffset += nodeLength
        node = walker.nextNode()
      }
    }
    
    if (!textNode || !textNode.textContent) return
    
    const text = textNode.textContent
    const textOffset = textNode === caretContainer ? caretOffset : (caretOffset - (textNode.textContent?.length || 0))
    
    // Find the start of the previous word
    let wordStart = textOffset
    while (wordStart > 0 && /[\w\p{L}\p{N}_]/u.test(text[wordStart - 1])) {
      wordStart--
    }
    
    // Find the end of the word (current position)
    let wordEnd = textOffset
    while (wordEnd < text.length && /[\w\p{L}\p{N}_]/u.test(text[wordEnd])) {
      wordEnd++
    }
    
    // If we found a word, select it
    if (wordStart < wordEnd) {
      const newRange = document.createRange()
      newRange.setStart(textNode, wordStart)
      newRange.setEnd(textNode, wordEnd)
      
      selection.removeAllRanges()
      selection.addRange(newRange)
      
      // Store the range for potential use
      selectionRangeRef.current = newRange

      setIsLinkLastWordMode(true)
      handleAddLinkOpenOnSelectedWord()
      
      console.log('Selected word:', text.substring(wordStart, wordEnd))
    }
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

  function createOverlayClickHandler(
    closeFn: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    let mouseDownOnOverlay = false
  
    return {
      onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
        mouseDownOnOverlay = e.target === e.currentTarget
      },
      onClick: (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation()
        if (mouseDownOnOverlay && e.target === e.currentTarget) {
          closeFn(false)
        }
      }
    }
  }

  function getIconForType(type: string) {
    switch (type) {
      case 'Place': return <span className="icon-container"><i className="ri-map-pin-2-line"></i></span>
      case 'Person': return <span className="icon-container"><i className="ri-user-line"></i></span>
      case 'Lore': return <span className="icon-container"><i className="ri-quill-pen-ai-line"></i></span>
      default:
      case 'Other': return <span className="icon-container"><i className="ri-route-line"></i></span>
    }
  }


  function handleBoldFormatting() {
    console.log('handleBoldFormatting')
    applyInlineStyle('bold')
  }

  function handleItalicFormatting(e: React.MouseEvent<HTMLDivElement>) {
    console.log('handleItalicFormatting')
    applyInlineStyle('italic')
  }

  // Generic helper to apply inline style by class name, keeping tags contiguous
  function applyInlineStyle(styleName: string, e?: React.MouseEvent<HTMLDivElement>) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    const editor = editorRef.current
    if (!editor) return
    const preserved = selectionRangeRef.current ? selectionRangeRef.current.cloneRange() : null
    const sel = window.getSelection()
    const liveRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    const range = preserved || liveRange
    if (!range || range.collapsed) return
    const makeRanges = (r: Range): Range[] => {
      const ranges: Range[] = []
      const root: Node = editor
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node: Node | null = walker.currentNode
      const cmpNodeOrder = (a: Node, b: Node): number => {
        if (a === b) return 0
        const pos = a.compareDocumentPosition(b)
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
      }
      while (node && cmpNodeOrder(node, r.startContainer) < 0) node = walker.nextNode()
      if (!node) return ranges
      const nodes: Text[] = []
      do {
        if (node.nodeType === Node.TEXT_NODE) nodes.push(node as Text)
        if (cmpNodeOrder(node, r.endContainer) > 0) break
        node = walker.nextNode()
      } while (node)
      for (const textNode of nodes) {
        const text = textNode.data
        if (!text || text.length === 0) continue
        let startOffset = 0
        let endOffset = text.length
        if (textNode === r.startContainer && typeof r.startOffset === 'number') startOffset = r.startOffset
        if (textNode === r.endContainer && typeof r.endOffset === 'number') endOffset = r.endOffset
        if (textNode !== r.startContainer && cmpNodeOrder(textNode, r.startContainer) < 0) continue
        if (textNode !== r.endContainer && cmpNodeOrder(textNode, r.endContainer) > 0) continue
        if (endOffset <= startOffset) continue
        const sub = document.createRange()
        sub.setStart(textNode, startOffset)
        sub.setEnd(textNode, endOffset)
        ranges.push(sub)
      }
      return ranges
    }
    const segments = makeRanges(range)
    
    // Helper: check if two ranges are adjacent (only separated by BR or whitespace)
    const areAdjacent = (r1: Range, r2: Range): boolean => {
      const r1End = r1.cloneRange()
      r1End.collapse(false)
      const r2Start = r2.cloneRange()
      r2Start.collapse(true)
      
      const between = document.createRange()
      between.setStart(r1End.endContainer, r1End.endOffset)
      between.setEnd(r2Start.startContainer, r2Start.startOffset)
      
      // Check if between range only contains BR elements or whitespace
      const contents = between.cloneContents()
      for (let node = contents.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
          continue // BR is allowed
        }
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node as Text).data
          if (text.trim().length === 0) continue // Whitespace only is allowed
        }
        return false // Found something other than BR or whitespace
      }
      return true
    }
    
    // Merge adjacent segments (that are only separated by BR elements)
    const mergedSegments: Range[] = []
    for (let i = 0; i < segments.length; i++) {
      if (mergedSegments.length === 0) {
        mergedSegments.push(segments[i])
      } else {
        const lastMerged = mergedSegments[mergedSegments.length - 1]
        if (areAdjacent(lastMerged, segments[i])) {
          // Extend the last merged range to include this segment
          lastMerged.setEnd(segments[i].endContainer, segments[i].endOffset)
        } else {
          // Not adjacent, start a new merged segment
          mergedSegments.push(segments[i])
        }
      }
    }
    
    // Apply style wrappers from end to start to preserve offsets
    for (let i = mergedSegments.length - 1; i >= 0; i--) {
      const seg = mergedSegments[i]
      const wrapper = document.createElement('span')
      wrapper.className = `styleTag style-${styleName}`
      const contents = seg.extractContents()
      wrapper.appendChild(contents)
      seg.insertNode(wrapper)
    }
    const newRange = document.createRange()
    newRange.setStart(range.endContainer, range.endOffset)
    newRange.collapse(true)
    if (sel) { sel.removeAllRanges(); sel.addRange(newRange) }
    setCtxMenu(m => ({ ...m, visible: false }))
    setDesc(htmlToDesc(editor))
  }

  function handleUnderlineFormatting() {
    console.log('handleUnderlineFormatting')
    applyInlineStyle('underline')
  }

  function handleHeadingFormatting() {
    console.log('handleHeadingFormatting')
    applyInlineStyle('h1')
  }

  function handleCodeFormatting() {
    console.log('handleCodeFormatting')
    applyInlineStyle('code')
  }

  function handleRedactedFormatting() {
    console.log('handleRedactedFormatting')
    applyInlineStyle('redacted')
  }

  function handleStrikethroughFormatting() {
    console.log('handleStrikethroughFormatting')
    applyInlineStyle('strike')
  }

  function handleQuoteFormatting() {
    console.log('handleQuoteFormatting')
    applyInlineStyle('quote')
  }

  function handleClearFormatting(e?: React.MouseEvent<HTMLDivElement>) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    const editor = editorRef.current
    if (!editor) return
    const preserved = selectionRangeRef.current ? selectionRangeRef.current.cloneRange() : null
    const sel = window.getSelection()
    const liveRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    const range = preserved || liveRange
    if (!range || range.collapsed) return

    // Helper: check if an element's content is fully contained within a range
    const isFullyContained = (el: HTMLElement, r: Range): boolean => {
      const elRange = document.createRange()
      elRange.selectNodeContents(el)
      // Check if selection fully contains all content of the element
      return r.compareBoundaryPoints(Range.START_TO_START, elRange) <= 0 &&
             r.compareBoundaryPoints(Range.END_TO_END, elRange) >= 0
    }

    // Helper: check if an element intersects (partially or fully) with a range
    const intersectsRange = (el: HTMLElement, r: Range): boolean => {
      const elRange = document.createRange()
      elRange.selectNodeContents(el)
      return r.compareBoundaryPoints(Range.START_TO_END, elRange) > 0 &&
             r.compareBoundaryPoints(Range.END_TO_START, elRange) < 0
    }

    // Helper: recursively unwrap all nested style spans within a given range
    const unwrapNestedStylesInRange = (container: Node, r: Range): void => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
      const toUnwrap: HTMLElement[] = []
      let node: Node | null = walker.firstChild()
      
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement
          if (el.matches('span.styleTag')) {
            const elRange = document.createRange()
            elRange.selectNodeContents(el)
            // Check if this nested style is fully within the selection range
            if (r.compareBoundaryPoints(Range.START_TO_START, elRange) <= 0 &&
                r.compareBoundaryPoints(Range.END_TO_END, elRange) >= 0) {
              toUnwrap.push(el)
            }
          }
        }
        node = walker.nextNode()
      }
      
      // Unwrap from deepest to shallowest
      toUnwrap.sort((a, b) => {
        const aRange = document.createRange()
        aRange.selectNodeContents(a)
        const bRange = document.createRange()
        bRange.selectNodeContents(b)
        if (aRange.compareBoundaryPoints(Range.START_TO_START, bRange) >= 0 &&
            aRange.compareBoundaryPoints(Range.END_TO_END, bRange) <= 0) {
          return -1 // a is inside b, process a first
        }
        if (bRange.compareBoundaryPoints(Range.START_TO_START, aRange) >= 0 &&
            bRange.compareBoundaryPoints(Range.END_TO_END, aRange) <= 0) {
          return 1 // b is inside a, process b first
        }
        return 0
      })
      
      for (const nestedSpan of toUnwrap) {
        const nestedParent = nestedSpan.parentNode
        if (!nestedParent) continue
        while (nestedSpan.firstChild) {
          nestedParent.insertBefore(nestedSpan.firstChild, nestedSpan)
        }
        nestedParent.removeChild(nestedSpan)
      }
    }

    // Helper: unwrap a style span, keeping its children, and unwrap any nested styles in selection
    const unwrapStyleSpan = (span: HTMLElement): void => {
      const parent = span.parentNode
      if (!parent) return
      
      // First unwrap any nested style spans that are fully within the selection
      unwrapNestedStylesInRange(span, range)
      
      // Then unwrap this span itself
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span)
      }
      parent.removeChild(span)
    }

    // Helper: split a style span at selection boundaries
    const splitStyleSpan = (span: HTMLElement, r: Range): void => {
      const parent = span.parentNode
      if (!parent) return
      const spanRange = document.createRange()
      spanRange.selectNodeContents(span)
      
      // Create ranges for before, selected, and after parts
      const beforeRange = document.createRange()
      const selectedRange = document.createRange()
      const afterRange = document.createRange()

      const rStart = r.cloneRange()
      rStart.collapse(true)
      const rEnd = r.cloneRange()
      rEnd.collapse(false)
      
      const spanStart = spanRange.cloneRange()
      spanStart.collapse(true)
      const spanEnd = spanRange.cloneRange()
      spanEnd.collapse(false)

      // Determine boundaries
      const startBefore = r.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0
      const endAfter = r.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0

      if (!startBefore) {
        // Selection starts inside span - create before part
        beforeRange.setStart(spanRange.startContainer, spanRange.startOffset)
        beforeRange.setEnd(r.startContainer, r.startOffset)
      }

      if (!endAfter) {
        // Selection ends inside span - create after part
        afterRange.setStart(r.endContainer, r.endOffset)
        afterRange.setEnd(spanRange.endContainer, spanRange.endOffset)
      }

      // Selected part (may span full element or part)
      selectedRange.setStart(
        startBefore ? spanRange.startContainer : r.startContainer,
        startBefore ? spanRange.startOffset : r.startOffset
      )
      selectedRange.setEnd(
        endAfter ? spanRange.endContainer : r.endContainer,
        endAfter ? spanRange.endOffset : r.endOffset
      )

      // Extract contents
      const beforeContent = beforeRange.collapsed ? null : beforeRange.extractContents()
      const selectedContent = selectedRange.extractContents()
      const afterContent = afterRange.collapsed ? null : afterRange.extractContents()

      // Helper: unwrap all style spans from a DocumentFragment
      const unwrapStylesInFragment = (frag: DocumentFragment): void => {
        const styleSpans = Array.from(frag.querySelectorAll('span.styleTag')) as HTMLElement[]
        // Sort from innermost to outermost
        styleSpans.sort((a, b) => {
          const aRange = document.createRange()
          aRange.selectNodeContents(a)
          const bRange = document.createRange()
          bRange.selectNodeContents(b)
          if (aRange.compareBoundaryPoints(Range.START_TO_START, bRange) >= 0 &&
              aRange.compareBoundaryPoints(Range.END_TO_END, bRange) <= 0) {
            return -1 // a is inside b
          }
          if (bRange.compareBoundaryPoints(Range.START_TO_START, aRange) >= 0 &&
              bRange.compareBoundaryPoints(Range.END_TO_END, aRange) <= 0) {
            return 1 // b is inside a
          }
          return 0
        })
        for (const styleSpan of styleSpans) {
          const styleParent = styleSpan.parentNode
          if (!styleParent) continue
          while (styleSpan.firstChild) {
            styleParent.insertBefore(styleSpan.firstChild, styleSpan)
          }
          styleParent.removeChild(styleSpan)
        }
      }

      // Unwrap all nested styles from the selected content (it will be plain text)
      if (selectedContent) {
        unwrapStylesInFragment(selectedContent)
      }

      // Remove original span
      const nextSibling = span.nextSibling
      parent.removeChild(span)

      // Helper: check if a DocumentFragment has actual text content
      const hasTextContent = (frag: DocumentFragment | null): boolean => {
        if (!frag || frag.childNodes.length === 0) return false
        const text = frag.textContent || ''
        return text.trim().length > 0 || text.length > 0
      }

      // Track insertion point
      let currentInsertPoint: Node | null = nextSibling

      // Insert before part (styled) if exists and has content
      if (beforeContent && hasTextContent(beforeContent)) {
        const beforeSpan = span.cloneNode(false) as HTMLElement
        while (beforeContent.firstChild) {
          beforeSpan.appendChild(beforeContent.firstChild)
        }
        parent.insertBefore(beforeSpan, currentInsertPoint)
        currentInsertPoint = beforeSpan.nextSibling
      }

      // Insert selected part (plain) if has content
      if (selectedContent && hasTextContent(selectedContent)) {
        const fragment = document.createDocumentFragment()
        while (selectedContent.firstChild) {
          fragment.appendChild(selectedContent.firstChild)
        }
        if (currentInsertPoint) {
          parent.insertBefore(fragment, currentInsertPoint)
        } else {
          parent.appendChild(fragment)
        }
        // Update insert point after the fragment
        if (fragment.lastChild) {
          currentInsertPoint = fragment.lastChild.nextSibling
        }
      }

      // Insert after part (styled) if exists and has content
      if (afterContent && hasTextContent(afterContent)) {
        const afterSpan = span.cloneNode(false) as HTMLElement
        while (afterContent.firstChild) {
          afterSpan.appendChild(afterContent.firstChild)
        }
        if (currentInsertPoint) {
          parent.insertBefore(afterSpan, currentInsertPoint)
        } else {
          parent.appendChild(afterSpan)
        }
      }
    }

    // Find all style spans that intersect with the selection
    const allStyleSpans = Array.from(editor.querySelectorAll('span.styleTag')) as HTMLElement[]
    const intersectingSpans: HTMLElement[] = []

    for (const span of allStyleSpans) {
      if (intersectsRange(span, range)) {
        intersectingSpans.push(span)
      }
    }

    // Sort from innermost to outermost (process nested styles correctly)
    intersectingSpans.sort((a, b) => {
      const aRange = document.createRange()
      aRange.selectNodeContents(a)
      const bRange = document.createRange()
      bRange.selectNodeContents(b)
      // If a is contained in b, a comes first (process inner first)
      if (aRange.compareBoundaryPoints(Range.START_TO_START, bRange) >= 0 &&
          aRange.compareBoundaryPoints(Range.END_TO_END, bRange) <= 0) {
        return -1
      }
      if (bRange.compareBoundaryPoints(Range.START_TO_START, aRange) >= 0 &&
          bRange.compareBoundaryPoints(Range.END_TO_END, aRange) <= 0) {
        return 1
      }
      return 0
    })

    // Process each span
    for (const span of intersectingSpans) {
      if (!span.parentNode) continue // already removed by previous operation
      if (isFullyContained(span, range)) {
        unwrapStyleSpan(span)
      } else {
        splitStyleSpan(span, range)
      }
    }

    // Normalize adjacent text nodes: merge sibling text nodes into contiguous ones
    // Use DOM's built-in normalize() which merges adjacent text nodes
    editor.normalize()

    // Update caret and persist
    const newRange = document.createRange()
    newRange.setStart(range.endContainer, range.endOffset)
    newRange.collapse(true)
    if (sel) { sel.removeAllRanges(); sel.addRange(newRange) }
    setCtxMenu(m => ({ ...m, visible: false }))
    setDesc(htmlToDesc(editor))
  }
















 // ================================================ //


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
            setChildCtxMenu(m => ({ ...m, visible: false }))
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
                { id: '__HELP__', name: 'Help', path: '' },
                { id: '__SEPARATOR_TOP__', name: '', path: '' },
                { id: '__ADDPICTURE__', name: 'Add picture', path: '' },
              ]
              if (!activeLocked) items.push({ id: '__EDITOBJECT__', name: 'Edit object', path: '' })
              items.push({ id: activeLocked ? '__UNLOCK__' : '__LOCK__', name: activeLocked ? 'Unlock object' : 'Lock object', path: '' })
              items.push({ id: '__SEPARATOR_MIDDLE__', name: '', path: '' })
              items.push({ id: '__MISC_STUFF__', name: 'Misc stuff', path: '' })
              items.push({ id: '__BULK_MOVE_ITEMS__', name: 'Bulk move items', path: '' })
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
        if (childCtxMenu.visible && childCtxMenuRef.current && !childCtxMenuRef.current.contains(target)) {
          setChildCtxMenu(m => ({ ...m, visible: false }))
        }
        if (tagMenu.visible && tagMenuRef.current && !tagMenuRef.current.contains(target)) {
          setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
        }
      }}>
        {/* Sidebar */}
        <div className="sidebar" style={{ width: `${sidebarWidth}px` }}>
          <div className="sidebar-title"></div>
          {root && (
            <div>
              {parent && parent.id && parent.id !== activeId && (
                <a className="jump-to-parent" onClick={(e) => { e.preventDefault(); selectObject(parent.id, parent.name) }}><span className="nowrap">parent <i className="ri-arrow-up-circle-line"></i></span></a>
              )}
              <div className="header_line">{activeName || root.name}</div>
              <a className="add-child" onClick={() => { setCatErr(null); setCatName(''); setCatDescription(''); setShowCat(true) }}>Add Child <i className="ri-add-circle-line"></i></a>
              <div className="divider-line"></div>
              <div 
                className="menu_items_container" 
                style={{ height: getHeight() }}
                onMouseDown={(e) => {
                  //console.log('🖱️ MouseDown on container', e.target)
                  const target = e.target as HTMLElement
                  const childItem = target.closest('.child-item') as HTMLElement
                  //console.log('🎯 Found child item:', childItem)
                  if (childItem) {
                    const childId = childItem.getAttribute('data-child-id')
                    //console.log('🆔 Child ID:', childId)
                    if (childId) {
                      const state = childItemMouseStateRef.current.get(childId) || { mouseDownOnItem: false, hasMoved: false, startX: 0, startY: 0, startItemId: '' }
                      //console.log('📊 Previous state:', state)
                      state.mouseDownOnItem = true
                      state.hasMoved = false
                      state.startX = e.clientX
                      state.startY = e.clientY
                      state.startItemId = childId
                      childItemMouseStateRef.current.set(childId, state)
                      //console.log('✅ Set new state:', state, 'start position:', e.clientX, e.clientY, 'start item:', childId)
                    }
                  }
                }}
                onMouseMove={(e) => {
                  const target = e.target as HTMLElement
                  const childItem = target.closest('.child-item') as HTMLElement
                  if (childItem) {
                    const childId = childItem.getAttribute('data-child-id')
                    if (childId) {
                      const state = childItemMouseStateRef.current.get(childId)
                      if (state && state.mouseDownOnItem) {
                        const deltaX = Math.abs(e.clientX - state.startX)
                        const deltaY = Math.abs(e.clientY - state.startY)
                        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
                        
                        // Only consider it a drag if moved more than 5 pixels
                        if (distance > 5) {
                          //console.log('🚀 Mouse moved significantly - marking as dragged for:', childId, 'distance:', distance.toFixed(1))
                          state.hasMoved = true
                        }
                      }
                    }
                  }
                }}
                onMouseUp={(e) => {
                  //console.log('🖱️ MouseUp on container', e.target, 'button:', e.button)
                  const target = e.target as HTMLElement
                  const childItem = target.closest('.child-item') as HTMLElement
                  //console.log('🎯 Found child item:', childItem)
                  if (childItem) {
                    const childId = childItem.getAttribute('data-child-id')
                    //console.log('🆔 Child ID:', childId)
                    if (childId) {
                      const state = childItemMouseStateRef.current.get(childId)
                      //console.log('📊 Current state:', state)
                      
                      // Check if mouse down and mouse up happened on the same item
                      const sameItem = state && state.startItemId === childId
                      //console.log('🔍 Same item check:', sameItem, 'start:', state?.startItemId, 'end:', childId)
                      
                      if (state && state.mouseDownOnItem && sameItem) {
                        //console.log('🎉 CLICK DETECTED! Executing action for:', childId)
                        if(e.button == 0){ 
                          //console.log('👆 Left click - selecting object')
                          selectObject(childId, childItem.textContent || '') 
                        } else if(e.button == 2){ 
                          //console.log('👆 Right click - showing context menu')
                          handleShowChildContextMenu(e, childId, childItem.textContent || '') 
                        }
                      } else {
                        //console.log('❌ Click ignored - mouseDownOnItem:', state?.mouseDownOnItem, 'sameItem:', sameItem)
                      }
                      if (state) {
                        //console.log('🔄 Resetting state for:', childId)
                        state.mouseDownOnItem = false
                        state.hasMoved = false
                        state.startItemId = ''
                      }
                    }
                  }
                }}
              >
                {children.map(c => {
                  //console.log('🔄 Rendering child item:', c.id, c.name)
                  return (
                    <div 
                      key={c.id} 
                      className="child-item"
                      data-child-id={c.id}
                    >
                      {getIconForType(c.type)}{c.name}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Main panel: interactive editor (root description for now) */}
        <div className="editor_container" style={{ position: 'relative', marginLeft: `${sidebarWidth - 180}px` }}>
          {activeLocked && (<div className="lock-badge" title="Locked"><i className="ri-lock-2-fill"></i></div>)}
          <div
            ref={editorRef}
            contentEditable={!activeLocked}
            suppressContentEditableWarning
            onInput={handleEditorInput}
            onContextMenu={handleEditorContextMenu}
            onMouseMove={(e) => {
              const target = e.target as HTMLElement
              const span = target && (target.closest && target.closest('span[data-tag]')) as HTMLElement | null
              if (!span) {
                lastHoverTagRef.current = null
                if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                // Clear any pending debounce timeout
                if (hoverDebounceTimeoutRef.current) {
                  clearTimeout(hoverDebounceTimeoutRef.current)
                  hoverDebounceTimeoutRef.current = null
                }
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
              
              // Clear any existing timeout
              if (hoverDebounceTimeoutRef.current) {
                clearTimeout(hoverDebounceTimeoutRef.current)
              }
              
              // Set new debounced timeout
              hoverDebounceTimeoutRef.current = setTimeout(async () => {
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
              }, hoverDebounce)
            }}
            onMouseLeave={() => { 
              if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
              // Clear any pending debounce timeout
              if (hoverDebounceTimeoutRef.current) {
                clearTimeout(hoverDebounceTimeoutRef.current)
                hoverDebounceTimeoutRef.current = null
              }
            }}
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
              // Handle Enter key with indentation preservation
              if (e.key === 'Enter') {
                e.preventDefault()
                const sel = window.getSelection()
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0)
                  console.log('ENTER_DBG start', { rangeCollapsed: range.collapsed, scType: range.startContainer.nodeType, so: range.startOffset, ecType: range.endContainer.nodeType, eo: range.endOffset })
                  
                  // Compute leading indentation for the current visual line using DOM (<br>-aware)
                  const computeLeadingIndent = (): string => {
                    const root = editorRef.current!
                    // Walk backwards from caret to previous <br>
                    const back = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
                    back.currentNode = range.startContainer
                    let prevBreak: Node | null = null
                    while (back.currentNode && back.currentNode !== root) {
                      if ((back.currentNode as HTMLElement).tagName === 'BR') { prevBreak = back.currentNode; break }
                      const prev = back.previousNode()
                      if (!prev) break
                    }
                    // Start scanning forward after the <br> (or root start) to accumulate whitespace
                    const fwd = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
                    fwd.currentNode = (prevBreak && prevBreak.nextSibling) ? prevBreak.nextSibling : (root.firstChild || root)
                    const buf: string[] = []
                    // Advance to the first text node if current is not a text node
                    if (!fwd.currentNode || fwd.currentNode.nodeType !== Node.TEXT_NODE) {
                      let advanced: Node | null
                      while ((advanced = fwd.nextNode())) {
                        if (fwd.currentNode && fwd.currentNode.nodeType === Node.TEXT_NODE) break
                      }
                      if (!fwd.currentNode || fwd.currentNode.nodeType !== Node.TEXT_NODE) {
                        return buf.join('')
                      }
                    }
                    // Helper to know if we have reached the caret position
                    const reachedCaret = (node: Node): boolean => {
                      if (node === range.startContainer) return true
                      const pos = node.compareDocumentPosition(range.startContainer)
                      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) === 0 && node !== root
                    }
                    while (fwd.currentNode && fwd.currentNode.nodeType === Node.TEXT_NODE) {
                      const tn = fwd.currentNode as Text
                      const data = tn.data || ''
                      for (let i = 0; i < data.length; i++) {
                        if (tn === range.startContainer && i >= range.startOffset) return buf.join('')
                        const ch = data[i]
                        // if (ch === ' ' || ch === '\t') buf.push(ch)
                        // else return buf.join('')
                        if (ch === ' ' || ch === '\t') buf.push(ch)
                        else if (ch === '\u00A0') continue
                        else return buf.join('')
                      }
                      const n = fwd.nextNode()
                      if (!n) break
                      if (reachedCaret(n)) return buf.join('')
                      // Ensure we are on a text node for the next iteration
                      while (fwd.currentNode && fwd.currentNode.nodeType !== Node.TEXT_NODE) {
                        const step = fwd.nextNode()
                        if (!step) break
                      }
                    }
                    return buf.join('')
                  }
                  const whitespace = computeLeadingIndent()
                  console.log('ENTER_DBG indent', { whitespaceLen: whitespace.length })
                  
                  // Insert a visible line break and then indentation as text
                  range.deleteContents()
                  const br = document.createElement('br')
                  range.insertNode(br)
                  let caretAnchor: Node = br
                  if (whitespace && whitespace.length > 0) {
                    const ws = document.createTextNode(whitespace)
                    if (br.nextSibling) {
                      br.parentNode?.insertBefore(ws, br.nextSibling)
                    } else {
                      br.parentNode?.appendChild(ws)
                    }
                    caretAnchor = ws

                  } else {
                    // create a text node with a non-breaking space so caret can sit in it
                    const empty = document.createTextNode('\u00A0')
                    if (br.nextSibling) br.parentNode?.insertBefore(empty, br.nextSibling)
                    else br.parentNode?.appendChild(empty)
                    caretAnchor = empty
                  
                    // Put caret *before* the NBSP (offset 0) so typed characters come before it
                    const newRange = document.createRange()
                    newRange.setStart(empty, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                  
                    // Handler that cleans up the NBSP once the user types (or finishes an IME composition)
                    const cleanupNbsp = (event: Event) => {
                      try {
                        // If node is gone already, nothing to do
                        if (!empty.parentNode) {
                          editorRef.current?.removeEventListener('input', cleanupNbsp)
                          editorRef.current?.removeEventListener('compositionend', cleanupNbsp)
                          return
                        }
                  
                        // Record current selection offset so we can restore caret position after modifying node
                        const s = window.getSelection()
                        let caretOffset = 0
                        if (s && s.rangeCount) {
                          const r = s.getRangeAt(0)
                          if (r.startContainer === empty) caretOffset = r.startOffset
                          else caretOffset = empty.length // typed elsewhere; put caret at end of this node
                        }
                  
                        // Remove the NBSP characters (there should usually be only the leading one)
                        if (empty.data.includes('\u00A0')) {
                          empty.data = empty.data.replace(/\u00A0/g, '')
                        }
                  
                        // Clamp caretOffset to the new node length, then restore selection inside `empty`
                        const restore = document.createRange()
                        const newOffset = Math.max(0, Math.min(empty.length, caretOffset))
                        restore.setStart(empty, newOffset)
                        restore.collapse(true)
                        s?.removeAllRanges()
                        s?.addRange(restore)
                      } finally {
                        // detach listeners after first cleanup
                        editorRef.current?.removeEventListener('input', cleanupNbsp)
                        editorRef.current?.removeEventListener('compositionend', cleanupNbsp)
                      }
                    }
                  
                    // Attach listeners: input for normal typing, compositionend for IME input
                    editorRef.current?.addEventListener('input', cleanupNbsp)
                    editorRef.current?.addEventListener('compositionend', cleanupNbsp)
                  }

                  console.log('ENTER_DBG inserted', { hasWs: whitespace.length > 0, brParentTag: (br.parentElement && br.parentElement.tagName) || null })
                  // Move caret after the indentation (or after <br> if no indentation)
                  const newRange = document.createRange()
                  newRange.setStartAfter(caretAnchor)
                  newRange.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(newRange)
                  console.log('ENTER_DBG caretSet', { anchorType: newRange.startContainer.nodeType, anchorOffset: newRange.startOffset })
                  // Defer state update so the caret visually settles first
                  setTimeout(() => {
                    if (editorRef.current) setDesc(htmlToDesc(editorRef.current))
                  }, 0)
                }
                
                // Ensure we scroll an element, not a text node
                const cont = editorRef.current
                if (cont) {
                  const lastEl = cont.lastElementChild as HTMLElement | null
                  if (lastEl && typeof (lastEl as any).scrollIntoView === 'function') {
                    console.log('ENTER_DBG scroll target', { tag: lastEl.tagName })
                    lastEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
                  } else {
                    console.log('ENTER_DBG scroll fallback', { hasLastEl: !!lastEl })
                    cont.scrollTop = cont.scrollHeight
                  }
                }

                // 🧹 Remove NBSPs on previous lines only
                
                window.setTimeout(() => {
                  const editor = editorRef.current
                  if (editor) {
                    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
                    const nbspNodes: Text[] = []

                    while (walker.nextNode()) {
                      const n = walker.currentNode as Text
                      if (n.nodeValue === '\u00A0') {
                        nbspNodes.push(n)
                      }
                    }

                    // Remove all but the last NBSP
                    for (let i = 0; i < nbspNodes.length - 1; i++) {
                      nbspNodes[i].remove()
                    }
                  }
                }, 100);
                

                
                
                return
              }

              if (e.key === 'Backspace') {
                const sel = window.getSelection()
                if (!sel || sel.rangeCount === 0) return
                const range = sel.getRangeAt(0)
                const node = range.startContainer
              
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const childNodes = Array.from(node.childNodes)
                  const offset = range.startOffset
                  const prevNode = childNodes[offset - 1]
              
                  if (prevNode && prevNode.nodeType === Node.TEXT_NODE && prevNode.nodeValue === '\u00A0') {
                    e.preventDefault()
              
                    let brToRemove: ChildNode | null = null
              
                    // Find a <br> immediately before the NBSP (but NOT if there’s another <br> before that)
                    let prev = prevNode.previousSibling
                    while (prev && prev.nodeType === Node.TEXT_NODE && !(prev.nodeValue || '').trim()) {
                      prev = prev.previousSibling
                    }
                    if (prev && prev.nodeName === 'BR') {
                      // Only remove if the *previous* sibling isn't another <br>
                      const beforePrev = prev.previousSibling
                      if (!beforePrev || beforePrev.nodeName !== 'BR') {
                        brToRemove = prev
                      }
                    }
              
                    prevNode.remove() // remove the nbsp
                    if (brToRemove) brToRemove.remove()
              
                    // Move caret to end of previous text node
                    const newSel = window.getSelection()
                    const newRange = document.createRange()
              
                    let caretTarget: ChildNode | null =
                      (brToRemove && brToRemove.previousSibling) || node.lastChild
              
                    while (caretTarget && caretTarget.nodeType !== Node.TEXT_NODE) {
                      if (caretTarget.lastChild) caretTarget = caretTarget.lastChild
                      else caretTarget = caretTarget.previousSibling
                    }
              
                    if (caretTarget && caretTarget.nodeType === Node.TEXT_NODE) {
                      newRange.setStart(caretTarget, caretTarget.textContent?.length || 0)
                    } else {
                      newRange.selectNodeContents(node)
                      newRange.collapse(false)
                    }
              
                    newSel?.removeAllRanges()
                    newSel?.addRange(newRange)
                    return
                  }
                }
              }
              
              
              
              // Insert literal tab characters in the content
              if (e.key === 'Tab') {
                e.preventDefault()

                const editor = editorRef.current
                if (editor) {
                  const children = Array.from(editor.childNodes)
                  for (const node of children) {
                    if (node.nodeType === Node.TEXT_NODE && node.nodeValue === '\u00A0') {
                      node.remove()
                    }
                  }
                }

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
            className={images.length > 0 ? 'editor_content_with_images' : 'editor_content'}
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
          {childCtxMenu.visible && (
            <div className="ctx-menu" style={{ left: childCtxMenu.x, top: childCtxMenu.y }} ref={childCtxMenuRef}>
              <div className="ctx-menu-section-title">{childCtxMenu.selText}</div>
              <div className="separator" />
              {/* <div className="ctx-menu-item" onClick={handleCreateChildAndEnter}>Create Child</div> */}
              <div className="ctx-menu-item" onClick={handleDeleteChild}>Delete Child</div>
              <div className="ctx-menu-item" onClick={(e)=>{ handleEditChildOpen(); setChildCtxMenu(m => ({ ...m, visible: false })); }}>Edit Child</div>
              <div className="ctx-menu-item" onClick={(e)=>{ handleMoveChildOpen(); setChildCtxMenu(m => ({ ...m, visible: false })); }}>Move Child</div>
            </div>

          )}
          {ctxMenu.visible && (
            <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} ref={ctxMenuRef}>
              <div className="ctx-menu-formatting-section">
                <div className="ctx-menu-item formatting-item" title='Bold' onClick={handleBoldFormatting}><i className="ri-bold"></i></div>
                <div className="ctx-menu-item formatting-item" title='Italic' onClick={handleItalicFormatting}><i className="ri-italic"></i></div>
                <div className="ctx-menu-item formatting-item" title='Underline' onClick={handleUnderlineFormatting}><i className="ri-underline"></i></div>
                <div className="ctx-menu-item formatting-item" title='Strikethrough' onClick={handleStrikethroughFormatting}><i className="ri-strikethrough"></i></div>
                <div className="ctx-menu-item formatting-item" title='Heading' onClick={handleHeadingFormatting}><i className="ri-heading"></i></div>
                <div className="ctx-menu-item formatting-item" title='Code' onClick={handleCodeFormatting}><i className="ri-braces-line"></i></div>
                <div className="ctx-menu-item formatting-item" title='Quote' onClick={handleQuoteFormatting}><i className="ri-double-quotes-r"></i></div>
                <div className="ctx-menu-item formatting-item" title='Redacted' onClick={handleRedactedFormatting}><i className="ri-checkbox-indeterminate-fill"></i></div>
                <div className="ctx-menu-item formatting-item" title='Clear Formatting' onClick={handleClearFormatting}><i className="ri-format-clear"></i></div>
              </div>
              <div className="separator" />
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
                        let rect = null;
                        try {
                          rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        } catch {
                          return
                        }
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
                      if (t.id === '__HELP__') {
                        setShowHelp(true)
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
                        window.location.reload();
                        return
                      }
                      if (t.id === '__UNLOCK__') {
                        await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, false)
                        setActiveLocked(false)
                        setTagMenu(m => ({ ...m, visible: false, hoverPreview: null }))
                        window.location.reload();
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
              } else if (t.id === '__BULK_MOVE_ITEMS__') {
                handleBulkMoveOpen()
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
                  <div className="misc-item" onClick={handleExportToPdf}>Export to PDF</div>
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
                  <div className="misc-item" onClick={handleCreateBackup}>Create backup</div>
                </div>
                <div className="actions mt-12">
                  <button onClick={() => setShowMisc(false)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Add Picture modal */}
          {addPictureModal && (
            <div className="modal-overlay" {...createOverlayClickHandler(setAddPictureModal)}>
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
            <div className="edit-modal-overlay" {...createOverlayClickHandler(setShowEditObject)}>
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
                                <code className="tag-id">{t.id}</code> - <span onClick={async () => { selectObject(t.object_id, t.name); setShowEditObject(false) }} className="tag-name" title={t.name}>{t.name}</span>
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
                                <span className="tag-name" onClick={async () => { selectObject(l.owner_id, l.owner_name); setShowEditObject(false) }} title={l.owner_path}>{l.owner_name}</span>
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
              <div className="edit-picker-modal dialog-card w-520" onClick={e => e.stopPropagation()}>
                <h3 className="mt-0">Choose object to edit</h3>
                <div className="mt-10 maxh-260 border-top">
                  <ul className="list-reset">
                    {editPickerItems.map(it => (
                      <>
                      <div className="list-item-row">
                        <li key={it.id} className="list-item-click"
                          onClick={async () => { setShowEditPicker(false); await openEditForObject(it.id, it.name) }}
                          dangerouslySetInnerHTML={{ __html: it.path }}
                        />
                        <a className="list-item-delete" onClick={async () => { await handleDeleteLink(it.tag_id, it.id); const ep = await window.ipcRenderer.invoke('gamedocs:list-edit-picker-items', activeId).catch(() => []); setEditPickerItems(ep || []) }}><i className='ri-delete-bin-2-line'></i></a>
                      </div>
                      </>
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
                        if (isCommandMode) {
                          if (cmdParamMode && selectedCommand) {
                            const meta = getParamMeta(selectedCommand)
                            const choices: any[] = meta.choices || []
                            const term = paletteInput.trim().toLowerCase()
                            const filtered = choices.filter(ch => String(ch).toLowerCase().includes(term))
                            setPaletteSelIndex(i => Math.min(i + 1, Math.max(0, filtered.length - 1)))
                          } else {
                            setPaletteSelIndex(i => Math.min(i + 1, Math.max(0, filteredCommands.length - 1)))
                          }
                        } else {
                          const totalItems = paletteResults.objects.length + paletteResults.tags.length
                          setPaletteSelIndex(i => Math.min(i + 1, Math.max(0, totalItems - 1)))
                        }
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
                      if (e.key === 'Enter' && !isCommandMode) {
                        // Handle Enter for search mode
                        const totalItems = paletteResults.objects.length + paletteResults.tags.length
                        if (totalItems > 0) {
                          const idx = Math.min(Math.max(0, paletteSelIndex), totalItems - 1)
                          if (idx < paletteResults.objects.length) {
                            // Select object
                            const obj = paletteResults.objects[idx]
                            setShowPalette(false)
                            selectObject(obj.id, obj.name)
                          } else {
                            // Select tag
                            const tagIdx = idx - paletteResults.objects.length
                            const tag = paletteResults.tags[tagIdx]
                            setShowPalette(false)
                            // For now, just close palette - could implement tag navigation later
                          }
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
                            {paletteResults.objects.map((o, idx) => (
                              <div key={o.id} className="palette-item" style={{ background: idx === paletteSelIndex ? '#333' : undefined }} onClick={() => { setShowPalette(false); selectObject(o.id, o.name) }}>{o.name}</div>
                            ))}
                          </div>
                        )}
                        {paletteResults.tags.length > 0 && (
                          <div className="pad-8">
                            <div className="palette-section-title">Tags</div>
                            {paletteResults.tags.map((t, idx) => {
                              const globalIdx = paletteResults.objects.length + idx
                              return (
                                <div key={t.id} className="palette-item" style={{ background: globalIdx === paletteSelIndex ? '#333' : undefined }} onClick={() => { setShowPalette(false); /* could show tag usage or navigate owner */ }}>{t.id}</div>
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
          )}

          {/* Fullscreen image modal */}
          {imageModal.visible && (
            <div className="image-modal-overlay" onClick={() => setImageModal({ visible: false, dataUrl: null })}>
              <div className="image-modal-content">
                {imageModal.dataUrl && <img src={imageModal.dataUrl} className="image-modal-img" />}
              </div>
            </div>
          )}

          {/* Help modal */}
          {showHelp && (
            <div className="help-modal-overlay" onKeyDown={e => { if (e.key === 'Escape'){setShowHelp(false);} }} {...createOverlayClickHandler(setShowHelp)}>
              <div className="help-modal-content">
                <h3 className="help-title m-0">Help</h3>
                <div className="help-content"  tabIndex={-1}  >
                  <p>Keyboard shortcuts:</p>
                  <ul className="help-list">
                    {Object.entries(shortcuts).map(([key, value]) => (
                      <> 
                      { key !== 'goToPreviousSibling' && key !== 'goToNextSibling' && (
                        <li className="shortcut-item" key={key}><span className="shortcut-value">{getProperShortcutName(key)}</span>:<span className="shortcut-name">{getProperShortcutValue(value)}</span></li>
                      )}
                      </>
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
                      <p>You can send me bug reports or feature requests at <a className="email-link" title="Click to email me, right click to copy" href="mailto:bugreports.wolfpaw@gmail.com" onMouseUp={e => { e.preventDefault(); if (e.button === 2) { writeToClipboard('bugreports.wolfpaw@gmail.com'); } }}>bugreports.wolfpaw@gmail.com <i className="ri-cursor-line"></i></a></p>
                    </div>
                </div>
              </div>
            </div>
          )}

          {/* Settings modal */}
          {showSettings && (
            <div className="settings-overlay" {...createOverlayClickHandler(setShowSettings)}>
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
                        await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.shortcuts', shortcuts)
                        await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.hoverDebounce', hoverDebounce)
                        await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.sidebarWidth', sidebarWidth)
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
                        <label className="box-title">Hover Settings</label>
                        <div className="debounce-settings settings-flex-wrap">
                          <label className="debounce-label">Hover debounce (ms)
                            <input type="number" min={0} max={2000} step={50}
                              value={hoverDebounce}
                              onChange={(e) => { 
                                const value = parseInt(e.target.value || '300', 10)
                                setHoverDebounce(value)
                              }}
                              className="settings-number" />
                          </label>
                        </div>
                      </div>

                      <div className="settings-group">
                        <label className="box-title">Sidebar Settings</label>
                        <div className="debounce-settings settings-flex-wrap">
                          <label className="debounce-label">Sidebar width (px)
                            <input type="number" min={200} max={500} step={10}
                              value={sidebarWidth}
                              onChange={async (e) => { 
                                const value = parseInt(e.target.value || '200', 10)
                                setSidebarWidth(value)
                                try {
                                  await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.sidebarWidth', value)
                                } catch {}
                              }}
                              className="settings-number" />
                          </label>
                        </div>
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
                                {customFont?.fontName && <option value={customFont.fontName}>Custom ({customFont.fontName})</option>}
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
                          {/* <label>Text Color <input type="color"
                            value={fonts.color}
                            onChange={(e) => { const f = { ...fonts, color: e.target.value }; setFonts(f); applyFonts(f) }} /></label> */}
                          
                          <button className="font-browse-button" title="Choose font file" onClick={async () => {
                                const pick = await window.ipcRenderer.invoke('gamedocs:choose-font-file').catch(() => null)
                                if (pick?.path) {
                                  // Copy font file to project folder
                                  const copyResult = await window.ipcRenderer.invoke('gamedocs:copy-font-to-project', pick.path).catch(() => null)
                                  if (copyResult?.success) {
                                    // Load the font from the copied location
                                    const loaded = await window.ipcRenderer.invoke('gamedocs:read-font-as-dataurl', copyResult.path).catch(() => null)
                                    if (loaded?.dataUrl) {
                                      const fontName = loaded.suggestedFamily || 'CustomFont'
                                      const styleTagId = `pd-font-${fontName}`
                                      if (!document.getElementById(styleTagId)) {
                                        const st = document.createElement('style')
                                        st.id = styleTagId
                                        st.innerHTML = `@font-face{ font-family: "${fontName}"; src: url(${loaded.dataUrl}) format("${(loaded.mime||'').includes('woff')?'woff2':'truetype'}"); font-weight: 100 900; font-style: normal; font-display: swap; }`
                                        document.head.appendChild(st)
                                      }
                                      
                                      // Update font family to use the custom font
                                      const f = { ...fonts, family: fontName }
                                      setFonts(f)
                                      applyFonts(f)
                                      
                                      // Set custom font state
                                      const customFontData = {
                                        fontName,
                                        fontPath: copyResult.path,
                                        fileName: copyResult.fileName
                                      }
                                      setCustomFont(customFontData)
                                      
                                      // Save the custom font settings to database
                                      await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.customFont', customFontData)
                                      
                                      toast('Custom font loaded and saved', 'success')
                                    }
                                  } else {
                                    toast('Failed to copy font file', 'error')
                                  }
                                }
                              }}>Browse…</button>
                        </div>
                      </div>
                    </div>

                    {/* Right column: shortcuts */}
                    <div className="settings-right">
                      <div className="settings-title">Keyboard shortcuts</div>
                      <div className="settings-grid-2">
                        <div className="settings-shortcut-row"><label htmlFor="settings">Settings </label><ShortcutInput value={shortcuts.settings} onChange={value => setShortcuts(s => ({ ...s, settings: value }))} placeholder='F1' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="editObject">Edit object </label><ShortcutInput value={shortcuts.editObject} onChange={value => setShortcuts(s => ({ ...s, editObject: value }))} placeholder='F2' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="command">Search palette </label><ShortcutInput value={shortcuts.command} onChange={value => setShortcuts(s => ({ ...s, command: value }))} placeholder='Ctrl+K' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="command2">Command palette </label><ShortcutInput value={shortcuts.command2} onChange={value => setShortcuts(s => ({ ...s, command2: value }))} placeholder='Ctrl+Shift+K' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="newChild">New child </label><ShortcutInput value={shortcuts.newChild} onChange={value => setShortcuts(s => ({ ...s, newChild: value }))} placeholder='Ctrl+N' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="addImage">Add image </label><ShortcutInput value={shortcuts.addImage} onChange={value => setShortcuts(s => ({ ...s, addImage: value }))} placeholder='Ctrl+I' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="miscStuff">Open Misc stuff </label><ShortcutInput value={shortcuts.miscStuff} onChange={value => setShortcuts(s => ({ ...s, miscStuff: value }))} placeholder='Ctrl+Shift+M' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="exportShare">Export to Share </label><ShortcutInput value={shortcuts.exportShare} onChange={value => setShortcuts(s => ({ ...s, exportShare: value }))} placeholder='Ctrl+E' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="toggleLock">Toggle lock </label><ShortcutInput value={shortcuts.toggleLock} onChange={value => setShortcuts(s => ({ ...s, toggleLock: value }))} placeholder='Ctrl+L' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="goToParent">Go to parent </label><ShortcutInput value={shortcuts.goToParent} onChange={value => setShortcuts(s => ({ ...s, goToParent: value }))} placeholder='Ctrl+ARROWUP' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="help">Help </label><ShortcutInput value={shortcuts.showHelp} onChange={value => setShortcuts(s => ({ ...s, showHelp: value }))} placeholder='Ctrl+H' /></div>
                        {/* <div className="settings-shortcut-row"><label htmlFor="goToPreviousSibling">Go to previous sibling </label><ShortcutInput value={shortcuts.goToPreviousSibling} onChange={value => setShortcuts(s => ({ ...s, goToPreviousSibling: value }))} placeholder='Ctrl+ArrowLeft' /></div>
                        <div className="settings-shortcut-row"><label htmlFor="goToNextSibling">Go to next sibling </label><ShortcutInput value={shortcuts.goToNextSibling} onChange={value => setShortcuts(s => ({ ...s, goToNextSibling: value }))} placeholder='Ctrl+ArrowRight' /></div> */}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add Child modal */}
          {showCat && (
            <div className="modal-overlay" {...createOverlayClickHandler(setShowCat)}>
              <div className="dialog-card w-360">
                <h3 className="mt-0">Add Child</h3>
                <div className="grid-gap-8">
                  <label>
                    <div>Name</div>
                    <input id="catName" autoFocus value={catName} onKeyDown={e => { if (e.key === 'Enter') { if(e.ctrlKey) {handleCreateChildAndEnter()} else {handleCreateChild()} } else if (e.key === 'Escape') { setShowCat(false) } }} onChange={e => setCatName(e.target.value)} className="input-100" />
                  </label>
                  <label>
                    <div>Description</div>
                    <textarea onKeyDown={e => { if (e.key === 'Enter') { if(e.ctrlKey) {handleCreateChildAndEnter()} } else if (e.key === 'Escape') { setShowCat(false) } }} value={catDescription} onChange={(e: any) => {setCatDescription((e.target as HTMLTextAreaElement).value);}} className="new-child-description input-100" />
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
                  {ctrlKeyPressed ? (
                    <button onClick={async () => { handleCreateChildAndEnter() }}>Create and Enter</button>
                  ) : (
                    <button onClick={async () => { handleCreateChild() }}>Create</button>
                  )}
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
                  replaceSelectionWithSpan(label, res.tagId, true)
                  }}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Link to object modal */}
          {showLinker && (
            <div className="modal-overlay" {...createOverlayClickHandler(() => { setShowLinker(false); setIsLinkLastWordMode(false) })}>
              <div className="dialog-card w-520" onKeyDown={e => { if (e.key === 'Escape') { setShowLinker(false); setIsLinkLastWordMode(false) } }}>
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
                  }} onKeyDown={e => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      const totalItems = pathChoices.length > 0 ? pathChoices.length : linkerMatches.length
                      setLinkerSelIndex(i => Math.min(i + 1, Math.max(0, totalItems - 1)))
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setLinkerSelIndex(i => Math.max(0, i - 1))
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const container = linkerResultsRef.current
                      if (!container) return
                      const items = Array.from(container.querySelectorAll<HTMLLIElement>('.list-item-click'))
                      if (items.length === 0) return
                      const idx = Math.min(Math.max(0, linkerSelIndex), items.length - 1)
                      const el = items[idx]
                      if (el) {
                        el.click()
                      }
                    }
                  }} className="flex-1" placeholder={'Search or type new name'} />
                  {linkerTagId ? <span title='Existing link'>🔗</span> : <span title='New item'>⎇</span>}
                </div>

                {/* Path choices */}
                {pathChoices.length > 0 ? (
                  <div className="overflow-x-hidden mt-10 maxh-260 border-top" ref={linkerResultsRef as any}>
                    <ul className="list-reset">
                      {pathChoices.map((pc, idx) => (
                        <li key={pc.id} className="list-item-click" style={{ background: idx === linkerSelIndex ? '#333' : undefined }}
                          onClick={async () => {
                            let tid = linkerTagId
                            if (!tid) {
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id, activeId || root!.id)
                              tid = res.tagId
                              setLinkerTagId(tid)
                            }
                            await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, pc.id)
                            replaceSelectionWithSpan(linkerInput || pc.name, tid as string, isLinkLastWordMode)
                            setShowLinker(false)
                          }}
                        dangerouslySetInnerHTML={{ __html: pc.path }}></li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="overflow-x-hidden mt-10 maxh-260 border-top" ref={linkerResultsRef as any}>
                    {linkerMatches.length === 0 ? (
                      <div className="muted pad-8">No objects</div>
                    ) : (
                      <ul className="list-reset">
                        {linkerMatches.map((m, idx) => (
                          <li key={m.id} className="list-item-click" style={{ background: idx === linkerSelIndex ? '#333' : undefined }}
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
                              replaceSelectionWithSpan(linkerInput || m.name, tid as string, isLinkLastWordMode)
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
                  <button onClick={() => { setShowLinker(false); setIsLinkLastWordMode(false) }}>Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Move modal */}
          {showBulkMoveModal && (
            <div className="bulk-move-overlay" {...createOverlayClickHandler(handleBulkMoveCancel)}>
              <div className="bulk-move-width" onClick={e => e.stopPropagation()}>
                <div className="bulk-move-card">
                  <div className="bulk-move-header">
                    <h3 className="m-0">Select Items to Move</h3>
                    <div className="flex-gap-8">
                      <button onClick={handleBulkMoveCancel}>Cancel</button>
                      <button 
                        onClick={handleBulkMoveNext}
                        disabled={selectedItems.size === 0}
                        style={{ opacity: selectedItems.size > 0 ? 1 : 0.5 }}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="bulk-move-filters">
                    <div className="bulk-filter-row">
                      <input
                        type="text"
                        className="bulk-filter-input"
                        placeholder="Filter by name..."
                        value={bulkNameFilter}
                        onChange={(e) => setBulkNameFilter(e.target.value)}
                      />
                      <input
                        type="text"
                        className="bulk-filter-input"
                        placeholder="Filter by parent..."
                        value={bulkParentFilter}
                        onChange={(e) => setBulkParentFilter(e.target.value)}
                      />
                    </div>
                    <div className="bulk-filter-options">
                      <label className="bulk-checkbox-label">
                        <input
                          type="checkbox"
                          checked={includeDescendants}
                          onChange={(e) => setIncludeDescendants(e.target.checked)}
                        />
                        Include descendants (not just direct children)
                      </label>
                    </div>
                  </div>

                  <div className="bulk-move-content">
                    <div className="bulk-items-list">
                      {filteredBulkItems.map(item => (
                        <div 
                          key={item.id} 
                          className="bulk-item-row"
                          onClick={() => {
                            const newSelected = new Set(selectedItems)
                            if (selectedItems.has(item.id)) {
                              newSelected.delete(item.id)
                            } else {
                              newSelected.add(item.id)
                            }
                            setSelectedItems(newSelected)
                          }}
                        >
                          <input
                            type="checkbox"
                            className="bulk-item-checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedItems)
                              if (e.target.checked) {
                                newSelected.add(item.id)
                              } else {
                                newSelected.delete(item.id)
                              }
                              setSelectedItems(newSelected)
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="bulk-item-info">
                            <div className="bulk-item-name">{item.name}</div>
                            <div className="bulk-item-id">{item.id}</div>
                          </div>
                        </div>
                      ))}
                      {filteredBulkItems.length === 0 && (
                        <div className="bulk-no-results">No items found matching filters</div>
                      )}
                    </div>
                  </div>

                  {selectedItems.size > 0 && (
                    <div className="bulk-selected-summary">
                      <div className="bulk-summary-title">Selected Items ({selectedItems.size}):</div>
                      <div className="bulk-summary-list">
                        {Array.from(selectedItems).map(itemId => {
                          const item = allObjectsForBulk.find(obj => obj.id === itemId)
                          return item ? item.name : null
                        }).filter(Boolean).join(', ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Move modal */}
          {showMoveModal && (
            <div className="move-overlay" onClick={handleMoveCancel}>
              <div className="move-width" onClick={e => e.stopPropagation()}>
                <div className="move-card">
                  <div className="move-header">
                    <h3 className="m-0">Move Items</h3>
                    <div className="flex-gap-8">
                      <button onClick={handleMoveCancel}>Cancel</button>
                      <button 
                        onClick={handleMoveConfirm}
                        disabled={!selectedParent}
                        style={{ opacity: selectedParent ? 1 : 0.5 }}
                      >
                        Move
                      </button>
                    </div>
                  </div>

                  <div className="move-columns">
                    {/* Left column: Items to move */}
                    <div className="move-col">
                      <div className="move-section-title">Items to Move</div>
                      <div className="move-list">
                        {moveItems.map(item => (
                          <div key={item.id} className="move-item" title={item.path}>
                            <div className="move-item-id">{item.id}</div>
                            <div className="move-item-name">{item.name}</div>
                            <div className="move-item-path">{item.path}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right column: Possible parents */}
                    <div className="move-col">
                      <div className="move-section-title">Select New Parent</div>
                      <input
                        type="text"
                        className="move-search-input"
                        placeholder="Search parents..."
                        value={parentSearchInput}
                        onChange={(e) => setParentSearchInput(e.target.value)}
                        autoFocus
                      />
                      <div className="move-list">
                        {filteredParents.map(parent => (
                          <div 
                            key={parent.id} 
                            className="move-parent-item"
                            onClick={() => setSelectedParent(parent.id)}
                          >
                            <input 
                              type="radio" 
                              className="move-parent-radio"
                              checked={selectedParent === parent.id}
                              onChange={() => setSelectedParent(parent.id)}
                            />
                            <div className="move-parent-info">
                              <div className="move-parent-name">{parent.name}</div>
                              <div className="move-parent-path">{parent.path}</div>
                            </div>
                          </div>
                        ))}
                        {filteredParents.length === 0 && parentSearchInput && (
                          <div className="move-no-results">No parents found matching "{parentSearchInput}"</div>
                        )}
                      </div>
                    </div>
                  </div>
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




