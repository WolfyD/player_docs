import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './editor.css'
import Fuse from 'fuse.js'
import { confirmDialog, toast } from './Confirm'
import { logger } from '../utils/logger'
import ShortcutInput from './ShortcutInput'
import type { Campaign, TypeTag, ObjectType, Attachment, TemplateDef, TemplateVisualField, TemplateStyleDecl, TemplateStyleBlock, TemplateInstance, TemplateInstanceLibraryRow } from './editor/types'
import { CSS_PROPERTY_OPTIONS, ALL_REMIX_ICONS, listOfCommands as importedListOfCommands } from './editor/constants'
import { matchShortcut } from './editor/shortcutUtils'
import { descToHtml, htmlToDesc, normalizeTemplateSpacing, removeMissingTags } from './editor/descSerializer'
import type { DescToHtmlOptions } from './editor/descSerializer'
import { parseTemplateFields, createVisualField, parseTemplateMeta, normalizeTemplateFields, createStyleDecl, createStyleBlock, buildCssFromStyleBlocks, parseCssToStyleBlocks, buildTemplateSourceFromVisual, parseVisualFieldsFromRawSource } from './editor/templateEngine'
import { createOverlayClickHandler } from './editor/overlayUtils'
import InlinePdfViewer from './InlinePdfViewer'
import ChildContextMenu from './editor/ui/ChildContextMenu'
import EditorContextMenu from './editor/ui/EditorContextMenu'
import TagMenu from './editor/ui/TagMenu'
import AddChildModal from './editor/modals/AddChildModal'
import ImageModal from './editor/modals/ImageModal'
import PdfModal from './editor/modals/PdfModal'
import HelpModal from './editor/modals/HelpModal'
import MiscModal from './editor/modals/MiscModal'
import CommandPalette from './editor/modals/CommandPalette'
import MoveModal from './editor/modals/MoveModal'
import BulkMoveModal from './editor/modals/BulkMoveModal'
import LinkerModal from './editor/modals/LinkerModal'
import EditObjectModal from './editor/modals/EditObjectModal'
import SettingsModal from './editor/modals/SettingsModal'
import TypeManagerModal from './editor/modals/TypeManagerModal'
import TypeEditorModal from './editor/modals/TypeEditorModal'
import TemplateEditorModal from './editor/modals/TemplateEditorModal'
import TemplatePickerModal from './editor/modals/TemplatePickerModal'
import TemplateInstanceLibraryModal from './editor/modals/TemplateInstanceLibraryModal'
import TemplateInstanceEditorModal from './editor/modals/TemplateInstanceEditorModal'

