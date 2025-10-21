import React, { useEffect, useRef, useState } from 'react'

type Graph = {
  nodes: Array<{ id: string; name: string; depth: number; size: number }>
  edges: Array<{ from: string; to: string; dashed: boolean }>
}

type LayoutNode = {
  id: string
  name: string
  depth: number
  size: number
  x: number
  y: number
  isLeaf: boolean
}

const PlaceMap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [graph, setGraph] = useState<Graph | null>(null)
  const [status, setStatus] = useState<string>('Loading…')
  const [activeId, setActiveId] = useState<string>('')
  const [gameId, setGameId] = useState<string>('')
  const [layout, setLayout] = useState<{ nodes: LayoutNode[]; edges: Graph['edges'] } | null>(null)
  const [view, setView] = useState<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 })
  const dragging = useRef<{ x: number; y: number } | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] || '')
    const gid = q.get('gameId') || ''
    setGameId(gid)
    ;(async () => {
      const g = await (window as any).ipcRenderer.invoke('gamedocs:get-place-graph', gid).catch(() => null) as Graph | null
      if (g && Array.isArray(g.nodes)) { setGraph(g); setStatus(g.nodes.length ? '' : 'No places found') }
      else { setStatus('Failed to load map'); }
    })()
  }, [])

  useEffect(() => {
    if (!graph) return
    // Build parent -> children map using edges (from = child, to = parent)
    const childrenMap = new Map<string, string[]>()
    const incoming = new Map<string, number>()
    for (const e of graph.edges) {
      const arr = childrenMap.get(e.to) || []
      arr.push(e.from)
      childrenMap.set(e.to, arr)
      incoming.set(e.from, (incoming.get(e.from) || 0) + 1)
      if (!incoming.has(e.to)) incoming.set(e.to, incoming.get(e.to) || 0)
    }
    const idToNode = new Map(graph.nodes.map(n => [n.id, n]))
    // Roots are place nodes with no incoming edge
    const roots = graph.nodes.filter(n => (incoming.get(n.id) || 0) === 0)

    const totalSize = roots.reduce((s, n) => s + Math.max(1, n.size), 0)
    const twoPi = Math.PI * 2
    const radiusRoot = 140
    const maxChildStep = 180
    const minChildStep = 50
    const layoutNodes = new Map<string, LayoutNode>()

    function placeNode(id: string, depth: number, start: number, end: number, rParent: number) {
      const node = idToNode.get(id)!
      const mid = (start + end) / 2
      // Parent radius for this node
      const r = depth === 0 ? radiusRoot : rParent
      layoutNodes.set(id, {
        id: node.id,
        name: node.name,
        depth,
        size: node.size,
        x: Math.cos(mid) * r,
        y: Math.sin(mid) * r,
        isLeaf: !(childrenMap.get(id)?.length)
      })
      const kids = (childrenMap.get(id) || [])
      if (kids.length === 0) return
      const sum = kids.reduce((s, cid) => s + Math.max(1, (idToNode.get(cid)?.size || 1)), 0)
      let a = start
      // Compute an average sibling chord at this parent ring and use a fraction for child radial step
      const avgSpan = (end - start) / Math.max(1, kids.length)
      const avgChord = 2 * r * Math.sin(avgSpan / 2)
      const childStep = Math.max(minChildStep, Math.min(maxChildStep, avgChord * 0.6))
      const rChild = r + childStep
      for (const cid of kids) {
        const csize = Math.max(1, (idToNode.get(cid)?.size || 1))
        const span = (end - start) * (csize / sum)
        const cstart = a
        const cend = a + span
        placeNode(cid, depth + 1, cstart, cend, rChild)
        a += span
      }
    }

    // Assign each root a span proportional to its subtree size
    let ang = -Math.PI / 2
    for (const root of roots) {
      const span = twoPi * (Math.max(1, root.size) / Math.max(1, totalSize))
      placeNode(root.id, 0, ang, ang + span, radiusRoot)
      ang += span
    }

    const flat: LayoutNode[] = Array.from(layoutNodes.values())
    setLayout({ nodes: flat, edges: graph.edges })
  }, [graph])

  useEffect(() => {
    const c = canvasRef.current; if (!c || !layout) return
    const ctx = c.getContext('2d')!
    const DPR = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    const W = c.clientWidth, H = c.clientHeight
    c.width = W * DPR; c.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.save()
    ctx.translate(W / 2 + view.x, H / 2 + view.y)
    ctx.scale(view.scale, view.scale)

    // Colors from CSS vars with fallbacks
    const styles = getComputedStyle(document.documentElement)
    const primary = styles.getPropertyValue('--pd-primary').trim() || '#6aa0ff'
    const text = styles.getPropertyValue('--pd-text').trim() || '#e5e5e5'
    const surface = styles.getPropertyValue('--pd-surface').trim() || '#1e1e1e'
    const edgeColor = 'rgba(255,255,255,0.4)'
    const edgeDashColor = 'rgba(255,200,150,0.7)'

    // Edges
    for (const e of layout.edges) {
      const a = layout.nodes.find(n => n.id === e.from)!
      const b = layout.nodes.find(n => n.id === e.to)!
      ctx.beginPath()
      if (e.dashed) { ctx.setLineDash([6, 6]); ctx.strokeStyle = edgeDashColor }
      else { ctx.setLineDash([]); ctx.strokeStyle = edgeColor }
      ctx.lineWidth = 1.5
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // Build parent map for label propagation
    const parent = new Map<string, string>()
    for (const e of layout.edges) parent.set(e.from, e.to)
    // Label policy: always label big clusters; propagate labels up to root; allow zoom to reveal more
    const baseLabelIds = new Set<string>()
    const sizeThreshold = 6
    for (const n of layout.nodes) if (n.size >= sizeThreshold) baseLabelIds.add(n.id)
    // ensure roots labeled
    for (const n of layout.nodes) if (!parent.has(n.id)) baseLabelIds.add(n.id)
    // propagate to ancestors
    const labelIds = new Set<string>(baseLabelIds)
    for (const id of Array.from(baseLabelIds)) {
      let p = parent.get(id)
      let guard = 0
      while (p && guard++ < 200) { labelIds.add(p); p = parent.get(p) }
    }

    // Nodes
    for (const n of layout.nodes) {
      const r = 6 + Math.min(24, Math.sqrt(Math.max(1, n.size)))
      const isHover = hoverId === n.id
      ctx.fillStyle = (isHover ? primary : primary) + '80'
      ctx.strokeStyle = isHover ? '#fff' : primary
      ctx.lineWidth = 2
      if (n.isLeaf) {
        // rounded square
        const s = r * 1.2
        const cr = Math.min(6, s * 0.4)
        roundRect(ctx, n.x - s / 2, n.y - s / 2, s, s, cr)
        ctx.fill(); ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
      }
      if (n.id === activeId) {
        ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,0,0.8)'; ctx.lineWidth = 2
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2); ctx.stroke()
      }
      // Labels: show for clusters or when zoomed; ensure ancestors of big clusters are labeled
      if (labelIds.has(n.id) || view.scale > 1.4 || isHover) {
        ctx.fillStyle = text
        ctx.font = '12px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(n.name, n.x, n.y + r + 6)
      }
    }

    ctx.restore()
  }, [layout, view, activeId])

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.lineTo(x + w - rr, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
    ctx.lineTo(x + w, y + h - rr)
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
    ctx.lineTo(x + rr, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
    ctx.lineTo(x, y + rr)
    ctx.quadraticCurveTo(x, y, x + rr, y)
    ctx.closePath()
  }

  // Interactions
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = Math.max(0.2, Math.min(5, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)))
      setView(v => ({ ...v, scale }))
    }
    const onDown = (e: MouseEvent) => { dragging.current = { x: e.clientX, y: e.clientY } }
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragging.current.x
      const dy = e.clientY - dragging.current.y
      dragging.current = { x: e.clientX, y: e.clientY }
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }))
    }
    const onUp = () => { dragging.current = null }
    const hitAt = (clientX: number, clientY: number) => {
      if (!layout) return
      const rect = c.getBoundingClientRect()
      const x = (clientX - rect.left - rect.width / 2 - view.x) / view.scale
      const y = (clientY - rect.top - rect.height / 2 - view.y) / view.scale
      // simple hit test
      let hit: LayoutNode | null = null
      for (const n of layout.nodes) {
        const r = 8 + Math.min(24, Math.sqrt(Math.max(1, n.size)))
        const dx = x - n.x, dy = y - n.y
        if (dx * dx + dy * dy <= r * r) { hit = n; break }
      }
      return hit
    }
    const onClick = (e: MouseEvent) => {
      const hit = hitAt(e.clientX, e.clientY)
      if (hit) {
        // Temporarily disabled due to editor selection bug
        // (window as any).ipcRenderer.invoke('gamedocs:focus-editor-select', gameId, hit.id)
        console.log(`Map node clicked: ${hit.id} - ${hit.name} (click handling disabled)`)
      }
    }
    const onMove2 = (e: MouseEvent) => {
      const hit = hitAt(e.clientX, e.clientY)
      setHoverId(hit ? hit.id : null)
      c.style.cursor = hit ? 'pointer' : 'default'
      // request redraw when hover changes
      // (state change already triggers draw via dependency)
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    c.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    c.addEventListener('click', onClick)
    c.addEventListener('mousemove', onMove2)
    return () => {
      c.removeEventListener('wheel', onWheel)
      c.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      c.removeEventListener('click', onClick)
      c.removeEventListener('mousemove', onMove2)
    }
  }, [layout, view.scale, view.x, view.y, hoverId])

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'var(--pd-surface, #1e1e1e)', color: 'var(--pd-text, #e5e5e5)' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>
        <button onClick={() => history.back()}>Back</button>
        <button style={{ marginLeft: 8 }} onClick={() => {
          const c = canvasRef.current; if (!c) return
          c.toBlob((blob) => {
            if (!blob) return
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'places-map.png'
            a.click()
            URL.revokeObjectURL(a.href)
          })
        }}>Export PNG</button>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default PlaceMap

