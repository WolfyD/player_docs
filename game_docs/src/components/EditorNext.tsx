import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Plugin } from 'prosemirror-state'
import { escapeHtml, normalizeNewlines, parseTokens } from '../utils/editorTokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Campaign = { id: string; name: string }
type ObjectRow = { id: string; name: string; parent_id: string | null }
type ObjectPayload = { id: string; name: string; description: string | null }
type ImageRow = { id: string; name: string | null; thumb_data_url?: string | null; thumb_url?: string | null; file_url?: string | null }
type AttachmentRow = { id: string; name: string | null; ext?: string | null; mime?: string | null; file_path?: string | null }
type TemplateInstance = {
  id: string
  template_id: string
  template_name: string
  template_fields?: string
  template_source?: string
  template_style?: string | null
  values_json: string
}
type TagToken = { tagId: string; label: string; targetCount: number; targets: Array<{ id: string; name: string }> }
type MainContextMenu = { visible: boolean; x: number; y: number; hasTag: boolean; tagId: string; label: string; templateInstanceId: string }
type HoverPreview = { visible: boolean; x: number; y: number; title: string; snippet: string; imageUrl: string | null }
type TagChooser = { visible: boolean; x: number; y: number; label: string; targets: Array<{ id: string; name: string }> }
type TemplateEditState = { visible: boolean; instanceId: string; templateName: string; values: Record<string, string>; fields: string[] }

// ---------------------------------------------------------------------------
// Module-level callback registry
// This is the bridge between the stateless ProseMirror plugin (defined at
// module level, outside React) and the stateful React component. The component
// sets these references inside a useEffect; the plugin reads them on each event.
// ---------------------------------------------------------------------------

const editorCallbacks = {
  onTagClick:       null as ((tagId: string) => void) | null,
  onContextMenu:    null as ((x: number, y: number, tagId: string, label: string, templateInstanceId: string) => void) | null,
  onTagHoverStart:  null as ((tagId: string, x: number, y: number) => void) | null,
  onTagHoverEnd:    null as (() => void) | null,
  onTemplateEdit:   null as ((instanceId: string) => void) | null,
  onTemplateRemove: null as ((instanceId: string) => void) | null,
}

// ---------------------------------------------------------------------------
// TipTap custom nodes
// ---------------------------------------------------------------------------

/**
 * Inline atom node for [[label|tagId]] link tokens.
 * getAttrs is required: without it TipTap cannot map the kebab-case HTML
 * attributes (tag-id, label) to the camelCase node attributes (tagId, label),
 * and every rendered span ends up with empty data-tag-id / data-label values.
 */
const TagTokenNode = Node.create({
  name: 'tagToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      tagId: { default: '' },
      label: { default: '' },
    }
  },
  parseHTML() {
    return [{
      tag: 'pd-tag-token',
      getAttrs: (dom: Element | string) => {
        if (typeof dom === 'string') return {}
        return {
          tagId: (dom as Element).getAttribute('tag-id') || '',
          label: (dom as Element).getAttribute('label') || '',
        }
      },
    }]
  },
  renderHTML({ HTMLAttributes }) {
    const tagId = String(HTMLAttributes.tagId || '')
    const label = String(HTMLAttributes.label || '')
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'poc-link-tag',
        'data-tag-id': tagId,
        'data-label': label,
        contenteditable: 'false',
      }),
      label || tagId,
    ]
  },
  /**
   * ProseMirror plugin that intercepts DOM events at the editor level.
   * This is necessary because atom nodes consume click/contextmenu/mousemove
   * events before they bubble to any outer React div. handleDOMEvents runs
   * first and lets us call our callback registry instead.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click(_view, event) {
              const el    = event.target as HTMLElement
              const editEl = el.closest('[data-template-edit]')   as HTMLElement | null
              const rmEl   = el.closest('[data-template-remove]') as HTMLElement | null
              const tagEl  = el.closest('[data-tag-id]')          as HTMLElement | null
              if (editEl?.dataset.templateEdit) {
                editorCallbacks.onTemplateEdit?.(editEl.dataset.templateEdit)
                return true
              }
              if (rmEl?.dataset.templateRemove) {
                editorCallbacks.onTemplateRemove?.(rmEl.dataset.templateRemove)
                return true
              }
              if (tagEl?.dataset.tagId) {
                editorCallbacks.onTagClick?.(tagEl.dataset.tagId)
                return true
              }
              return false
            },
            contextmenu(_view, event) {
              const el    = event.target as HTMLElement
              const tagEl = el.closest('[data-tag-id]')     as HTMLElement | null
              const tplEl = el.closest('[data-template-id]') as HTMLElement | null
              event.preventDefault()
              editorCallbacks.onContextMenu?.(
                event.clientX,
                event.clientY,
                tagEl?.dataset.tagId    || '',
                tagEl?.dataset.label    || '',
                tplEl?.dataset.templateId || '',
              )
              return true
            },
            mousemove(_view, event) {
              const el    = event.target as HTMLElement
              const tagEl = el.closest('[data-tag-id]') as HTMLElement | null
              if (tagEl?.dataset.tagId) {
                editorCallbacks.onTagHoverStart?.(tagEl.dataset.tagId, event.clientX, event.clientY)
              } else {
                editorCallbacks.onTagHoverEnd?.()
              }
              return false
            },
            mouseleave(_view, _event) {
              editorCallbacks.onTagHoverEnd?.()
              return false
            },
          },
        },
      }),
    ]
  },
})

/**
 * Inline atom node for {{tpl:instanceId}} template markers.
 * getAttrs is required for the same reason as TagTokenNode above.
 */