export const Editor: React.FC = () => {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [toggleStylingOptions, setToggleStylingOptions] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [root, setRoot] = useState<{ id: string; name: string; type: string; type_id?: string; type_icon?: string } | null>(null)
  const [children, setChildren] = useState<Array<{ id: string; name: string; type: string; type_id?: string; type_icon?: string; type_hidden?: number }>>([])
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null)
  const [showCat, setShowCat] = useState(false)
  const [catName, setCatName] = useState('')
  const [catType, setCatType] = useState<string>('type_other')
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
  const settingsLoadedRef = useRef<boolean>(false)
  const loadedStylingEnabledRef = useRef<boolean>(true)
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean
    x: number
    y: number
    selText: string
    activeStyles?: Set<string>
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
  const [wizardType, setWizardType] = useState<string>('type_other')
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([])
  const [showTypeManager, setShowTypeManager] = useState(false)
  const [typeEditorOpen, setTypeEditorOpen] = useState(false)
  const [typeEditorIsNew, setTypeEditorIsNew] = useState(false)
  const [typeEditorErr, setTypeEditorErr] = useState<string | null>(null)
  const [typeEditorId, setTypeEditorId] = useState<string>('')
  const [typeEditorName, setTypeEditorName] = useState<string>('')
  const [typeEditorIcon, setTypeEditorIcon] = useState<string>('ri-price-tag-3-line')
  const [typeIconQuery, setTypeIconQuery] = useState<string>('')
  const [typeEditorTags, setTypeEditorTags] = useState<string[]>([])
  const [typeTagInput, setTypeTagInput] = useState<string>('')
  const [typeTagSuggestions, setTypeTagSuggestions] = useState<Array<{ id: string; name: string }>>([])
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<ObjectType | null>(null)
  const [deleteTypeReplacementId, setDeleteTypeReplacementId] = useState<string>('')
  const [deleteTypeItems, setDeleteTypeItems] = useState<Array<{ id: string; name: string }>>([])
  const [switchTypeTarget, setSwitchTypeTarget] = useState<ObjectType | null>(null)
  const [switchTypeReplacementId, setSwitchTypeReplacementId] = useState<string>('')
  const filteredRemixIcons = useMemo(() => {
    const q = typeIconQuery.trim().toLowerCase()
    const base = q ? ALL_REMIX_ICONS.filter(icon => icon.toLowerCase().includes(q)) : ALL_REMIX_ICONS
    return base.slice(0, 240)
  }, [typeIconQuery])
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
  const [ctxTagId, setCtxTagId] = useState<string | null>(null)
  const [ctxTagAttachments, setCtxTagAttachments] = useState<Attachment[]>([])
  // Hover preview for single-target tags
  const [hoverCard, setHoverCard] = useState<{ visible: boolean; x: number; y: number; name: string; snippet: string; imageUrl: string | null }>({ visible: false, x: 0, y: 0, name: '', snippet: '', imageUrl: null })
  const [imageModal, setImageModal] = useState<{ visible: boolean; dataUrl: string | null }>({ visible: false, dataUrl: null })
  const [pdfModal, setPdfModal] = useState<{ visible: boolean; dataUrl: string | null; filePath: string | null; name: string }>({ visible: false, dataUrl: null, filePath: null, name: '' })
  const lastHoverTagRef = useRef<string | null>(null)
  const hoverDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Left-click menu for multi-target tags
  const [tagMenu, setTagMenu] = useState<{ visible: boolean; x: number; y: number; items: Array<{ id: string; name: string; path: string }>; hoverPreview: { id: string; name: string; snippet: string; imageUrl: string | null } | null; source?: 'dropdown' | 'tag' }>({ visible: false, x: 0, y: 0, items: [], hoverPreview: null, source: undefined })
  const [tagMenuWordAttachments, setTagMenuWordAttachments] = useState<Attachment[]>([])
  const ctxMenuRef = useRef<HTMLDivElement | null>(null)
  const childCtxMenuRef = useRef<HTMLDivElement | null>(null)
  const tagMenuRef = useRef<HTMLDivElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const childItemMouseStateRef = useRef<Map<string, { mouseDownOnItem: boolean; hasMoved: boolean; startX: number; startY: number; startItemId: string }>>(new Map())
  const [images, setImages] = useState<Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [templateDefs, setTemplateDefs] = useState<TemplateDef[]>([])
  const [templateInstances, setTemplateInstances] = useState<TemplateInstance[]>([])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateInstanceLibraryOpen, setTemplateInstanceLibraryOpen] = useState(false)
  const [templateInstanceLibraryRows, setTemplateInstanceLibraryRows] = useState<TemplateInstanceLibraryRow[]>([])
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false)
  const [templateEditId, setTemplateEditId] = useState<string | null>(null)
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [templateSourceInput, setTemplateSourceInput] = useState('')
  const [templateCssInput, setTemplateCssInput] = useState('')
  const [templateRawMode, setTemplateRawMode] = useState(false)
  const [templateRawError, setTemplateRawError] = useState<string | null>(null)
  const [templateVisualFields, setTemplateVisualFields] = useState<TemplateVisualField[]>([])
  const [templateLayoutColumns, setTemplateLayoutColumns] = useState<number>(1)
  const [templateCardClassInput, setTemplateCardClassInput] = useState('')
  const [templateStyleBlocks, setTemplateStyleBlocks] = useState<TemplateStyleBlock[]>([])
  const [templateSelectedFieldId, setTemplateSelectedFieldId] = useState<string | null>(null)
  const [templateDragFieldId, setTemplateDragFieldId] = useState<string | null>(null)
  const [templateInstanceEditor, setTemplateInstanceEditor] = useState<{ open: boolean; instance: TemplateInstance | null; values: Record<string, string> }>({ open: false, instance: null, values: {} })
  const [editImages, setEditImages] = useState<Array<{ id: string; object_id: string; file_path: string; thumb_path: string; name: string | null; is_default: number; file_url?: string | null; thumb_url?: string | null; thumb_data_url?: string | null }>>([])
  const [addPictureModal, setAddPictureModal] = useState(false)
  const [picName, setPicName] = useState('')
  const [picIsDefault, setPicIsDefault] = useState(true)
  const [picSource, setPicSource] = useState<{ type: 'file' | 'url'; value: string }>({ type: 'file', value: '' })
  const [showMisc, setShowMisc] = useState(false)
  const [ctrlKeyPressed, setCtrlKeyPressed] = useState(false)
  const [hoverDebounce, setHoverDebounce] = useState(300) // milliseconds
  const [exportTemplateStyled, setExportTemplateStyled] = useState(true)
  const [showTemplateFieldLabels, setShowTemplateFieldLabels] = useState(false)
  const [pdfInlinePreferred, setPdfInlinePreferred] = useState(true)

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

  const refreshTypeCatalog = useCallback(async () => {
    if (!campaign?.id) return
    try {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-types', campaign.id).catch(() => [])
      setObjectTypes(Array.isArray(rows) ? rows : [])
    } catch {
      setObjectTypes([])
    }
  }, [campaign?.id])

  const getTypeByValue = useCallback((value: string | null | undefined): ObjectType | undefined => {
    const v = String(value || '').trim()
    if (!v) return undefined
    return objectTypes.find(t => t.id === v || t.name.toLowerCase() === v.toLowerCase())
  }, [objectTypes])

  const getSelectableTypes = useCallback((currentValue?: string) => {
    const visible = objectTypes.filter(t => !t.isHidden)
    if (!currentValue) return visible
    const current = getTypeByValue(currentValue)
    if (current && !visible.some(v => v.id === current.id)) return [...visible, current]
    return visible
  }, [objectTypes, getTypeByValue])

  const resetTypeEditor = useCallback(() => {
    setTypeEditorErr(null)
    setTypeEditorId('')
    setTypeEditorName('')
    setTypeEditorIcon('ri-price-tag-3-line')
    setTypeIconQuery('')
    setTypeEditorTags([])
    setTypeTagInput('')
    setTypeTagSuggestions([])
  }, [])

  const openNewTypeEditor = useCallback(() => {
    resetTypeEditor()
    setTypeEditorIsNew(true)
    setTypeEditorOpen(true)
  }, [resetTypeEditor])

  const openEditTypeEditor = useCallback((typeRow: ObjectType) => {
    setTypeEditorErr(null)
    setTypeEditorIsNew(false)
    setTypeEditorId(typeRow.id)
    setTypeEditorName(typeRow.name)
    setTypeEditorIcon(typeRow.icon || 'ri-price-tag-3-line')
    setTypeIconQuery(typeRow.icon || '')
    setTypeEditorTags((typeRow.tags || []).map(t => t.name))
    setTypeTagInput('')
    setTypeTagSuggestions([])
    setTypeEditorOpen(true)
  }, [])

  const addTypeTagDraft = useCallback((rawValue: string) => {
    const tag = String(rawValue || '').trim()
    if (!tag) return
    setTypeEditorTags(prev => {
      if (prev.some(p => p.toLowerCase() === tag.toLowerCase())) return prev
      return [...prev, tag]
    })
    setTypeTagInput('')
  }, [])

  const closeTypeManager = useCallback(async () => {
    setShowTypeManager(false)
    await refreshTypeCatalog()
    if (activeId) {
      await selectObject(activeId, activeName || '')
    } else if (campaign?.id) {
      const has = await window.ipcRenderer.invoke('gamedocs:has-places', campaign.id).catch(() => false)
      setHasPlaces(!!has)
    }
  }, [refreshTypeCatalog, activeId, activeName, campaign?.id])

  useEffect(() => {
    refreshTypeCatalog()
  }, [refreshTypeCatalog])

  useEffect(() => {
    if (!typeEditorOpen) return
    const q = typeTagInput.trim()
    let cancelled = false
    ;(async () => {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-type-tags', q).catch(() => [])
      if (!cancelled) setTypeTagSuggestions(Array.isArray(rows) ? rows : [])
    })()
    return () => { cancelled = true }
  }, [typeEditorOpen, typeTagInput])

  useEffect(() => {
    if (objectTypes.length === 0) return
    const other = objectTypes.find(t => t.name.toLowerCase() === 'other') || objectTypes.find(t => !t.isHidden) || objectTypes[0]
    if (other) {
      if (!getTypeByValue(catType)) setCatType(other.id)
      if (!getTypeByValue(wizardType)) setWizardType(other.id)
    }
  }, [objectTypes, catType, wizardType, getTypeByValue])

  useEffect(() => {
    if (!showTypeManager && !typeEditorOpen && !deleteTypeTarget && !switchTypeTarget) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (typeEditorOpen) { setTypeEditorOpen(false); return }
      if (deleteTypeTarget) { setDeleteTypeTarget(null); return }
      if (switchTypeTarget) { setSwitchTypeTarget(null); return }
      if (showTypeManager) { void closeTypeManager() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showTypeManager, typeEditorOpen, deleteTypeTarget, switchTypeTarget, closeTypeManager])

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
      
      editorRef.current.innerHTML = descToHtml(next, descToHtmlOpts())
      
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
      const res = await window.ipcRenderer.invoke('gamedocs:export-to-html', campaign.id, { palette, zip, renderTemplatesPlain: !exportTemplateStyled })
      if (res && res.ok) {
        toast('HTML export completed', 'success')
        if (reveal) await window.ipcRenderer.invoke('gamedocs:reveal-path', res.outDir)
      } else {
        toast('Export cancelled', 'info')
      }
    } catch (e) {
      toast('Export to HTML failed', 'error')
    }
  }, [campaign, exportTemplateStyled])

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
      const res = await window.ipcRenderer.invoke('gamedocs:export-to-pdf', campaign.id, { palette, renderTemplatesPlain: !exportTemplateStyled })
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
  }, [campaign, exportTemplateStyled])

  const handleAddObjectAttachment = useCallback(async () => {
    if (!activeId) return
    const pick = await window.ipcRenderer.invoke('gamedocs:choose-attachment-file').catch(() => null)
    if (!pick?.path) return
    await window.ipcRenderer.invoke('gamedocs:add-attachment', { objectId: activeId, sourcePath: pick.path, isMain: attachments.length === 0 }).catch((e: any) => {
      toast(e?.message || 'Failed to add attachment', 'error')
    })
    await loadObjectScopedData(activeId)
    toast('Attachment added', 'success')
  }, [activeId, attachments.length, loadObjectScopedData])

  const handleDropObjectAttachments = useCallback(async (files: FileList | null) => {
    if (!activeId || activeLocked || !files || files.length === 0) return
    const dropped = Array.from(files)
    let addedFiles = 0
    let addedImages = 0
    for (let i = 0; i < dropped.length; i++) {
      const file = dropped[i] as any
      const sourcePath = String((file && (file.path || '')) || '').trim()
      const extPart = sourcePath ? sourcePath.split('.').pop() : String(file?.name || '').split('.').pop()
      const ext = String(extPart || '').toLowerCase()
      const mime = String(file?.type || '').toLowerCase()
      const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)
      let res: any = null
      let imageRes: any = null
      if (sourcePath) {
        if (isImage) {
          imageRes = await window.ipcRenderer.invoke('gamedocs:add-image', activeId, {
            name: String(file?.name || ''),
            source: { type: 'file', value: sourcePath },
            isDefault: false,
          }).catch(() => null)
        } else {
          res = await window.ipcRenderer.invoke('gamedocs:add-attachment', {
            objectId: activeId,
            sourcePath,
            isMain: (attachments.length + addedFiles) === 0,
          }).catch(() => null)
        }
      } else if (file?.arrayBuffer) {
        const ab = await file.arrayBuffer().catch(() => null)
        if (ab) {
          const bytes = new Uint8Array(ab)
          let binary = ''
          const chunk = 0x8000
          for (let j = 0; j < bytes.length; j += chunk) {
            const slice = bytes.subarray(j, Math.min(j + chunk, bytes.length))
            binary += String.fromCharCode(...slice)
          }
          const b64 = btoa(binary)
          if (isImage) {
            imageRes = await window.ipcRenderer.invoke('gamedocs:add-image', activeId, {
              name: String(file.name || `image_${i + 1}`),
              source: { type: 'data', value: b64 },
              mimeHint: String(file.type || ''),
              isDefault: false,
            }).catch(() => null)
          } else {
            res = await window.ipcRenderer.invoke('gamedocs:add-attachment', {
              objectId: activeId,
              dataBase64: b64,
              fileName: String(file.name || `drop_${i + 1}`),
              mimeHint: String(file.type || ''),
              isMain: (attachments.length + addedFiles) === 0,
            }).catch(() => null)
          }
        }
      }
      if (res?.id) addedFiles += 1
      if (imageRes?.id) addedImages += 1
    }
    if (addedFiles > 0 || addedImages > 0) {
      await loadObjectScopedData(activeId)
      try {
        const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', activeId).catch(() => [])
        setImages((imgs || []) as any[])
      } catch {}
      const msgParts = [
        addedImages > 0 ? `${addedImages} image${addedImages > 1 ? 's' : ''}` : '',
        addedFiles > 0 ? `${addedFiles} file${addedFiles > 1 ? 's' : ''}` : '',
      ].filter(Boolean)
      toast(`${msgParts.join(' and ')} added`, 'success')
    } else {
      toast('Could not attach dropped file(s)', 'error')
    }
  }, [activeId, activeLocked, attachments.length, loadObjectScopedData])

  const handleOpenAttachment = useCallback(async (att: Attachment) => {
    const ext = (att.ext || '').toLowerCase()
    const mime = String(att.mime || '').toLowerCase()
    const isImage = mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)
    if (isImage) {
      const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', att.file_path).catch(() => null)
      if (res?.ok && res.dataUrl) {
        setImageModal({ visible: true, dataUrl: res.dataUrl })
        return
      }
      await window.ipcRenderer.invoke('gamedocs:open-file-default', att.file_path).catch(() => null)
      return
    }
    const isPdf = ext === '.pdf' || mime === 'application/pdf'
    if (isPdf) {
      if (pdfInlinePreferred) {
        setPdfModal({ visible: true, dataUrl: null, filePath: att.file_path, name: (att.name || '').trim() || 'Attachment PDF' })
      } else {
        const ok = await window.ipcRenderer.invoke('gamedocs:open-pdf-window', att.file_path).catch(() => false)
        if (!ok) {
          await window.ipcRenderer.invoke('gamedocs:open-file-default', att.file_path).catch(() => null)
        }
      }
      return
    }
    await window.ipcRenderer.invoke('gamedocs:open-file-default', att.file_path).catch(() => null)
  }, [pdfInlinePreferred])

  const handleOpenWordAttachment = useCallback(async (att: Attachment) => {
    const ext = String(att.ext || '').toLowerCase()
    const mime = String(att.mime || '').toLowerCase()
    const isImage = mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)
    if (isImage) {
      const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', att.file_path).catch(() => null)
      if (res?.ok && res.dataUrl) {
        setImageModal({ visible: true, dataUrl: res.dataUrl })
        return
      }
    }
    await handleOpenAttachment(att)
  }, [handleOpenAttachment])


  const listOfCommands = importedListOfCommands

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

  // Template engine utilities — imported from editor/templateEngine.ts

  const toggleTemplateMode = useCallback(() => {
    if (templateRawMode) {
      try {
        const nextVisual = parseVisualFieldsFromRawSource(templateSourceInput)
        setTemplateVisualFields(nextVisual)
        if (templateCssInput.trim()) {
          setTemplateStyleBlocks(parseCssToStyleBlocks(templateCssInput))
        }
        setTemplateRawError(null)
        setTemplateRawMode(false)
      } catch (error: any) {
        setTemplateRawError(error?.message || 'Failed to parse raw template source.')
      }
      return
    }
    const generatedSource = buildTemplateSourceFromVisual(templateNameInput, templateVisualFields, templateLayoutColumns)
    setTemplateSourceInput(generatedSource)
    setTemplateCssInput(buildCssFromStyleBlocks(templateStyleBlocks))
    setTemplateRawError(null)
    setTemplateRawMode(true)
  }, [
    buildCssFromStyleBlocks,
    buildTemplateSourceFromVisual,
    parseCssToStyleBlocks,
    parseVisualFieldsFromRawSource,
    templateCssInput,
    templateLayoutColumns,
    templateNameInput,
    templateRawMode,
    templateSourceInput,
    templateStyleBlocks,
    templateVisualFields,
  ])

  const normalizeTemplateSpacing = useCallback((input: string): string => {
    const src = String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    return src.replace(/\{\{tpl:[^}]+\}\}/g, (m: string, offset: number, full: string) => {
      const start = offset
      const end = offset + m.length
      const hasBefore = start > 0 && full[start - 1] === '\n'
      const hasAfter = end < full.length && full[end] === '\n'
      let out = m
      if (!hasBefore) out = '\n' + out
      if (!hasAfter) out = out + '\n'
      return out
    })
  }, [])

  const templateInstancesById = useCallback(() => {
    const map = new Map<string, TemplateInstance>()
    for (const t of templateInstances) map.set(t.id, t)
    return map
  }, [templateInstances])

  const loadTemplates = useCallback(async () => {
    await window.ipcRenderer.invoke('gamedocs:seed-default-templates').catch(() => null)
    const defs = await window.ipcRenderer.invoke('gamedocs:list-templates').catch(() => []) as TemplateDef[]
    setTemplateDefs(defs || [])
  }, [])

  const loadTemplateInstanceLibrary = useCallback(async () => {
    if (!campaign?.id) return
    const rows = await window.ipcRenderer.invoke('gamedocs:list-template-instances-all', campaign.id).catch(() => []) as TemplateInstanceLibraryRow[]
    setTemplateInstanceLibraryRows(rows || [])
  }, [campaign?.id])

  async function loadObjectScopedData(objectId: string) {
    const [atts, tins] = await Promise.all([
      window.ipcRenderer.invoke('gamedocs:list-object-attachments', objectId).catch(() => []),
      window.ipcRenderer.invoke('gamedocs:list-template-instances', objectId).catch(() => []),
    ])
    setAttachments((atts || []) as Attachment[])
    setTemplateInstances((tins || []) as TemplateInstance[])
  }

  const saveTemplateDefinition = useCallback(async () => {
    const name = (templateNameInput || '').trim()
    if (!name) return
    const source = templateRawMode
      ? (templateSourceInput || '')
      : buildTemplateSourceFromVisual(templateNameInput, templateVisualFields, templateLayoutColumns)
    const fields = templateRawMode
      ? parseTemplateFields(source).map((f, idx) => ({ ...f, id: `tvf_${idx}`, className: '', parentId: null, order: idx }))
      : templateVisualFields
          .filter(f => (f.label || '').trim())
          .map(f => ({ id: f.id, type: f.type, label: f.label.trim(), placeholder: f.placeholder || '', required: !!f.required, className: f.className || '', parentId: f.parentId || null, order: f.order }))
    const cardClass = (templateCardClassInput || '').trim()
    const fieldsPayload = {
      version: 3,
      cardClass,
      fields: fields.map((f: any) => ({
        ...f,
        className: typeof f.className === 'string' ? f.className.trim() : ''
      })),
    }
    const effectiveCss = templateRawMode ? (templateCssInput || null) : (buildCssFromStyleBlocks(templateStyleBlocks) || null)
    const payload = {
      id: templateEditId || undefined,
      name,
      source,
      style_css: effectiveCss,
      fields_json: JSON.stringify(fieldsPayload),
    }
    const res = await window.ipcRenderer.invoke('gamedocs:save-template', payload).catch(() => null)
    if (res?.id) {
      await loadTemplates()
      setTemplateEditorOpen(false)
      setTemplateEditId(null)
      setTemplateNameInput('')
      setTemplateSourceInput('')
      setTemplateCssInput('')
      setTemplateVisualFields([])
      setTemplateLayoutColumns(1)
      setTemplateCardClassInput('')
      setTemplateStyleBlocks([])
      toast('Template saved', 'success')
    }
  }, [buildCssFromStyleBlocks, buildTemplateSourceFromVisual, loadTemplates, parseTemplateFields, templateCardClassInput, templateCssInput, templateEditId, templateLayoutColumns, templateNameInput, templateRawMode, templateSourceInput, templateStyleBlocks, templateVisualFields])

  const openTemplateEditor = useCallback((tpl?: TemplateDef | null) => {
    setTemplateEditId(tpl?.id || null)
    setTemplateNameInput(tpl?.name || '')
    setTemplateSourceInput(tpl?.source || '')
    setTemplateCssInput(tpl?.style_css || '')
    const meta = parseTemplateMeta(tpl?.fields_json || '[]')
    let parsedFields: Array<{ id?: string; type?: string; label?: string; placeholder?: string; required?: boolean; className?: string; parentId?: string | null; order?: number }> = meta.fields
    if (!Array.isArray(parsedFields) || parsedFields.length === 0) parsedFields = parseTemplateFields(tpl?.source || '')
    setTemplateVisualFields(normalizeTemplateFields(parsedFields.map((f, idx) => ({
      id: f.id || `tvf_${idx}`,
      type: ((f.type as any) || 'text'),
      label: String(f.label || ''),
      placeholder: String((f as any).placeholder || ''),
      required: !!(f as any).required,
      className: String((f as any).className || ''),
      parentId: (f as any).parentId ?? null,
      order: typeof (f as any).order === 'number' ? (f as any).order : idx,
    }))))
    setTemplateCardClassInput(meta.cardClass || '')
    setTemplateStyleBlocks(parseCssToStyleBlocks(tpl?.style_css || ''))
    setTemplateLayoutColumns(1)
    setTemplateRawMode(false)
    setTemplateRawError(null)
    setTemplateSelectedFieldId(null)
    setTemplateDragFieldId(null)
    setTemplateEditorOpen(true)
  }, [normalizeTemplateFields, parseCssToStyleBlocks, parseTemplateFields, parseTemplateMeta])

  const openTemplateInstanceLibrary = useCallback(async () => {
    await loadTemplateInstanceLibrary()
    setTemplateInstanceLibraryOpen(true)
  }, [loadTemplateInstanceLibrary])

  const getTemplateChildren = useCallback((parentId: string | null) => {
    return templateVisualFields
      .filter(f => (f.parentId || null) === (parentId || null))
      .sort((a, b) => a.order - b.order)
  }, [templateVisualFields])

  const addTemplateField = useCallback((parentId: string | null, type: TemplateVisualField['type']) => {
    setTemplateVisualFields(prev => {
      const siblings = prev.filter(f => (f.parentId || null) === (parentId || null))
      const nextOrder = siblings.length ? Math.max(...siblings.map(s => s.order)) + 1 : 0
      const next = createVisualField({ type, parentId, order: nextOrder, label: type === 'div' ? 'Group' : `Field ${prev.length + 1}` })
      setTemplateSelectedFieldId(next.id)
      return [...prev, next]
    })
  }, [createVisualField])

  const removeTemplateField = useCallback((fieldId: string) => {
    setTemplateVisualFields(prev => {
      const removeIds = new Set<string>([fieldId])
      let changed = true
      while (changed) {
        changed = false
        for (const f of prev) {
          if (f.parentId && removeIds.has(f.parentId) && !removeIds.has(f.id)) {
            removeIds.add(f.id); changed = true
          }
        }
      }
      if (templateSelectedFieldId && removeIds.has(templateSelectedFieldId)) {
        setTemplateSelectedFieldId(null)
      }
      return prev.filter(f => !removeIds.has(f.id))
    })
  }, [templateSelectedFieldId])

  const moveTemplateField = useCallback((fieldId: string, dir: -1 | 1) => {
    setTemplateVisualFields(prev => {
      const current = prev.find(f => f.id === fieldId)
      if (!current) return prev
      const siblings = prev.filter(f => (f.parentId || null) === (current.parentId || null)).sort((a, b) => a.order - b.order)
      const idx = siblings.findIndex(s => s.id === fieldId)
      const swapIdx = idx + dir
      if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return prev
      const a = siblings[idx]
      const b = siblings[swapIdx]
      return prev.map(f => {
        if (f.id === a.id) return { ...f, order: b.order }
        if (f.id === b.id) return { ...f, order: a.order }
        return f
      })
    })
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    const styleId = 'pd-template-user-styles'
    let st = document.getElementById(styleId) as HTMLStyleElement | null
    const css = (templateDefs || [])
      .map(t => (t.style_css || '').trim())
      .filter(Boolean)
      .join('\n\n')
    if (!st) {
      st = document.createElement('style')
      st.id = styleId
      document.head.appendChild(st)
    }
    st.textContent = css
  }, [templateDefs])

  useEffect(() => {
    if (!templateEditorOpen || templateRawMode) return
    const generated = buildTemplateSourceFromVisual(templateNameInput, templateVisualFields, templateLayoutColumns)
    setTemplateSourceInput(generated)
  }, [buildTemplateSourceFromVisual, templateEditorOpen, templateLayoutColumns, templateNameInput, templateRawMode, templateVisualFields])

  useEffect(() => {
    // Template instances load asynchronously after object selection.
    // Re-render description once they arrive so {{tpl:*}} markers resolve to cards.
    // Do NOT run on every `desc` keystroke, otherwise caret position resets while typing.
    if (!editorRef.current) return
    if (!desc || !desc.includes('{{tpl:')) return
    const stylingEnabledToUse = settingsLoadedRef.current ? loadedStylingEnabledRef.current : toggleStylingOptions
    const scrollTop = editorRef.current.scrollTop
    editorRef.current.innerHTML = descToHtml(desc, descToHtmlOpts(stylingEnabledToUse))
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.scrollTop = scrollTop
    })
  }, [templateInstances])

  useEffect(() => {
    if (!activeId || !desc || !desc.includes('{{tpl:')) return
    const ids = Array.from(desc.matchAll(/\{\{tpl:([^}]+)\}\}/g)).map(m => String(m[1] || '').trim()).filter(Boolean)
    if (!ids.length) return
    const map = templateInstancesById()
    const missing = ids.some(id => !map.has(id))
    if (!missing) return
    const t = setTimeout(() => { loadObjectScopedData(activeId).catch(() => null) }, 200)
    return () => clearTimeout(t)
  }, [activeId, desc, loadObjectScopedData, templateInstances, templateInstancesById])

  const openTemplateInstanceEditor = useCallback((instanceId: string) => {
    const inst = templateInstances.find(t => t.id === instanceId) || null
    if (!inst) return
    let values: Record<string, string> = {}
    try { values = JSON.parse(inst.values_json || '{}') } catch {}
    setTemplateInstanceEditor({ open: true, instance: inst, values })
  }, [templateInstances])

  function safeThumbSrc(img: { thumb_data_url?: string | null; thumb_url?: string | null; thumb_path: string }) {
    const data = (img.thumb_data_url || '').trim()
    if (data.startsWith('data:') && data.length > 30) return data
    const url = (img.thumb_url || '').trim()
    if (url) return url
    return `file:///${img.thumb_path.replace(/\\/g, '/')}`
  }

  // matchShortcut — imported from editor/shortcutUtils.ts

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
      } else if (matchShortcut(e, shortcuts.exportShare)) {
        e.preventDefault(); handleExportToShare()
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
        e.preventDefault()
        ;(async () => {
          if (!activeId) return
          const nextLocked = !activeLocked
          await window.ipcRenderer.invoke('gamedocs:set-object-locked', activeId, nextLocked)
          setActiveLocked(nextLocked)
          toast(nextLocked ? 'Object locked' : 'Object unlocked', 'success')
        })()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts, activeName, activeId, activeLocked, campaign?.id])

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
      case 'editObject':
        if (activeLocked) { toast('Object is locked', 'error'); return }
        ;(async () => {
          const obj = await window.ipcRenderer.invoke('gamedocs:get-object', activeId).catch(() => null)
          setEditName(activeName)
          setWizardType((obj?.type_id as string) || (obj?.type as string) || 'type_other')
          setEditTargetId(null)
          setShowEditObject(true)
          setShowPalette(false)
        })()
        return
      case 'newChild': setCatErr(null); setCatName(''); setCatDescription(''); setShowCat(true); setShowPalette(false); return
      case 'addImage': setAddPictureModal(true); setShowPalette(false); return
      case 'miscStuff': setShowMisc(true); setShowPalette(false); return
      case 'exportShare': handleExportToShare(); setShowPalette(false); return
      case 'testImageCleanup': handleTestImageCleanup(); setShowPalette(false); return
      case 'listAllItems': if (activeLocked) { toast('Object is locked', 'error'); return } handleListAllItems(); setShowPalette(false); return
      case 'insertTemplate': setTemplatePickerOpen(true); setShowPalette(false); return
      case 'manageTemplates': setShowSettings(true); setTemplateEditorOpen(true); setShowPalette(false); return
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

  async function handleChooseFontFile() {
    const pick = await window.ipcRenderer.invoke('gamedocs:choose-font-file').catch(() => null)
    if (!pick?.path) return
    const loaded = await window.ipcRenderer.invoke('gamedocs:read-font-as-dataurl', pick.path).catch(() => null)
    if (!loaded?.dataUrl) return
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
      await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, normalizeTemplateSpacing(desc))
    }, 500)
    return () => clearTimeout(handler)
  }, [desc, activeId, normalizeTemplateSpacing])

  // Helper function to get character offset of cursor position in contentEditable
  const getCursorOffset = useCallback((container: HTMLElement, range: Range): number => {
    let offset = 0
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    )
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        offset += range.startOffset
        return offset
      }
      offset += node.textContent?.length || 0
    }
    return offset
  }, [])

  // Helper function to restore cursor position from character offset
  const restoreCursorOffset = useCallback((container: HTMLElement, offset: number): void => {
    const sel = window.getSelection()
    if (!sel) return
    
    let currentOffset = 0
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    )
    let node: Node | null
    while ((node = walker.nextNode())) {
      const nodeLength = node.textContent?.length || 0
      if (currentOffset + nodeLength >= offset) {
        const range = document.createRange()
        const nodeOffset = offset - currentOffset
        range.setStart(node, nodeOffset)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      currentOffset += nodeLength
    }
    // If we didn't find the position, place cursor at the end
    const range = document.createRange()
    range.selectNodeContents(container)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }, [])

  // Re-render description when styling enabled state changes (only after settings have loaded)
  useEffect(() => {
    if (settingsLoadedRef.current && editorRef.current && desc !== undefined) {
      // Preserve scroll position and cursor position
      const scrollTop = editorRef.current.scrollTop
      const sel = window.getSelection()
      let cursorOffset = 0
      let hadValidSelection = false
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        if (range.startContainer && editorRef.current.contains(range.startContainer)) {
          cursorOffset = getCursorOffset(editorRef.current, range)
          hadValidSelection = true
        }
      }
      
      const currentDesc = desc || ''
      editorRef.current.innerHTML = descToHtml(currentDesc, descToHtmlOpts())
      
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.scrollTop = scrollTop
          // Restore cursor position (cursorOffset can be 0 if at start)
          if (hadValidSelection) {
            restoreCursorOffset(editorRef.current, cursorOffset)
          }
          // Ensure editor has focus
          editorRef.current.focus()
        }
      })
    }
  }, [toggleStylingOptions, getCursorOffset, restoreCursorOffset])

  const handleEditorInput = useCallback(() => {
    const el = editorRef.current
    if (el) {
      // Debug: log HTML structure before conversion
      const desc = normalizeTemplateSpacing(htmlToDesc(el))
      setDesc(desc)
    }
  }, [normalizeTemplateSpacing])

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
    if (activeLocked) { setCtxMenu(m => ({ ...m, visible: false })); return }
    const sel = window.getSelection()
    if (!sel) return
    if (sel.rangeCount === 0 || sel.isCollapsed) {
      const ok = expandSelectionToWord(sel, e)
      if (!ok) { setCtxMenu(m => ({ ...m, visible: false })); return }
    }
    selectionRangeRef.current = sel.getRangeAt(0).cloneRange()
    const selText = sel.toString()
    
    // Check which styles are applied to the selection
    const range = selectionRangeRef.current
    const activeStyles = new Set<string>()
    const styleNames = ['bold', 'italic', 'underline', 'strike', 'h1', 'code', 'quote', 'redacted']
    
    // Check all text nodes in the selection
    const walker = document.createTreeWalker(editorRef.current!, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.currentNode
    const cmpNodeOrder = (a: Node, b: Node): number => {
      if (a === b) return 0
      const pos = a.compareDocumentPosition(b)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    }
    while (node && cmpNodeOrder(node, range.startContainer) < 0) node = walker.nextNode()
    if (node) {
      do {
        if (node.nodeType === Node.TEXT_NODE) {
          // Check if this text node is within the selection
          if (cmpNodeOrder(node, range.endContainer) > 0) break
          
          // Walk up the tree to find style spans
          let current: Node | null = node
          while (current && current !== editorRef.current) {
            if (current.nodeType === Node.ELEMENT_NODE) {
              const el = current as HTMLElement
              if (el.matches('span.styleTag') || el.matches('span.styleTagDisabled')) {
                for (const styleName of styleNames) {
                  if (el.classList.contains(`style-${styleName}`)) {
                    activeStyles.add(styleName)
                  }
                }
              }
            }
            current = current.parentElement
          }
        }
        if (cmpNodeOrder(node, range.endContainer) > 0) break
        node = walker.nextNode()
      } while (node)
    }
    
    console.log('[handleEditorContextMenu] Active styles:', Array.from(activeStyles))
    
    // If inside a tag span, fetch linked targets
    let tagId: string | null = null
    const tagNode = selectionRangeRef.current.startContainer as Node
    let el: HTMLElement | null = (tagNode.nodeType === Node.ELEMENT_NODE ? (tagNode as HTMLElement) : (tagNode.parentElement))
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { tagId = el.getAttribute('data-tag'); break }
      el = el.parentElement
    }
    if (tagId) {
      const rows = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => [])
      setCtxLinkedTargets(rows || [])
      setCtxTagId(tagId)
      const atts = await window.ipcRenderer.invoke('gamedocs:list-tag-attachments', tagId).catch(() => [])
      setCtxTagAttachments((atts || []) as Attachment[])
    } else {
      setCtxLinkedTargets([])
      setCtxTagId(null)
      setCtxTagAttachments([])
    }
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, selText, activeStyles })
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
    setWizardType((obj?.type_id as string) || (obj?.type as string) || 'type_other')
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
    openEditForObject(childCtxMenu.selId, childCtxMenu.selText)
  }, [openEditForObject, childCtxMenu])

  const handleMoveChildOpen = useCallback(async () => {
    
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

  const ensureWordAttachmentTransition = useCallback(async (tagId: string, targetObjectId: string): Promise<boolean> => {
    const rows = await window.ipcRenderer.invoke('gamedocs:list-tag-attachments', tagId).catch(() => []) as Attachment[]
    if (!rows || rows.length === 0) return true
    const move = await confirmDialog({
      title: 'Word attachment found',
      message: 'This word has direct attachments. Would you like to move them to the linked object or remove them?',
      variant: 'yes-no',
      posLabel: 'Move',
      negLabel: 'Remove',
    })
    if (move) {
      await window.ipcRenderer.invoke('gamedocs:move-tag-attachments-to-object', tagId, targetObjectId).catch(() => null)
      toast('Word attachment moved to linked object', 'success')
      return true
    }
    await window.ipcRenderer.invoke('gamedocs:remove-tag-attachments', tagId).catch(() => null)
    toast('Word attachment removed', 'info')
    return true
  }, [])

  const handleAttachFileToWord = useCallback(async () => {
    if (!campaign || !activeId || activeLocked) return
    const range = selectionRangeRef.current
    const selected = (range?.toString?.() || '').trim()
    if (!selected) {
      toast('Select a word first', 'info')
      return
    }
    // If selection is already inside tag, enforce unlinked-only rule.
    let existingTagId: string | null = null
    let el: HTMLElement | null = (range?.startContainer as any)?.parentElement || null
    while (el) {
      if (el instanceof HTMLElement && el.hasAttribute('data-tag')) { existingTagId = el.getAttribute('data-tag'); break }
      el = el.parentElement
    }
    let resolvedTagId = existingTagId
    if (existingTagId) {
      const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', existingTagId).catch(() => [])
      if ((targets || []).length > 0) {
        toast('Linked words cannot have direct attachments', 'error')
        return
      }
    } else {
      const created = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign.id, activeId).catch(() => null)
      const tid = created?.tagId as string | undefined
      if (!tid) return
      replaceSelectionWithSpan(selected, tid, isLinkLastWordMode)
      resolvedTagId = tid
      setDesc(htmlToDesc(editorRef.current!))
    }
    const pick = await window.ipcRenderer.invoke('gamedocs:choose-attachment-file').catch(() => null)
    if (!pick?.path) return
    if (!resolvedTagId) return
    const added = await window.ipcRenderer.invoke('gamedocs:add-attachment', { tagId: resolvedTagId, sourcePath: pick.path, name: null, ownerObjectId: activeId, gameId: campaign.id }).catch((e: any) => {
      toast(e?.message || 'Failed adding word attachment', 'error')
      return null
    })
    if (added) toast('Word attachment added', 'success')
  }, [activeId, activeLocked, campaign, isLinkLastWordMode])

  const handleSelectPathChoice = useCallback(async (pc: { id: string; name: string; path: string }) => {
    const createdNew = !linkerTagId
    let tid = linkerTagId
    if (!tid) {
      const ownerId = activeId || root?.id
      if (!ownerId) return
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id, ownerId)
      tid = res.tagId
      setLinkerTagId(tid)
    }
    if (!tid) return
    await ensureWordAttachmentTransition(tid, pc.id)
    await window.ipcRenderer.invoke('gamedocs:add-link-target', tid, pc.id)
    if (createdNew) {
    replaceSelectionWithSpan(linkerInput || pc.name, tid, isLinkLastWordMode)
    }
    setShowLinker(false)
  }, [activeId, campaign, linkerInput, linkerTagId, isLinkLastWordMode, ensureWordAttachmentTransition, root?.id])

  const handleSelectMatch = useCallback(async (m: { id: string; name: string }) => {
    const same = await window.ipcRenderer.invoke('gamedocs:get-objects-by-name-with-paths', campaign!.id, m.name)
    if ((same || []).length > 1) {
      setPathChoices(same || [])
      return
    }
    const createdNew = !linkerTagId
    let tid = linkerTagId
    if (!tid) {
      const ownerId = activeId || root?.id
      if (!ownerId) return
      const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id, ownerId)
      tid = res.tagId
      setLinkerTagId(tid)
    }
    if (!tid) return
    await ensureWordAttachmentTransition(tid, m.id)
    await window.ipcRenderer.invoke('gamedocs:add-link-target', tid, m.id)
    if (createdNew) {
    replaceSelectionWithSpan(linkerInput || m.name, tid, isLinkLastWordMode)
    }
    setShowLinker(false)
  }, [activeId, campaign, linkerInput, linkerTagId, isLinkLastWordMode, ensureWordAttachmentTransition, root?.id])

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
        const cleaned = normalizeTemplateSpacing(await removeMissingTags(text))
        // Use loaded value directly if settings have loaded, otherwise use current state
        const stylingEnabledToUse = settingsLoadedRef.current ? loadedStylingEnabledRef.current : toggleStylingOptions
        editorRef.current.innerHTML = descToHtml(cleaned, descToHtmlOpts(stylingEnabledToUse))
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
    try {
      await loadObjectScopedData(obj.id)
    } catch {
      setAttachments([])
      setTemplateInstances([])
    }
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
  
  

  /** Builds the DescToHtmlOptions object from current component state.
   *  Pass `forceStyled` to override the styling toggle (used when the setting
   *  has just been loaded from storage but React state hasn't updated yet). */
  const descToHtmlOpts = (forceStyled?: boolean): DescToHtmlOptions => ({
    stylingEnabled: forceStyled !== undefined ? forceStyled : toggleStylingOptions,
    templateInstances,
    showTemplateFieldLabels,
  })
  // htmlToDesc — imported from editor/descSerializer.ts
  async function handleGoToParent() {
    let parent = await window.ipcRenderer.invoke('gamedocs:get-parent', campaign!.id, activeId || root!.id) as { id: string; name: string }
    if (parent) selectObject(parent.id, parent.name)
  }
  async function handleGoToSibling(step: -1 | 1) {
    if (!campaign || !root) return
    const currentId = activeId || root.id
    const parent = await window.ipcRenderer.invoke('gamedocs:get-parent', campaign.id, currentId).catch(() => null) as { id: string; name: string } | null
    const siblings = await window.ipcRenderer.invoke('gamedocs:list-children', campaign.id, parent?.id || null).catch(() => []) as Array<{ id: string; name: string }>
    if (!siblings.length) return
    const idx = siblings.findIndex(s => s.id === currentId)
    if (idx < 0) return
    const nextIdx = idx + step
    if (nextIdx < 0 || nextIdx >= siblings.length) {
      toast(step < 0 ? 'No previous sibling' : 'No next sibling', 'info')
      return
    }
    const target = siblings[nextIdx]
    if (target) {
      selectObject(target.id, target.name)
    }
  }
  function handleGoToPreviousSibling() {
    void handleGoToSibling(-1)
  }
  function handleGoToNextSibling() {
    void handleGoToSibling(1)
  }
  function handleLinkLastWord() {
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
      
    }
  }

  function insertTemplateMarkerAtSelection(marker: string) {
    const editor = editorRef.current
    if (!editor) return
    const sel = window.getSelection()
    let range: Range | null = null

    if (sel && sel.rangeCount > 0) {
      const candidate = sel.getRangeAt(0)
      if (editor.contains(candidate.startContainer)) {
        range = candidate.cloneRange()
      }
    }

    if (!range && selectionRangeRef.current && editor.contains(selectionRangeRef.current.startContainer)) {
      range = selectionRangeRef.current.cloneRange()
    }

    let usedFallbackToEnd = false
    // If we don't have an editor-local selection, append to the end of editor content.
    if (!range) {
      range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      usedFallbackToEnd = true
    }

    range.deleteContents()
    const textNode = document.createTextNode(marker)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.collapse(true)
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
    selectionRangeRef.current = range.cloneRange()

    const next = normalizeTemplateSpacing(htmlToDesc(editor))
    setDesc(next)
    // Re-render immediately so template markers become cards instead of visible raw tokens.
    editor.innerHTML = descToHtml(next, descToHtmlOpts())
    if (usedFallbackToEnd) {
      toast('Template inserted at end of editor (selection was not in editor)', 'info')
    }
  }

  const handleInsertTemplateInstance = useCallback(async (tpl: TemplateDef) => {
    if (!activeId) return
    const fields = normalizeTemplateFields(parseTemplateMeta(tpl.fields_json || '[]').fields as any[])
    const values: Record<string, string> = {}
    for (const f of fields) {
      if (f.type !== 'div') values[f.label] = ''
    }
    const created = await window.ipcRenderer.invoke('gamedocs:create-template-instance', activeId, tpl.id, JSON.stringify(values)).catch(() => null)
    const instanceId = created?.id as string | undefined
    if (!instanceId) return
    insertTemplateMarkerAtSelection(`{{tpl:${instanceId}}}`)
    await loadObjectScopedData(activeId)
    setTemplatePickerOpen(false)
    toast('Template inserted', 'success')
  }, [activeId, loadObjectScopedData, normalizeTemplateFields, parseTemplateMeta])

  // removeMissingTags — imported from editor/descSerializer.ts
  if (error) return <div className="pad-16 text-red">{error}</div>
  if (!campaign) return <div className="pad-16">Loading…</div>

  // createOverlayClickHandler — imported from editor/overlayUtils.ts
  function getIconForType(typeValue: string, typeIcon?: string) {
    const resolvedIcon = String(typeIcon || getTypeByValue(typeValue)?.icon || '').trim()
    if (resolvedIcon) return <span className="icon-container"><i className={resolvedIcon}></i></span>
    switch ((typeValue || '').toLowerCase()) {
      case 'place': return <span className="icon-container"><i className="ri-map-pin-2-line"></i></span>
      case 'person': return <span className="icon-container"><i className="ri-user-line"></i></span>
      case 'lore': return <span className="icon-container"><i className="ri-quill-pen-ai-line"></i></span>
      default: return <span className="icon-container"><i className="ri-route-line"></i></span>
    }
  }


  function handleBoldFormatting() {
    applyInlineStyle('bold')
  }

  function handleItalicFormatting(e: React.MouseEvent<HTMLDivElement>) {
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
    
    console.log('[applyInlineStyle] Starting:', {
      styleName,
      range: range ? {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
        startContainerType: range.startContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE',
        endContainerType: range.endContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE',
        startText: range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer as Text).data.substring(0, 50) : null,
        endText: range.endContainer.nodeType === Node.TEXT_NODE ? (range.endContainer as Text).data.substring(0, 50) : null,
        selectedText: range.toString().substring(0, 100),
      } : null,
    })
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
    
    console.log('[applyInlineStyle] Segments found:', {
      segmentCount: segments.length,
      segments: segments.map((seg, idx) => ({
        index: idx,
        startContainer: seg.startContainer,
        startOffset: seg.startOffset,
        endContainer: seg.endContainer,
        endOffset: seg.endOffset,
        startContainerType: seg.startContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE',
        endContainerType: seg.endContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE',
        text: seg.toString().substring(0, 50),
      })),
    })
    
    // Helper: check if all text nodes in the selection have the target style
    const selectionHasStyle = (r: Range, styleName: string): boolean => {
      // Check all text nodes in the segments
      for (const seg of segments) {
        let node: Node | null = seg.startContainer
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentElement
        }
        
        // Walk up the tree to find a style span with this style
        let found = false
        while (node && node !== editor) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement
            if ((el.matches('span.styleTag') || el.matches('span.styleTagDisabled')) &&
                el.classList.contains(`style-${styleName}`)) {
              found = true
              break
            }
          }
          node = node.parentElement
        }
        
        if (!found) {
          // At least one segment doesn't have the style
          return false
        }
      }
      
      // All segments have the style
      return segments.length > 0
    }
    
    // Helper: remove style from a range by splitting spans if needed
    const removeStyleFromRange = (r: Range, styleName: string): void => {
      console.log('[applyInlineStyle] removeStyleFromRange called:', {
        styleName,
        rangeText: r.toString().substring(0, 50),
      })
      
      // Find all style spans with this style that intersect the range
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT)
      const styleSpans: Array<{ span: HTMLElement; spanRange: Range }> = []
      
      let node: Node | null = walker.currentNode
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement
          if ((el.matches('span.styleTag') || el.matches('span.styleTagDisabled')) &&
              el.classList.contains(`style-${styleName}`)) {
            // Check if this span intersects with the range
            // Check if range's containers are within this span
            const rangeStartInSpan = el.contains(r.startContainer) || el === r.startContainer
            const rangeEndInSpan = el.contains(r.endContainer) || el === r.endContainer
            
            // Create a range for the span to compare with selection range
            const spanRange = document.createRange()
            spanRange.selectNodeContents(el)
            
            // Check if the span intersects with the selection range using boundary comparison
            // Ranges intersect if: range start is before span end AND range end is after span start
            const rangeStartBeforeSpanEnd = r.compareBoundaryPoints(Range.START_TO_END, spanRange) < 0
            const rangeEndAfterSpanStart = r.compareBoundaryPoints(Range.END_TO_START, spanRange) > 0
            const rangesOverlap = rangeStartBeforeSpanEnd && rangeEndAfterSpanStart
            
            // Also check if range is entirely within span or span is entirely within range
            const rangeStartAfterSpanStart = r.compareBoundaryPoints(Range.START_TO_START, spanRange) >= 0
            const rangeEndBeforeSpanEnd = r.compareBoundaryPoints(Range.END_TO_END, spanRange) <= 0
            const rangeEntirelyInSpan = rangeStartAfterSpanStart && rangeEndBeforeSpanEnd
            
            const spanStartAfterRangeStart = r.compareBoundaryPoints(Range.START_TO_START, spanRange) <= 0
            const spanEndBeforeRangeEnd = r.compareBoundaryPoints(Range.END_TO_END, spanRange) >= 0
            const spanEntirelyInRange = spanStartAfterRangeStart && spanEndBeforeRangeEnd
            
            const intersects = rangeStartInSpan || rangeEndInSpan || rangesOverlap || rangeEntirelyInSpan || spanEntirelyInRange
            
            console.log('[removeStyleFromRange] Checking span:', {
              span: el,
              className: el.className,
              spanText: spanRange.toString().substring(0, 30),
              rangeText: r.toString().substring(0, 30),
              rangeStartInSpan,
              rangeEndInSpan,
              rangesOverlap,
              rangeEntirelyInSpan,
              spanEntirelyInRange,
              intersects,
            })
            
            if (intersects) {
              styleSpans.push({ span: el, spanRange })
            }
          }
        }
        node = walker.nextNode()
      }
      
      console.log('[removeStyleFromRange] Found style spans:', styleSpans.length)
      
      // Process each style span (from end to start to preserve offsets)
      for (let i = styleSpans.length - 1; i >= 0; i--) {
        const { span, spanRange } = styleSpans[i]
        const parent = span.parentNode
        if (!parent) continue
        
        // Compare range boundaries to determine the case
        const startCompare = r.compareBoundaryPoints(Range.START_TO_START, spanRange)
        const endCompare = r.compareBoundaryPoints(Range.END_TO_END, spanRange)
        
        console.log('[applyInlineStyle] Processing span:', {
          className: span.className,
          startCompare,
          endCompare,
          rangeStart: r.toString().substring(0, 20),
          spanStart: spanRange.toString().substring(0, 20),
        })
        
        // Case 1: Entire span is included in selection - remove completely
        if (startCompare <= 0 && endCompare >= 0) {
          console.log('[applyInlineStyle] Case 1: Entire span in selection - removing')
          
          // Check if span has other styles
          const hasOtherStyles = Array.from(span.classList).some(cls => 
            cls.startsWith('style-') && cls !== `style-${styleName}`
          )
          
          if (hasOtherStyles) {
            // Has other styles - just remove this style class
            span.classList.remove(`style-${styleName}`)
          } else {
            // No other styles - unwrap the span completely
            const nextSibling = span.nextSibling
            while (span.firstChild) {
              parent.insertBefore(span.firstChild, span)
            }
            span.remove()
          }
        }
        // Case 2: Selection is at one end - shorten the span
        else if (startCompare > 0 && endCompare >= 0) {
          // Selection starts after span start, ends at or after span end
          // Shorten span from the end
          console.log('[applyInlineStyle] Case 2: Selection at end - shortening from end')
          
          const beforeRange = document.createRange()
          beforeRange.setStart(spanRange.startContainer, spanRange.startOffset)
          beforeRange.setEnd(r.startContainer, r.startOffset)
          
          const beforeContent = beforeRange.extractContents()
          const selectedContent = r.extractContents()
          
          // Remove the original span
          const nextSibling = span.nextSibling
          span.remove()
          
          // Insert before content with style (if any)
          if (beforeContent.textContent && beforeContent.textContent.trim().length > 0) {
            const beforeSpan = span.cloneNode(true) as HTMLElement
            beforeSpan.appendChild(beforeContent)
            parent.insertBefore(beforeSpan, nextSibling)
          }
          
          // Insert selected content without style
          if (selectedContent.textContent && selectedContent.textContent.trim().length > 0) {
            const fragment = document.createDocumentFragment()
            fragment.appendChild(selectedContent)
            parent.insertBefore(fragment, nextSibling)
          }
        }
        else if (startCompare <= 0 && endCompare < 0) {
          // Selection starts at or before span start, ends before span end
          // Shorten span from the start
          console.log('[applyInlineStyle] Case 2: Selection at start - shortening from start')
          
          const afterRange = document.createRange()
          afterRange.setStart(r.endContainer, r.endOffset)
          afterRange.setEnd(spanRange.endContainer, spanRange.endOffset)
          
          const selectedContent = r.extractContents()
          const afterContent = afterRange.extractContents()
          
          // Remove the original span
          const nextSibling = span.nextSibling
          span.remove()
          
          // Insert selected content without style
          if (selectedContent.textContent && selectedContent.textContent.trim().length > 0) {
            const fragment = document.createDocumentFragment()
            fragment.appendChild(selectedContent)
            parent.insertBefore(fragment, nextSibling)
          }
          
          // Insert after content with style (if any)
          if (afterContent.textContent && afterContent.textContent.trim().length > 0) {
            const afterSpan = span.cloneNode(true) as HTMLElement
            afterSpan.appendChild(afterContent)
            parent.insertBefore(afterSpan, nextSibling)
          }
        }
        // Case 3: Selection is in the middle - split into two spans
        else if (startCompare > 0 && endCompare < 0) {
          // Selection is entirely within span - split into two
          console.log('[applyInlineStyle] Case 3: Selection in middle - splitting into two')
          
          const beforeRange = document.createRange()
          beforeRange.setStart(spanRange.startContainer, spanRange.startOffset)
          beforeRange.setEnd(r.startContainer, r.startOffset)
          
          const selectionRange = r.cloneRange()
          
          const afterRange = document.createRange()
          afterRange.setStart(r.endContainer, r.endOffset)
          afterRange.setEnd(spanRange.endContainer, spanRange.endOffset)
          
          // Extract in reverse order: after, selection, before
          const afterContent = afterRange.extractContents()
          const selectedContent = selectionRange.extractContents()
          const beforeContent = beforeRange.extractContents()
          
          // Remove the original span
          const nextSibling = span.nextSibling
          span.remove()
          
          // Insert parts back in correct order: before, selection, after
          if (beforeContent.textContent && beforeContent.textContent.trim().length > 0) {
            const beforeSpan = span.cloneNode(true) as HTMLElement
            beforeSpan.appendChild(beforeContent)
            parent.insertBefore(beforeSpan, nextSibling)
          }
          
          if (selectedContent.textContent && selectedContent.textContent.trim().length > 0) {
            const fragment = document.createDocumentFragment()
            fragment.appendChild(selectedContent)
            parent.insertBefore(fragment, nextSibling)
          }
          
          if (afterContent.textContent && afterContent.textContent.trim().length > 0) {
            const afterSpan = span.cloneNode(true) as HTMLElement
            afterSpan.appendChild(afterContent)
            parent.insertBefore(afterSpan, nextSibling)
          }
        }
      }
    }
    
    // Check if the selection already has this style
    const hasStyle = selectionHasStyle(range, styleName)
    
    console.log('[applyInlineStyle] Checking if selection has style:', {
      styleName,
      hasStyle,
      segmentCount: segments.length,
    })
    
    if (hasStyle) {
      // Selection has the style - remove it (toggle off)
      console.log('[applyInlineStyle] Removing style from selection')
      removeStyleFromRange(range, styleName)
    } else {
      // Apply style wrappers from end to start to preserve offsets
      // Only apply to the exact selected segments, don't merge adjacent segments
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i]
        const wrapper = document.createElement('span')
        const baseClass = toggleStylingOptions ? 'styleTag' : 'styleTagDisabled'
        wrapper.className = `${baseClass} style-${styleName}`
        const contents = seg.extractContents()
        
        console.log('[applyInlineStyle] Applying style to segment:', {
          index: i,
          segmentText: seg.toString().substring(0, 50),
          contentsNodes: Array.from(contents.childNodes).map(n => ({
            nodeType: n.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE',
            text: n.nodeType === Node.TEXT_NODE ? (n as Text).data.substring(0, 50) : (n as HTMLElement).tagName,
          })),
        })
        
        wrapper.appendChild(contents)
        seg.insertNode(wrapper)
      }
    }
    
    console.log('[applyInlineStyle] After applying styles, HTML:', {
      html: editor.innerHTML.substring(0, 500),
    })
    const newRange = document.createRange()
    newRange.setStart(range.endContainer, range.endOffset)
    newRange.collapse(true)
    if (sel) { sel.removeAllRanges(); sel.addRange(newRange) }
    setCtxMenu(m => ({ ...m, visible: false }))
    setDesc(htmlToDesc(editor))
  }

  function handleUnderlineFormatting() {
    applyInlineStyle('underline')
  }

  function handleHeadingFormatting() {
    applyInlineStyle('h1')
  }

  function handleCodeFormatting() {
    applyInlineStyle('code')
  }

  function handleRedactedFormatting() {
    applyInlineStyle('redacted')
  }

  function handleStrikethroughFormatting() {
    applyInlineStyle('strike')
  }

  function handleQuoteFormatting() {
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
    // Preserves link tags (span[data-tag]) that are inside style tags
    const unwrapNestedStylesInRange = (container: Node, r: Range): void => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
      const toUnwrap: HTMLElement[] = []
      let node: Node | null = walker.firstChild()
      
      while (node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement
          // Only unwrap style tags, never unwrap link tags
          if ((el.matches('span.styleTag') || el.matches('span.styleTagDisabled')) && !el.hasAttribute('data-tag')) {
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
        // When unwrapping, preserve any link tags inside the style tag
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
      
      // If parent is a link tag, preserve the link structure
      // Just unwrap the style but keep all content inside the link tag
      if (parent instanceof HTMLElement && parent.hasAttribute('data-tag')) {
        unwrapNestedStylesInRange(span, range)
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span)
        }
        parent.removeChild(span)
        return
      }
      
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
      
      // If parent is a link tag, we need to preserve it
      const isInsideLinkTag = parent instanceof HTMLElement && parent.hasAttribute('data-tag')
      
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
      // Preserves link tags (span[data-tag]) that are inside style tags
      const unwrapStylesInFragment = (frag: DocumentFragment): void => {
        const styleSpans = Array.from(frag.querySelectorAll('span.styleTag, span.styleTagDisabled')) as HTMLElement[]
        // Filter out any elements that are actually link tags (shouldn't happen, but be safe)
        const actualStyleSpans = styleSpans.filter(s => !s.hasAttribute('data-tag'))
        // Sort from innermost to outermost
        actualStyleSpans.sort((a, b) => {
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
        for (const styleSpan of actualStyleSpans) {
          const styleParent = styleSpan.parentNode
          if (!styleParent) continue
          // When unwrapping, preserve any link tags inside the style tag
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
        // Insert into parent (which is the link tag if isInsideLinkTag is true)
        parent.insertBefore(beforeSpan, currentInsertPoint)
        currentInsertPoint = beforeSpan.nextSibling
      }

      // Insert selected part (plain) if has content
      if (selectedContent && hasTextContent(selectedContent)) {
        const fragment = document.createDocumentFragment()
        while (selectedContent.firstChild) {
          fragment.appendChild(selectedContent.firstChild)
        }
        // Insert into parent (which is the link tag if isInsideLinkTag is true)
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
        // Insert into parent (which is the link tag if isInsideLinkTag is true)
        if (currentInsertPoint) {
          parent.insertBefore(afterSpan, currentInsertPoint)
        } else {
          parent.appendChild(afterSpan)
        }
      }
    }

    // Find all style spans that intersect with the selection
    // Exclude any spans that have data-tag attribute (those are link tags, not style tags)
    const allStyleSpans = Array.from(editor.querySelectorAll('span.styleTag, span.styleTagDisabled')) as HTMLElement[]
    const intersectingSpans: HTMLElement[] = []

    for (const span of allStyleSpans) {
      // Only process actual style tags, not link tags that might have style classes
      if (!span.hasAttribute('data-tag') && intersectsRange(span, range)) {
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
                  const target = e.target as HTMLElement
                  const childItem = target.closest('.child-item') as HTMLElement
                  if (childItem) {
                    const childId = childItem.getAttribute('data-child-id')
                    if (childId) {
                      const state = childItemMouseStateRef.current.get(childId) || { mouseDownOnItem: false, hasMoved: false, startX: 0, startY: 0, startItemId: '' }
                      state.mouseDownOnItem = true
                      state.hasMoved = false
                      state.startX = e.clientX
                      state.startY = e.clientY
                      state.startItemId = childId
                      childItemMouseStateRef.current.set(childId, state)
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
                          state.hasMoved = true
                        }
                      }
                    }
                  }
                }}
                onMouseUp={(e) => {
                  const target = e.target as HTMLElement
                  const childItem = target.closest('.child-item') as HTMLElement
                  if (childItem) {
                    const childId = childItem.getAttribute('data-child-id')
                    if (childId) {
                      const state = childItemMouseStateRef.current.get(childId)
                      
                      // Check if mouse down and mouse up happened on the same item
                      const sameItem = state && state.startItemId === childId
                      
                      if (state && state.mouseDownOnItem && sameItem) {
                        if(e.button == 0){ 
                          selectObject(childId, childItem.textContent || '') 
                        } else if(e.button == 2){ 
                          handleShowChildContextMenu(e, childId, childItem.textContent || '') 
                        }
                      }
                      if (state) {
                        state.mouseDownOnItem = false
                        state.hasMoved = false
                        state.startItemId = ''
                      }
                    }
                  }
                }}
              >
                {children.map(c => {
                  return (
                    <div 
                      key={c.id} 
                      className="child-item"
                      data-child-id={c.id}
                    >
                      {getIconForType((c.type_id as string) || c.type, c.type_icon)}
                      {c.name}
                      {c.type_hidden ? <i className="ri-eye-off-line" title="Type hidden for this campaign" style={{ marginLeft: 6, opacity: 0.75 }}></i> : null}
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
            onDragOver={(e) => {
              const hasFiles = !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'))
              if (hasFiles && !activeLocked) e.preventDefault()
            }}
            onDrop={async (e) => {
              const hasFiles = !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'))
              if (!hasFiles || activeLocked) return
              e.preventDefault()
              await handleDropObjectAttachments(e.dataTransfer?.files || null)
            }}
            onContextMenu={handleEditorContextMenu}
            onMouseMove={(e) => {
              const target = e.target as HTMLElement
              // Find the link span, even if target is a style tag inside it or contains it
              let span: HTMLElement | null = null
              if (target) {
                // Check if target itself is a link tag
                if (target.hasAttribute && target.hasAttribute('data-tag')) {
                  span = target
                } else {
                  // Check parent chain first
                  let current: HTMLElement | null = target.parentElement
                  while (current) {
                    if (current.hasAttribute('data-tag')) {
                      span = current
                      break
                    }
                    current = current.parentElement
                  }
                  // If not found in parents, check if target or any parent contains a link tag
                  if (!span) {
                    let checkEl: HTMLElement | null = target
                    while (checkEl && checkEl !== editorRef.current) {
                      const linkTag = checkEl.querySelector('span[data-tag]') as HTMLElement | null
                      if (linkTag) {
                        span = linkTag
                        break
                      }
                      checkEl = checkEl.parentElement
                    }
                  }
                }
              }
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
                if (!Array.isArray(targets) || targets.length > 1) {
                  if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                  return
                }
                const pad = 10
                const CARD_W = 300
                const baseX = anchorX
                const baseY = anchorY + 10 + 30
                const targetX = baseX - (CARD_W / 2)
                const nx = Math.max(pad, Math.min(targetX, window.innerWidth - pad - CARD_W))
                const ny = baseY

                // Linked tag -> show linked object preview
                if (targets.length === 1) {
                  const only = targets[0]
                  const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', only.id).catch(() => null) as { id: string; name: string; snippet: string; fileUrl?: string | null; thumbDataUrl?: string | null; thumbPath?: string | null; imagePath?: string | null } | null
                  if (!preview) return
                  const mainAttachment = (preview as any)?.mainAttachment as { name?: string | null; ext?: string | null } | null
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
                  const attachmentText = mainAttachment ? `\nMain file: ${(mainAttachment.name || '').trim() || ((mainAttachment.ext || '').toUpperCase() || 'FILE')}` : ''
                  setHoverCard({ visible: true, x: nx, y: ny, name: preview.name || only.name, snippet: (preview.snippet || '') + attachmentText, imageUrl: imgUrl })
                  return
                }

                // Unlinked tag -> show word attachment preview
                const rows = await window.ipcRenderer.invoke('gamedocs:list-tag-attachments', tagId).catch(() => []) as Attachment[]
                if (!rows || rows.length === 0) {
                  if (hoverCard.visible) setHoverCard(h => ({ ...h, visible: false }))
                  return
                }
                const first = rows[0]
                let imgUrl: string | null = null
                const mime = String(first.mime || '').toLowerCase()
                const ext = String(first.ext || '').toLowerCase()
                const isImage = mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)
                if (isImage && first.file_path) {
                  const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', first.file_path).catch(() => null)
                  if (res?.ok) imgUrl = res.dataUrl
                }
                const word = (span.textContent || '').trim() || 'Word attachment'
                const names = rows.slice(0, 3).map(r => (r.name || '').trim() || (r.ext || 'file').toUpperCase()).join(', ')
                const more = rows.length > 3 ? ` (+${rows.length - 3} more)` : ''
                setHoverCard({ visible: true, x: nx, y: ny, name: word, snippet: `Attached: ${names}${more}\nRight-click this word to remove attachments.`, imageUrl: imgUrl })
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
              const removeBtn = target.closest('[data-template-remove]') as HTMLElement | null
              if (removeBtn && editorRef.current) {
                const id = removeBtn.getAttribute('data-template-remove') || ''
                const card = removeBtn.closest('[data-template-instance-id]') as HTMLElement | null
                if (card) {
                  card.remove()
                  const next = normalizeTemplateSpacing(htmlToDesc(editorRef.current))
                  setDesc(next)
                  if (id && !next.includes(`{{tpl:${id}}}`)) {
                    await window.ipcRenderer.invoke('gamedocs:delete-template-instance', id).catch(() => null)
                  }
                  if (activeId) await loadObjectScopedData(activeId)
                  toast('Template instance removed', 'success')
                }
                return
              }
              const editBtn = target.closest('[data-template-edit]') as HTMLElement | null
              if (editBtn) {
                const id = editBtn.getAttribute('data-template-edit') || ''
                if (id) openTemplateInstanceEditor(id)
                return
              }
              // Find the link span, even if target is a style tag inside it or contains it
              let span: HTMLElement | null = null
              if (target) {
                // Check if target itself is a link tag
                if (target.hasAttribute && target.hasAttribute('data-tag')) {
                  span = target
                } else {
                  // Check parent chain first
                  let current: HTMLElement | null = target.parentElement
                  while (current) {
                    if (current.hasAttribute('data-tag')) {
                      span = current
                      break
                    }
                    current = current.parentElement
                  }
                  // If not found in parents, check if target or any parent contains a link tag
                  if (!span) {
                    let checkEl: HTMLElement | null = target
                    while (checkEl && checkEl !== editorRef.current) {
                      const linkTag = checkEl.querySelector('span[data-tag]') as HTMLElement | null
                      if (linkTag) {
                        span = linkTag
                        break
                      }
                      checkEl = checkEl.parentElement
                    }
                  }
                }
              }
              if (!span) return
              const tagId = span.getAttribute('data-tag') || ''
              if (!tagId) return
              const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string; path: string }>
              if (!Array.isArray(targets) || targets.length === 0) {
                const rows = await window.ipcRenderer.invoke('gamedocs:list-tag-attachments', tagId).catch(() => []) as Attachment[]
                if (!rows || rows.length === 0) return
                if (rows.length === 1) {
                  await handleOpenWordAttachment(rows[0])
                  return
                }
                setTagMenuWordAttachments(rows)
                setTagMenu({
                  visible: true,
                  x: (e as any).clientX,
                  y: (e as any).clientY,
                  items: rows.map((r, idx) => ({
                    id: `__ATTACHMENT__${r.id}`,
                    name: (r.name || '').trim() || `Attachment ${idx + 1}`,
                    path: (r.ext || '').toUpperCase()
                  })),
                  hoverPreview: null,
                  source: 'tag'
                })
                setHoverCard(h => ({ ...h, visible: false }))
                return
              }
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
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement
              const card = target.closest('[data-template-instance-id]') as HTMLElement | null
              if (card) {
                const id = card.getAttribute('data-template-instance-id') || ''
                if (id) openTemplateInstanceEditor(id)
              }
            }}
            onKeyDown={(e) => {
              // Let browser handle Enter key naturally - no manual BR insertion
              // (Enter handler removed - browser handles it naturally)
              if (e.key === 'Enter') {
                // Do nothing - let browser handle Enter naturally
                return
              }
              
              // Disabled Enter handler code below (kept for reference):
              if (false) {
                e.preventDefault()
                const sel = window.getSelection()
                if (sel && sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0)
                  
                  console.log('[Enter] Before insertion:', {
                    startContainer: range.startContainer,
                    startOffset: range.startOffset,
                    startContainerType: range.startContainer.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE',
                    startContainerText: range.startContainer.nodeType === Node.TEXT_NODE ? (range.startContainer as Text).textContent?.substring(0, 20) : null,
                    parentElement: range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element).tagName : range.startContainer.parentElement?.tagName,
                  })
                  
                  // Insert a visible line break
                  range.deleteContents()
                  const br = document.createElement('br')
                  range.insertNode(br)
                  
                  console.log('[Enter] After BR insertion:', {
                    br: br,
                    brParent: br.parentElement?.tagName,
                    brNextSibling: br.nextSibling,
                    brNextSiblingType: br.nextSibling ? (br.nextSibling.nodeType === Node.TEXT_NODE ? 'TEXT_NODE' : 'ELEMENT_NODE') : null,
                    brNextSiblingText: br.nextSibling && br.nextSibling.nodeType === Node.TEXT_NODE ? (br.nextSibling as Text).textContent?.substring(0, 20) : null,
                    isAtEnd: !br.nextSibling,
                  })
                  
                  // Position caret after the BR (on the new line)
                  // Check if nextSibling is an empty text node - if so, position caret inside it
                  const nextSibling = br.nextSibling
                  const isNextSiblingEmptyText = nextSibling && 
                    nextSibling.nodeType === Node.TEXT_NODE && 
                    (nextSibling as Text).textContent === ''
                  
                  if (!br.nextSibling) {
                    console.log('[Enter] At end - creating empty text node for caret')
                    // Create an empty text node so the caret has a place to sit
                    const emptyText = document.createTextNode('')
                    br.parentNode?.appendChild(emptyText)
                    
                    const newRange = document.createRange()
                    newRange.setStart(emptyText, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    
                    console.log('[Enter] Positioned caret in empty text node:', {
                      emptyText: emptyText,
                      caretOffset: 0,
                    })
                  } else if (isNextSiblingEmptyText) {
                    console.log('[Enter] Next sibling is empty text node - positioning caret inside it')
                    // Position caret inside the empty text node
                    const newRange = document.createRange()
                    newRange.setStart(nextSibling as Text, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    
                    console.log('[Enter] Positioned caret in empty text node:', {
                      emptyText: nextSibling,
                      caretOffset: 0,
                    })
                  } else {
                    console.log('[Enter] Not at end - positioning after BR')
                    const newRange = document.createRange()
                    newRange.setStartAfter(br)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    
                    console.log('[Enter] Positioned caret after BR:', {
                      nextSibling: br.nextSibling,
                    })
                  }
                  
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
                    lastEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
                  } else {
                    cont.scrollTop = cont.scrollHeight
                  }
                }

                

                
                
                return
              }

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
          <ChildContextMenu
            visible={childCtxMenu.visible}
            x={childCtxMenu.x}
            y={childCtxMenu.y}
            selText={childCtxMenu.selText}
            menuRef={childCtxMenuRef as React.RefObject<HTMLDivElement>}
            onDeleteChild={handleDeleteChild}
            onEditChildOpen={handleEditChildOpen}
            onMoveChildOpen={handleMoveChildOpen}
            onClose={() => setChildCtxMenu(m => ({ ...m, visible: false }))}
          />
          <EditorContextMenu
            visible={ctxMenu.visible}
            x={ctxMenu.x}
            y={ctxMenu.y}
            activeStyles={ctxMenu.activeStyles}
            toggleStylingOptions={toggleStylingOptions}
            ctxLinkedTargets={ctxLinkedTargets}
            ctxTagId={ctxTagId}
            ctxTagAttachments={ctxTagAttachments}
            activeLocked={activeLocked}
            menuRef={ctxMenuRef as React.RefObject<HTMLDivElement>}
            hoverCard={hoverCard}
            setCtxTagAttachments={setCtxTagAttachments}
            setHoverCard={setHoverCard}
            setCtxMenu={setCtxMenu}
            onBold={handleBoldFormatting}
            onItalic={() => handleItalicFormatting({} as React.MouseEvent<HTMLDivElement>)}
            onUnderline={handleUnderlineFormatting}
            onStrikethrough={handleStrikethroughFormatting}
            onHeading={handleHeadingFormatting}
            onCode={handleCodeFormatting}
            onQuote={handleQuoteFormatting}
            onRedacted={handleRedactedFormatting}
            onClearFormatting={handleClearFormatting}
            onAddLinkOpen={handleAddLinkOpen}
            onAttachFileToWord={handleAttachFileToWord}
            onEditOpen={handleEditOpen}
            onClearLink={handleClearLink}
            onInsertTemplate={() => setTemplatePickerOpen(true)}
            selectObject={selectObject}
          />

          {/* Left-click tag menu for multi-target links */}
          <TagMenu
            state={tagMenu}
            setState={setTagMenu}
            tagMenuWordAttachments={tagMenuWordAttachments}
            menuRef={tagMenuRef as React.RefObject<HTMLDivElement>}
            activeId={activeId}
            activeName={activeName}
            activeLocked={activeLocked}
            parent={parent}
            root={root}
            campaign={campaign}
            setHasPlaces={setHasPlaces}
            setShowSettings={setShowSettings}
            setShowHelp={setShowHelp}
            setShowMisc={setShowMisc}
            setActiveLocked={setActiveLocked}
            setAddPictureModal={setAddPictureModal}
            setEditName={setEditName}
            setWizardType={setWizardType}
            setOwnerTags={setOwnerTags}
            setIncomingLinks={setIncomingLinks}
            setShowEditObject={setShowEditObject}
            handleBulkMoveOpen={handleBulkMoveOpen}
            handleOpenWordAttachment={handleOpenWordAttachment}
            selectObject={selectObject}
            confirmDialog={confirmDialog}
          />

          {/* Misc Stuff modal: compact context-like options */}
          <MiscModal
            visible={showMisc}
            hasPlaces={hasPlaces}
            activeLocked={activeLocked}
            campaignId={campaign?.id || ''}
            onClose={() => setShowMisc(false)}
            onExportToShare={handleExportToShare}
            onExportToPdf={handleExportToPdf}
            onExportToHtml={handleExportToHtml}
            onListAllItems={handleListAllItems}
          />


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

          {attachments.length > 0 && (
            <div className="images-section">
              <div className="images-title">Files</div>
              <div className="thumb-list">
                {attachments.map(att => (
                  <div key={att.id} className="thumb-card w-200">
                    <div className="thumb-row">
                      <strong title={att.name || ''}>{att.name || '(unnamed)'}</strong>
                      {att.is_main ? <span title='Main file'>⭐</span> : null}
                    </div>
                    <div className="muted">{(att.ext || '').replace('.', '').toUpperCase() || 'FILE'}</div>
                    <div className="justify-between mt-6 items-center">
                      <button onClick={async () => { await handleOpenAttachment(att) }}>Open</button>
                      <button onClick={async () => { await window.ipcRenderer.invoke('gamedocs:delete-attachment', att.id); await loadObjectScopedData(activeId) }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Object modal */}
          <EditObjectModal
            visible={showEditObject}
            editTargetId={editTargetId}
            activeId={activeId}
            editName={editName}
            wizardType={wizardType}
            ownerTags={ownerTags}
            incomingLinks={incomingLinks}
            selectableTypes={getSelectableTypes(wizardType)}
            images={images}
            attachments={attachments}
            safeThumbSrc={safeThumbSrc}
            onNameChange={setEditName}
            onTypeChange={v => setWizardType(v as any)}
            onClose={() => setShowEditObject(false)}
            onSave={async () => {
              const newName = (editName || '').trim()
              const newType = wizardType || ''
              await window.ipcRenderer.invoke('gamedocs:update-object', activeId, { name: newName, type_id: newType })
              setShowEditObject(false)
              if (!editTargetId) {
                selectObject(activeId, editName)
              }
              setEditTargetId(null)
            }}
            onNavigateToObject={(id, name) => { selectObject(id, name); setShowEditObject(false) }}
            onDeleteTag={async (tagId) => {
              await window.ipcRenderer.invoke('gamedocs:delete-link-tag', tagId)
              const ot = await window.ipcRenderer.invoke('gamedocs:list-owner-tags', activeId).catch(() => [])
              setOwnerTags(ot || [])
            }}
            onRemoveIncomingLink={async (tagId, targetId) => {
              await window.ipcRenderer.invoke('gamedocs:remove-link-target', tagId, targetId)
              const inc = await window.ipcRenderer.invoke('gamedocs:list-incoming-links', activeId).catch(() => [])
              setIncomingLinks(inc || [])
            }}
            onOpenImageLightbox={async (filePath) => {
              const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', filePath)
              if (res?.ok) setImageModal({ visible: true, dataUrl: res.dataUrl })
            }}
            onOpenImageExternal={async (filePath) => {
              await window.ipcRenderer.invoke('gamedocs:open-image-external', filePath)
            }}
            onRenameImage={async (id, name) => {
              await window.ipcRenderer.invoke('gamedocs:rename-image', id, name)
            }}
            onSetDefaultImage={async (imageId) => {
              await window.ipcRenderer.invoke('gamedocs:set-default-image', activeId, imageId)
              const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', activeId)
              setImages(imgs || [])
            }}
            onDeleteImage={async (imageId) => {
              await window.ipcRenderer.invoke('gamedocs:delete-image', imageId)
              const imgs = await window.ipcRenderer.invoke('gamedocs:list-images', activeId)
              setImages(imgs || [])
            }}
            onOpenAttachment={handleOpenAttachment}
            onSetMainAttachment={async (attId) => {
              await window.ipcRenderer.invoke('gamedocs:set-main-attachment', activeId, attId)
              await loadObjectScopedData(activeId)
            }}
            onDeleteAttachment={async (attId) => {
              await window.ipcRenderer.invoke('gamedocs:delete-attachment', attId)
              await loadObjectScopedData(activeId)
            }}
            onAddAttachment={handleAddObjectAttachment}
          />


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
          <CommandPalette
            visible={showPalette}
            paletteInput={paletteInput}
            isCommandMode={isCommandMode}
            cmdParamMode={cmdParamMode}
            selectedCommand={selectedCommand}
            paletteSelIndex={paletteSelIndex}
            filteredCommands={filteredCommands}
            paletteResults={paletteResults}
            paletteResultsRef={paletteResultsRef as React.RefObject<HTMLDivElement>}
            onInputChange={v => setPaletteInput(v)}
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
                    const choices: any[] = (meta as any).choices || []
                    const term = paletteInput.trim().toLowerCase()
                    const filtered = choices.filter((ch: any) => String(ch).toLowerCase().includes(term))
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
                const totalItems = paletteResults.objects.length + paletteResults.tags.length
                if (totalItems > 0) {
                  const idx = Math.min(Math.max(0, paletteSelIndex), totalItems - 1)
                  if (idx < paletteResults.objects.length) {
                    const obj = paletteResults.objects[idx]
                    setShowPalette(false)
                    selectObject(obj.id, obj.name)
                  }
                }
              }
            }}
            onClose={() => setShowPalette(false)}
            onSelectObject={(id, name) => { setShowPalette(false); selectObject(id, name) }}
            runCommand={runCommand}
            beginParamMode={beginParamMode}
            commitParam={commitParam}
            setPaletteSelIndex={setPaletteSelIndex}
            getParamMeta={getParamMeta}
          />


          {/* Fullscreen image modal */}
          <ImageModal
            visible={imageModal.visible}
            dataUrl={imageModal.dataUrl}
            onClose={() => setImageModal({ visible: false, dataUrl: null })}
          />
          
          <PdfModal
            visible={pdfModal.visible}
            filePath={pdfModal.filePath}
            name={pdfModal.name}
            onClose={() => setPdfModal({ visible: false, dataUrl: null, filePath: null, name: '' })}
          />
          
          <HelpModal
            visible={showHelp}
            shortcuts={shortcuts}
            getProperShortcutName={getProperShortcutName}
            getProperShortcutValue={getProperShortcutValue}
            onClose={() => setShowHelp(false)}
          />


          {/* Settings modal */}
          <SettingsModal
            visible={showSettings}
            paletteKey={paletteKey}
            customColors={customColors}
            fonts={fonts}
            customFont={customFont}
            shortcuts={shortcuts}
            hoverDebounce={hoverDebounce}
            sidebarWidth={sidebarWidth}
            toggleStylingOptions={toggleStylingOptions}
            exportTemplateStyled={exportTemplateStyled}
            showTemplateFieldLabels={showTemplateFieldLabels}
            pdfInlinePreferred={pdfInlinePreferred}
            templateDefs={templateDefs}
            templateRawMode={templateRawMode}
            campaignId={campaign?.id || ''}
            setPaletteKey={setPaletteKey}
            setCustomColors={setCustomColors}
            setFonts={setFonts}
            setShortcuts={setShortcuts}
            setHoverDebounce={setHoverDebounce}
            setSidebarWidth={setSidebarWidth}
            setToggleStylingOptions={setToggleStylingOptions}
            setExportTemplateStyled={setExportTemplateStyled}
            setShowTemplateFieldLabels={setShowTemplateFieldLabels}
            setPdfInlinePreferred={setPdfInlinePreferred}
            applyPalette={applyPalette}
            applyFonts={applyFonts}
            onClose={() => setShowSettings(false)}
            onSave={async () => {
              const payload = { key: paletteKey, colors: paletteKey === 'custom' ? customColors : null }
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.palette', payload)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.fonts', fonts)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.shortcuts', shortcuts)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.hoverDebounce', hoverDebounce)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.sidebarWidth', sidebarWidth)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.stylingEnabled', toggleStylingOptions)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.exportStyledTemplates', exportTemplateStyled)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.templateShowFieldLabels', showTemplateFieldLabels)
              await window.ipcRenderer.invoke('gamedocs:set-setting', 'ui.pdfInlinePreferred', pdfInlinePreferred)
              applyPalette(paletteKey, paletteKey === 'custom' ? customColors : null)
              applyFonts(fonts)
              setShowSettings(false)
            }}
            onOpenTypeManager={() => { setShowSettings(false); setShowTypeManager(true) }}
            onOpenTemplateEditor={openTemplateEditor}
            onOpenTemplateInstanceLibrary={() => setTemplateInstanceLibraryOpen(true)}
            onToggleTemplateMode={toggleTemplateMode}
            onDeleteTemplate={async (id) => { await window.ipcRenderer.invoke('gamedocs:delete-template', id); await loadTemplates() }}
            onChooseFontFile={handleChooseFontFile}
          />


          <TypeManagerModal
            visible={showTypeManager}
            objectTypes={objectTypes}
            campaignId={campaign?.id || ''}
            deleteTypeTarget={deleteTypeTarget}
            deleteTypeReplacementId={deleteTypeReplacementId}
            deleteTypeItems={deleteTypeItems}
            switchTypeTarget={switchTypeTarget}
            switchTypeReplacementId={switchTypeReplacementId}
            setDeleteTypeTarget={setDeleteTypeTarget}
            setDeleteTypeReplacementId={setDeleteTypeReplacementId}
            setDeleteTypeItems={setDeleteTypeItems}
            setSwitchTypeTarget={setSwitchTypeTarget}
            setSwitchTypeReplacementId={setSwitchTypeReplacementId}
            onClose={() => closeTypeManager()}
            onOpenNewTypeEditor={openNewTypeEditor}
            onOpenEditTypeEditor={openEditTypeEditor}
            onRefreshCatalog={refreshTypeCatalog}
            onAfterSwitch={async () => { if (activeId && activeName) await selectObject(activeId, activeName) }}
          />


          <TypeEditorModal
            visible={typeEditorOpen}
            typeEditorIsNew={typeEditorIsNew}
            typeEditorId={typeEditorId}
            typeEditorName={typeEditorName}
            typeEditorIcon={typeEditorIcon}
            typeIconQuery={typeIconQuery}
            typeEditorTags={typeEditorTags}
            typeTagInput={typeTagInput}
            typeTagSuggestions={typeTagSuggestions}
            typeEditorErr={typeEditorErr}
            filteredRemixIcons={filteredRemixIcons}
            objectTypes={objectTypes}
            setTypeEditorName={setTypeEditorName}
            setTypeEditorIcon={setTypeEditorIcon}
            setTypeIconQuery={setTypeIconQuery}
            setTypeEditorTags={setTypeEditorTags}
            setTypeTagInput={setTypeTagInput}
            setTypeEditorErr={setTypeEditorErr}
            addTypeTagDraft={addTypeTagDraft}
            onClose={() => setTypeEditorOpen(false)}
            onSave={async () => {
              const name = typeEditorName.trim()
              if (!name) { setTypeEditorErr('Name is required.'); return }
              const dup = objectTypes.find(t => t.id !== typeEditorId && t.name.trim().toLowerCase() === name.toLowerCase())
              if (dup) { setTypeEditorErr('A type with that name already exists.'); return }
              const payload = { name, icon: typeEditorIcon, tags: typeEditorTags }
              const result = typeEditorIsNew
                ? await window.ipcRenderer.invoke('gamedocs:create-type', payload).catch((err: any) => ({ error: err?.message || 'Failed to create type' }))
                : await window.ipcRenderer.invoke('gamedocs:update-type', typeEditorId, payload).catch((err: any) => ({ error: err?.message || 'Failed to update type' }))
              if ((result as any)?.error) { setTypeEditorErr((result as any).error); return }
              setTypeEditorOpen(false)
              await refreshTypeCatalog()
            }}
          />


          {/* deleteTypeTarget sub-modal — handled inside TypeManagerModal */}

          {/* switchTypeTarget sub-modal — handled inside TypeManagerModal */}

          <TemplateEditorModal
            visible={templateEditorOpen}
            templateEditId={templateEditId}
            templateNameInput={templateNameInput}
            templateSourceInput={templateSourceInput}
            templateCssInput={templateCssInput}
            templateRawMode={templateRawMode}
            templateRawError={templateRawError}
            templateVisualFields={templateVisualFields}
            templateLayoutColumns={templateLayoutColumns}
            templateCardClassInput={templateCardClassInput}
            templateStyleBlocks={templateStyleBlocks}
            templateSelectedFieldId={templateSelectedFieldId}
            templateDragFieldId={templateDragFieldId}
            setTemplateName={setTemplateNameInput}
            setTemplateSource={setTemplateSourceInput}
            setTemplateCss={setTemplateCssInput}
            setTemplateCardClassInput={setTemplateCardClassInput}
            setTemplateStyleBlocks={setTemplateStyleBlocks}
            setTemplateVisualFields={setTemplateVisualFields}
            setTemplateSelectedFieldId={setTemplateSelectedFieldId}
            setTemplateDragFieldId={setTemplateDragFieldId}
            onToggleMode={toggleTemplateMode}
            onAddField={addTemplateField}
            onRemoveField={removeTemplateField}
            onMoveField={moveTemplateField}
            getTemplateChildren={getTemplateChildren}
            onClose={() => setTemplateEditorOpen(false)}
            onSave={saveTemplateDefinition}
          />


          <TemplatePickerModal
            visible={templatePickerOpen}
            templateDefs={templateDefs}
            onInsert={handleInsertTemplateInstance}
            onClose={() => setTemplatePickerOpen(false)}
          />


          <TemplateInstanceLibraryModal
            visible={templateInstanceLibraryOpen}
            rows={templateInstanceLibraryRows}
            activeId={activeId}
            onClose={() => setTemplateInstanceLibraryOpen(false)}
            insertTemplateMarker={insertTemplateMarkerAtSelection}
            loadObjectScopedData={loadObjectScopedData}
            loadTemplateInstanceLibrary={loadTemplateInstanceLibrary}
          />


          <TemplateInstanceEditorModal
            state={templateInstanceEditor}
            setState={setTemplateInstanceEditor}
            activeId={activeId}
            editorRef={editorRef}
            loadObjectScopedData={loadObjectScopedData}
            syncDescFromEditor={() => {
              if (editorRef.current) {
                const next = normalizeTemplateSpacing(htmlToDesc(editorRef.current))
                setDesc(next)
                editorRef.current.innerHTML = descToHtml(next, descToHtmlOpts())
              }
            }}
          />


          {/* Add Child modal */}
          <AddChildModal
            visible={showCat}
            catName={catName}
            catType={catType}
            catDescription={catDescription}
            catErr={catErr}
            ctrlKeyPressed={ctrlKeyPressed}
            selectableTypes={getSelectableTypes(catType)}
            onNameChange={setCatName}
            onTypeChange={v => setCatType(v as any)}
            onDescriptionChange={setCatDescription}
            onCreate={handleCreateChild}
            onCreateAndEnter={handleCreateChildAndEnter}
            onClose={() => setShowCat(false)}
          />


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
                      {getSelectableTypes(wizardType).map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.isHidden ? ' (hidden)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="actions">
                  <button onClick={() => setShowWizard(false)}>Cancel</button>
                  <button onClick={async () => {
                  const label = (wizardName || '').trim()
                    if (!label) return
                    const rootObj = await window.ipcRenderer.invoke('gamedocs:get-root', campaign!.id)
                    const ownerId = activeId || rootObj.id
                    const res = await window.ipcRenderer.invoke('gamedocs:create-object-and-link-tag', campaign!.id, ownerId, ownerId, label, wizardType as string)
                    setShowWizard(false)
                  replaceSelectionWithSpan(label, res.tagId, true)
                  }}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Link to object modal */}
          <LinkerModal
            visible={showLinker}
            linkerInput={linkerInput}
            linkerMatches={linkerMatches}
            pathChoices={pathChoices}
            linkerTagId={linkerTagId}
            linkerSelIndex={linkerSelIndex}
            isLinkLastWordMode={isLinkLastWordMode}
            linkerResultsRef={linkerResultsRef as React.RefObject<HTMLDivElement>}
            onInputChange={async (v) => {
              setLinkerInput(v)
              setPathChoices([])
              if (!v.trim()) { setLinkerMatches(allObjects.slice(0, 10)); return }
              const fuse = fuseRef.current
              if (fuse) {
                const res = fuse.search(v).map((r: any) => r.item).slice(0, 10)
                setLinkerMatches(res)
              }
            }}
            onInputKeyDown={(e) => {
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
                if (el) el.click()
              }
            }}
            onSelectPathChoice={async (pc) => {
              let tid = linkerTagId
              if (!tid) {
                const res = await window.ipcRenderer.invoke('gamedocs:create-link-tag', campaign!.id, activeId || root!.id)
                tid = res.tagId
                setLinkerTagId(tid)
              }
              await ensureWordAttachmentTransition(tid as string, pc.id)
              await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, pc.id)
              replaceSelectionWithSpan(linkerInput || pc.name, tid as string, isLinkLastWordMode)
              setShowLinker(false)
            }}
            onSelectMatch={async (m) => {
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
              await ensureWordAttachmentTransition(tid as string, m.id)
              await window.ipcRenderer.invoke('gamedocs:add-link-target', tid as string, m.id)
              replaceSelectionWithSpan(linkerInput || m.name, tid as string, isLinkLastWordMode)
              setShowLinker(false)
            }}
            onClose={() => { setShowLinker(false); setIsLinkLastWordMode(false) }}
          />


          {/* Bulk Move modal */}
          <BulkMoveModal
            visible={showBulkMoveModal}
            filteredBulkItems={filteredBulkItems}
            allObjectsForBulk={allObjectsForBulk}
            selectedItems={selectedItems}
            bulkNameFilter={bulkNameFilter}
            bulkParentFilter={bulkParentFilter}
            includeDescendants={includeDescendants}
            onNameFilterChange={setBulkNameFilter}
            onParentFilterChange={setBulkParentFilter}
            onIncludeDescendantsChange={setIncludeDescendants}
            onToggleItem={id => setSelectedItems(prev => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })}
            onCancel={handleBulkMoveCancel}
            onNext={handleBulkMoveNext}
          />


          {/* Move modal */}
          <MoveModal
            visible={showMoveModal}
            moveItems={moveItems}
            selectedParent={selectedParent}
            filteredParents={filteredParents}
            parentSearchInput={parentSearchInput}
            onParentSearchChange={setParentSearchInput}
            onSelectParent={setSelectedParent}
            onCancel={handleMoveCancel}
            onConfirm={handleMoveConfirm}
          />

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