const TemplateTokenNode = Node.create({
  name: 'templateToken',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      templateId:      { default: '' },
      templateName:    { default: 'Template' },
      templatePreview: { default: '' },
    }
  },
  parseHTML() {
    return [{
      tag: 'pd-template-token',
      getAttrs: (dom: Element | string) => {
        if (typeof dom === 'string') return {}
        return {
          templateId:      (dom as Element).getAttribute('template-id')      || '',
          templateName:    (dom as Element).getAttribute('template-name')    || 'Template',
          templatePreview: (dom as Element).getAttribute('template-preview') || '',
        }
      },
    }]
  },
  renderHTML({ HTMLAttributes }) {
    const templateId      = String(HTMLAttributes.templateId      || '')
    const templateName    = String(HTMLAttributes.templateName    || 'Template')
    const templatePreview = String(HTMLAttributes.templatePreview || '')
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'poc-template-token',
        'data-template-id': templateId,
        'data-template-node': '1',
        contenteditable: 'false',
      }),
      ['span', { class: 'poc-template-title' }, templateName],
      ['span', { class: 'poc-template-preview' }, templatePreview || `#${templateId.slice(0, 8)}`],
      ['span', { class: 'poc-template-actions' },
        ['button', { type: 'button', 'data-template-edit': templateId }, 'Edit'],
        ['button', { type: 'button', 'data-template-remove': templateId }, 'Remove'],
      ],
    ]
  },
})

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function safeTokenAttr(value: string): string {
  return String(value || '').replace(/"/g, '&quot;')
}

function getTemplatePreview(valuesJson: string): string {
  try {
    const raw = JSON.parse(valuesJson || '{}') as Record<string, unknown>
    const pairs = Object.entries(raw).slice(0, 2)
    if (pairs.length === 0) return ''
    return pairs.map(([k, v]) => `${k}: ${String(v ?? '')}`).join(' | ')
  } catch {
    return ''
  }
}

function descToHtml(desc: string, templatesById: Record<string, TemplateInstance>): string {
  const src = normalizeNewlines(desc || '')
  if (!src.trim()) return '<p><br></p>'
  const safe = escapeHtml(src)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, label, tagId) => {
      return `<pd-tag-token tag-id="${String(tagId)}" label="${String(label)}"></pd-tag-token>`
    })
    .replace(/\{\{tpl:([^}]+)\}\}/g, (_m, instanceId) => {
      const id = String(instanceId)
      const inst = templatesById[id]
      const name = inst?.template_name || 'Template'
      const preview = getTemplatePreview(inst?.values_json || '{}')
      return `<pd-template-token template-id="${id}" template-name="${safeTokenAttr(name)}" template-preview="${safeTokenAttr(preview)}"></pd-template-token>`
    })
  return safe.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('')
}

function htmlToDesc(html: string): string {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  doc.querySelectorAll<HTMLElement>('pd-tag-token, span[data-tag-id]').forEach((el) => {
    const tagId = el.getAttribute('tag-id') || el.dataset.tagId || ''
    const label = el.getAttribute('label') || el.dataset.label || el.textContent || ''
    el.replaceWith(doc.createTextNode(`[[${label}|${tagId}]]`))
  })
  doc.querySelectorAll<HTMLElement>('pd-template-token, span[data-template-id]').forEach((el) => {
    const templateId = el.getAttribute('template-id') || el.dataset.templateId || ''
    el.replaceWith(doc.createTextNode(`{{tpl:${templateId}}}`))
  })
  const blocks = Array.from(doc.body.children)
  if (blocks.length === 0) return (doc.body.textContent || '').trim()
  return blocks.map((el) => (el.textContent || '')).join('\n')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const EditorNext: React.FC = () => {
  const campaignId = useMemo(() => {
    const hash = location.hash || ''
    const m = hash.match(/^#\/editor-next\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]) : ''
  }, [])

  const [campaign, setCampaign]                 = useState<Campaign | null>(null)
  const [objects, setObjects]                   = useState<ObjectRow[]>([])
  const [activeId, setActiveId]                 = useState<string>('')
  const [activeName, setActiveName]             = useState<string>('')
  const [activeDesc, setActiveDesc]             = useState<string>('')
  const [images, setImages]                     = useState<ImageRow[]>([])
  const [attachments, setAttachments]           = useState<AttachmentRow[]>([])
  const [templateInstances, setTemplateInstances] = useState<TemplateInstance[]>([])
  const [tagTokens, setTagTokens]               = useState<TagToken[]>([])
  const [mainContextMenu, setMainContextMenu]   = useState<MainContextMenu>({ visible: false, x: 0, y: 0, hasTag: false, tagId: '', label: '', templateInstanceId: '' })
  const [hoverPreview, setHoverPreview]         = useState<HoverPreview>({ visible: false, x: 0, y: 0, title: '', snippet: '', imageUrl: null })
  const [tagChooser, setTagChooser]             = useState<TagChooser>({ visible: false, x: 0, y: 0, label: '', targets: [] })
  const [templateEdit, setTemplateEdit]         = useState<TemplateEditState>({ visible: false, instanceId: '', templateName: '', values: {}, fields: [] })
  const [allTemplates, setAllTemplates]         = useState<Array<{ id: string; name: string }>>([])
  const [saving, setSaving]                     = useState(false)
  const [saveMsg, setSaveMsg]                   = useState<string>('')
  const hoverTimer      = useRef<number | null>(null)
  const lastHoverTagId  = useRef<string>('')

  const editor = useEditor({
    extensions: [StarterKit, TagTokenNode, TemplateTokenNode],
    content: '<p></p>',
    editorProps: {
      attributes: { class: 'editor-next-surface' },
    },
  })

  // -------------------------------------------------------------------------
  // Load campaign + object list on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!campaignId) return
    ;(async () => {
      const row = await window.ipcRenderer.invoke('gamedocs:get-campaign', campaignId).catch(() => null)
      setCampaign(row || null)
      const root = await window.ipcRenderer.invoke('gamedocs:get-root', campaignId).catch(() => null)
      if (!root?.id) return
      const allRows = await window.ipcRenderer.invoke('gamedocs:list-objects-for-fuzzy', campaignId, 10000).catch(() => [])
      const rows = Array.isArray(allRows) ? allRows : []
      setObjects([{ id: root.id, name: root.name, parent_id: null }, ...rows.filter((r: any) => r.id !== root.id)])
      setActiveId(root.id)
      setActiveName(root.name)
      const templates = await window.ipcRenderer.invoke('gamedocs:list-templates').catch(() => [])
      const templateRows = Array.isArray(templates) ? templates : []
      setAllTemplates(templateRows.map((t: any) => ({ id: String(t.id || ''), name: String(t.name || 'Template') })))
    })()
  }, [campaignId])

  // -------------------------------------------------------------------------
  // Load active object data whenever activeId changes
  // -------------------------------------------------------------------------
  const refreshActiveObject = useCallback(async () => {
    if (!activeId || !editor) return
    const [obj, imgs, atts, tins] = await Promise.all([
      window.ipcRenderer.invoke('gamedocs:get-object', activeId).catch(() => null),
      window.ipcRenderer.invoke('gamedocs:list-images', activeId).catch(() => []),
      window.ipcRenderer.invoke('gamedocs:list-object-attachments', activeId).catch(() => []),
      window.ipcRenderer.invoke('gamedocs:list-template-instances', activeId).catch(() => []),
    ]) as [ObjectPayload | null, ImageRow[], AttachmentRow[], TemplateInstance[]]

    const text = String(obj?.description || '')
    const nextInstances = Array.isArray(tins) ? tins : []
    const templateMap = nextInstances.reduce<Record<string, TemplateInstance>>((acc, row) => {
      acc[row.id] = row
      return acc
    }, {})

    setActiveDesc(text)
    setActiveName(String(obj?.name || 'Object'))
    setImages(Array.isArray(imgs) ? imgs : [])
    setAttachments(Array.isArray(atts) ? atts : [])
    setTemplateInstances(nextInstances)
    editor.commands.setContent(descToHtml(text, templateMap), { emitUpdate: false })
    setSaveMsg('')

    const tokenData = parseTokens(text)
    const seen = new Set<string>()
    const nextTagTokens: TagToken[] = []
    for (const tag of tokenData.tags) {
      if (seen.has(tag.tagId)) continue
      seen.add(tag.tagId)
      const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tag.tagId).catch(() => []) as Array<{ id: string; name: string }>
      nextTagTokens.push({
        tagId:       tag.tagId,
        label:       tag.label,
        targetCount: Array.isArray(targets) ? targets.length : 0,
        targets:     Array.isArray(targets) ? targets.slice(0, 6).map(t => ({ id: t.id, name: t.name })) : [],
      })
    }
    setTagTokens(nextTagTokens)
  }, [activeId, editor])

  useEffect(() => {
    void refreshActiveObject()
  }, [refreshActiveObject])

  // -------------------------------------------------------------------------
  // Tag navigation
  // -------------------------------------------------------------------------
  const openTagTarget = useCallback(async (tagId: string) => {
    const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string }>
    if (!Array.isArray(targets) || targets.length === 0) {
      const taggedAttachments = await window.ipcRenderer.invoke('gamedocs:list-tag-attachments', tagId).catch(() => []) as AttachmentRow[]
      if (Array.isArray(taggedAttachments) && taggedAttachments.length > 0 && taggedAttachments[0].file_path) {
        await window.ipcRenderer.invoke('gamedocs:open-image-external', taggedAttachments[0].file_path).catch(() => false)
        setSaveMsg(`Opened tag attachment (${taggedAttachments.length} file${taggedAttachments.length > 1 ? 's' : ''}).`)
        return
      }
      setSaveMsg(`Tag ${tagId} has no linked object.`)
      return
    }
    if (targets.length === 1) {
      setActiveId(targets[0].id)
      return
    }
    setTagChooser({
      visible: true,
      x: window.innerWidth / 2 - 170,
      y: window.innerHeight / 2 - 150,
      label:   tagId,
      targets,
    })
  }, [])

  // -------------------------------------------------------------------------
  // Wire module-level callback registry to current React state/callbacks.
  // This runs whenever the relevant state/callbacks change so the ProseMirror
  // plugin always calls the latest version of each handler.
  // -------------------------------------------------------------------------
  useEffect(() => {
    editorCallbacks.onTagClick = (tagId) => void openTagTarget(tagId)

    editorCallbacks.onContextMenu = (x, y, tagId, label, templateInstanceId) => {
      setMainContextMenu({ visible: true, x, y, hasTag: Boolean(tagId), tagId, label, templateInstanceId })
    }

    editorCallbacks.onTagHoverStart = (tagId, x, y) => {
      if (lastHoverTagId.current === tagId) return
      lastHoverTagId.current = tagId
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
      hoverTimer.current = window.setTimeout(async () => {
        const targets = await window.ipcRenderer.invoke('gamedocs:list-link-targets', tagId).catch(() => []) as Array<{ id: string; name: string }>
        if (!Array.isArray(targets) || targets.length === 0) return
        const preview = await window.ipcRenderer.invoke('gamedocs:get-object-preview', targets[0].id).catch(() => null) as { name?: string; snippet?: string; thumbDataUrl?: string | null } | null
        setHoverPreview({
          visible:  true,
          x:        x + 14,
          y:        y + 14,
          title:    String(preview?.name    || targets[0].name || 'Linked object'),
          snippet:  String(preview?.snippet || ''),
          imageUrl: preview?.thumbDataUrl   || null,
        })
      }, 130)
    }

    editorCallbacks.onTagHoverEnd = () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
      lastHoverTagId.current = ''
      setHoverPreview({ visible: false, x: 0, y: 0, title: '', snippet: '', imageUrl: null })
    }

    editorCallbacks.onTemplateEdit = (instanceId) => {
      const instance = templateInstances.find(t => t.id === instanceId)
      if (!instance) return
      let values: Record<string, string> = {}
      try {
        const raw = JSON.parse(instance.values_json || '{}') as Record<string, unknown>
        values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '')]))
      } catch { /* keep empty */ }
      let fields = Object.keys(values)
      try {
        const parsed = JSON.parse(instance.template_fields || '[]')
        if (Array.isArray(parsed)) {
          const f = parsed.map((x: any) => String(x?.key || x?.name || x?.id || '')).filter(Boolean)
          if (f.length) fields = f
        }
      } catch { /* keep values keys */ }
      setTemplateEdit({
        visible:      true,
        instanceId,
        templateName: instance.template_name,
        values,
        fields:       fields.length ? fields : ['value'],
      })
    }

    editorCallbacks.onTemplateRemove = (instanceId) => void (async () => {
      await window.ipcRenderer.invoke('gamedocs:delete-template-instance', instanceId).catch(() => false)
      if (editor) {
        const updated = htmlToDesc(editor.getHTML()).replace(new RegExp(`\\{\\{tpl:${instanceId}\\}\\}`, 'g'), '')
        await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, updated)
      }
      await refreshActiveObject()
      setSaveMsg('Template removed.')
    })()

    return () => {
      editorCallbacks.onTagClick       = null
      editorCallbacks.onContextMenu    = null
      editorCallbacks.onTagHoverStart  = null
      editorCallbacks.onTagHoverEnd    = null
      editorCallbacks.onTemplateEdit   = null
      editorCallbacks.onTemplateRemove = null
    }
  }, [openTagTarget, templateInstances, activeId, editor, refreshActiveObject])

  // -------------------------------------------------------------------------
  // Close context menu on any window click
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onClose = () => setMainContextMenu({ visible: false, x: 0, y: 0, hasTag: false, tagId: '', label: '', templateInstanceId: '' })
    window.addEventListener('click', onClose)
    return () => window.removeEventListener('click', onClose)
  }, [])

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------
  const handleSave = async (): Promise<void> => {
    if (!activeId || !editor) return
    setSaving(true)
    setSaveMsg('')
    try {
      const text = htmlToDesc(editor.getHTML())
      await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, text)
      setSaveMsg('Saved')
      setActiveDesc(text)
    } catch (error: any) {
      setSaveMsg(error?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!campaignId) return <div className="pad-16">Missing campaign id in hash route.</div>

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="pad-16" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 10, height: '100vh', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <strong>Editor POC (TipTap)</strong> {campaign ? `- ${campaign.name}` : ''}
          <div className="muted">Experimental route. Existing editor remains unchanged.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => history.back()}>Back</button>
          <button onClick={handleSave} disabled={saving || !activeId}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>

      {/* Three-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 360px', gap: 10, minHeight: 0 }}>

        {/* Left: object list */}
        <div className="boxed" style={{ minHeight: 0, overflow: 'auto' }}>
          <div className="box-title">Objects</div>
          <ul className="list-reset">
            {objects.map(o => (
              <li key={o.id} className="list-item-row">
                <button
                  style={{ width: '100%', textAlign: 'left', borderColor: o.id === activeId ? '#6495ED' : undefined }}
                  onClick={() => setActiveId(o.id)}
                  title={o.id}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Centre: TipTap editor */}
        <div className="boxed" style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 8, minHeight: 0 }}>
          <div className="box-title">{activeName || 'Select object'}</div>
          {/* No onClick/onContextMenu/onMouseMove here — all handled by the ProseMirror plugin */}
          <div style={{ border: '1px solid #333', borderRadius: 8, minHeight: 0, overflow: 'auto', padding: 8 }}>
            <EditorContent editor={editor} />
          </div>
          <div className="muted">{saveMsg || 'Right-click inside editor for actions. Hover over tags for preview.'}</div>
        </div>

        {/* Right: mechanics panel */}
        <div className="boxed" style={{ display: 'grid', gridTemplateRows: 'auto auto auto auto auto 1fr', gap: 8, minHeight: 0 }}>
          <div className="box-title">Mechanics Preview</div>

          <div className="boxed">
            <div className="box-title">Formatting</div>
            <div className="muted">All formatting actions are in the right-click context menu.</div>
          </div>

          <div className="boxed">
            <div className="box-title">Link Tags in Description</div>
            {tagTokens.length === 0 ? <div className="muted">No linked tags found.</div> : (
              <ul className="list-reset">
                {tagTokens.map(tag => (
                  <li key={tag.tagId} className="list-item-row">
                    <button title={tag.tagId} onClick={() => void openTagTarget(tag.tagId)}>{tag.label}</button>
                    <span className="muted">{tag.targetCount} target(s)</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="boxed">
            <div className="box-title">Images</div>
            {images.length === 0 ? <div className="muted">No images.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {images.slice(0, 9).map(img => (
                  <div key={img.id} title={img.name || img.id}>
                    {img.thumb_data_url || img.thumb_url || img.file_url ? (
                      <img src={(img.thumb_data_url || img.thumb_url || img.file_url) || ''} style={{ width: '100%', borderRadius: 6, border: '1px solid #333' }} alt={img.name || ''} />
                    ) : <div className="muted">No preview</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="boxed">
            <div className="box-title">File Attachments</div>
            {attachments.length === 0 ? <div className="muted">No attachments.</div> : (
              <ul className="list-reset">
                {attachments.map(att => (
                  <li key={att.id} className="list-item-row">
                    <span>{att.name || '(unnamed)'}</span>
                    <span className="muted">{att.ext || att.mime || 'file'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="boxed" style={{ minHeight: 0, overflow: 'auto' }}>
            <div className="box-title">Template Instances</div>
            {templateInstances.length === 0 ? <div className="muted">No template instances on this object.</div> : (
              <ul className="list-reset">
                {templateInstances.map(t => (
                  <li key={t.id} className="list-item-row">
                    <span title={t.id}>{t.template_name}</span>
                    <code>{t.id.slice(0, 10)}...</code>
                  </li>
                ))}
              </ul>
            )}
            <div className="muted" style={{ marginTop: 8 }}>Markers in description: {parseTokens(activeDesc).templates.length}</div>
            {allTemplates.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  if (!editor || !activeId || allTemplates.length === 0) return
                  const t = allTemplates[0]
                  const created = await window.ipcRenderer.invoke('gamedocs:create-template-instance', activeId, t.id, '{}').catch(() => null) as { id?: string } | null
                  const id = String(created?.id || '')
                  if (!id) return
                  editor.chain().focus().insertContent(`{{tpl:${id}}}`).run()
                  const text = htmlToDesc(editor.getHTML())
                  await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, text)
                  await refreshActiveObject()
                }}>Insert template (quick test)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main context menu — right-click inside editor */}
      {mainContextMenu.visible ? (
        <div
          style={{ position: 'fixed', left: mainContextMenu.x, top: mainContextMenu.y, zIndex: 10000, background: '#191919', border: '1px solid #333', borderRadius: 8, padding: 8, minWidth: 220 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="muted" style={{ marginBottom: 6 }}>Editor actions</div>
          <div style={{ display: 'grid', gap: 4 }}>
            <button onClick={() => { editor?.chain().focus().toggleBold().run();           setMainContextMenu(m => ({ ...m, visible: false })) }} disabled={!editor}>Bold</button>
            <button onClick={() => { editor?.chain().focus().toggleItalic().run();         setMainContextMenu(m => ({ ...m, visible: false })) }} disabled={!editor}>Italic</button>
            <button onClick={() => { editor?.chain().focus().toggleHeading({ level: 2 }).run(); setMainContextMenu(m => ({ ...m, visible: false })) }} disabled={!editor}>H2</button>
            <button onClick={() => { editor?.chain().focus().toggleBulletList().run();     setMainContextMenu(m => ({ ...m, visible: false })) }} disabled={!editor}>Bullets</button>
            <button onClick={() => { editor?.chain().focus().undo().run();                 setMainContextMenu(m => ({ ...m, visible: false })) }} disabled={!editor}>Undo</button>
            <button onClick={() => { editor?.chain().focus().redo().run();                 setMainContextMenu(m => ({ ...m, visible: false })) }} disabled={!editor}>Redo</button>
            {mainContextMenu.hasTag && (
              <button onClick={() => { void openTagTarget(mainContextMenu.tagId); setMainContextMenu(m => ({ ...m, visible: false })) }}>
                Open tag target
              </button>
            )}
            {mainContextMenu.templateInstanceId && (
              <button onClick={() => {
                editorCallbacks.onTemplateEdit?.(mainContextMenu.templateInstanceId)
                setMainContextMenu(m => ({ ...m, visible: false }))
              }}>Edit template</button>
            )}
            <button onClick={async () => {
              if (!editor || !activeId || allTemplates.length === 0) return
              const t = allTemplates[0]
              const created = await window.ipcRenderer.invoke('gamedocs:create-template-instance', activeId, t.id, '{}').catch(() => null) as { id?: string } | null
              const id = String(created?.id || '')
              if (!id) return
              editor.chain().focus().insertContent(`{{tpl:${id}}}`).run()
              const text = htmlToDesc(editor.getHTML())
              await window.ipcRenderer.invoke('gamedocs:update-object-description', activeId, text)
              await refreshActiveObject()
              setMainContextMenu(m => ({ ...m, visible: false }))
            }}>Insert template marker</button>
          </div>
        </div>
      ) : null}

      {/* Multi-target tag chooser */}
      {tagChooser.visible ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 10001 }}
          onClick={() => setTagChooser({ visible: false, x: 0, y: 0, label: '', targets: [] })}
        >
          <div
            className="boxed"
            style={{ width: 360, maxWidth: '94vw', position: 'fixed', left: tagChooser.x, top: tagChooser.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="box-title">Choose link target ({tagChooser.targets.length})</div>
            <ul className="list-reset">
              {tagChooser.targets.map(t => (
                <li key={t.id} className="list-item-row">
                  <button onClick={() => { setActiveId(t.id); setTagChooser({ visible: false, x: 0, y: 0, label: '', targets: [] }) }}>{t.name}</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Hover preview */}
      {hoverPreview.visible ? (
        <div style={{ position: 'fixed', left: hoverPreview.x, top: hoverPreview.y, zIndex: 9998, width: 260, background: '#1e1e1e', border: '1px solid #333', borderRadius: 8, padding: 8, pointerEvents: 'none' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{hoverPreview.title}</div>
          {hoverPreview.imageUrl ? <img src={hoverPreview.imageUrl} style={{ width: '100%', borderRadius: 6, marginBottom: 6 }} alt="" /> : null}
          <div className="muted">{hoverPreview.snippet || 'No preview text.'}</div>
        </div>
      ) : null}

      {/* Template instance editor modal */}
      {templateEdit.visible ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 10002 }}
          onClick={() => setTemplateEdit({ visible: false, instanceId: '', templateName: '', values: {}, fields: [] })}
        >
          <div
            className="boxed"
            style={{ width: 540, maxWidth: '95vw', position: 'fixed', left: '50%', top: '12%', transform: 'translateX(-50%)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="box-title">Edit Template: {templateEdit.templateName}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {templateEdit.fields.map((key) => (
                <label key={key} style={{ display: 'grid', gap: 4 }}>
                  <span className="muted">{key}</span>
                  <input
                    value={templateEdit.values[key] || ''}
                    onChange={(e) => setTemplateEdit(prev => ({ ...prev, values: { ...prev.values, [key]: e.target.value } }))}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => setTemplateEdit({ visible: false, instanceId: '', templateName: '', values: {}, fields: [] })}>Cancel</button>
              <button onClick={async () => {
                await window.ipcRenderer.invoke('gamedocs:update-template-instance-values', templateEdit.instanceId, JSON.stringify(templateEdit.values)).catch(() => false)
                setTemplateEdit({ visible: false, instanceId: '', templateName: '', values: {}, fields: [] })
                await refreshActiveObject()
              }}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default EditorNext
