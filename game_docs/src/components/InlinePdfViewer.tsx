/**
 * InlinePdfViewer.tsx
 *
 * A self-contained React component that renders a single PDF file inline using
 * PDF.js. It manages its own loading, page-navigation, and zoom state.
 *
 * The component fetches the PDF as a base64 data URL via the
 * `gamedocs:get-file-dataurl` IPC channel (Electron renderer only), decodes it
 * to a Uint8Array, and renders individual pages onto a `<canvas>` element.
 *
 * When PDF.js fails to load the file it automatically calls `onPopout` so the
 * parent can fall back to a native pop-out viewer.
 */

import React, { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface InlinePdfViewerProps {
  /** Absolute filesystem path to the PDF file. */
  filePath: string
  /** Called when PDF.js fails to render, so the parent can open a native window. */
  onPopout: () => void
  /** Called when the user explicitly requests the OS default viewer. */
  onExternal: () => void
}

const InlinePdfViewer: React.FC<InlinePdfViewerProps> = ({ filePath, onPopout, onExternal }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [pdfDoc, setPdfDoc] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)

  /** Fetches the file from the main process, decodes the base64 data URL, and
   *  loads it into PDF.js. Re-runs whenever `filePath` changes. */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setErrorDetail(null)
    setPdfDoc(null)
    setPageCount(0)
    setPage(1)
    ;(async () => {
      const res = await window.ipcRenderer.invoke('gamedocs:get-file-dataurl', filePath).catch((e: any) => {
        console.error('[InlinePdfViewer] get-file-dataurl failed', { filePath, message: e?.message || String(e) })
        return null
      }) as { ok?: boolean; dataUrl?: string | null } | null
      const dataUrl = String(res?.dataUrl || '')
      const m = dataUrl.match(/^data:([^;,]+);base64,/i)
      const mime = (m?.[1] || '').toLowerCase()
      if (!res?.ok || !dataUrl || !m) {
        console.error('[InlinePdfViewer] invalid data URL response', { filePath, ok: !!res?.ok, hasDataUrl: !!dataUrl, mime })
        if (!cancelled) {
          setError('Inline PDF loading failed for this file.')
          setErrorDetail(`Invalid data URL from backend${mime ? ` (${mime})` : ''}`)
          setLoading(false)
        }
        return
      }
      try {
        if (mime && mime !== 'application/pdf') {
          console.warn('[InlinePdfViewer] unexpected mime for pdf', { filePath, mime })
        }
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        console.log('[InlinePdfViewer] loading PDF bytes', { filePath, bytes: bytes.length, mime: mime || 'unknown' })
        const task = getDocument({ data: bytes })
        const doc = await task.promise
        if (cancelled) {
          try { await doc.destroy() } catch {}
          return
        }
        setPdfDoc(doc)
        setPageCount(doc.numPages || 1)
      } catch (e: any) {
        console.error('[InlinePdfViewer] PDF.js load error', { filePath, message: e?.message || String(e), name: e?.name || '' })
        if (!cancelled) {
          setError('Inline PDF rendering failed. Opened pop-out fallback.')
          setErrorDetail(e?.message ? String(e.message) : 'Unknown PDF.js error')
          onPopout()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [filePath, onPopout])

  /** Renders the current page onto the canvas whenever `page`, `pdfDoc`, or
   *  `zoom` changes. Applies the device pixel ratio for sharp rendering on
   *  high-DPI displays. */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!pdfDoc || !canvasRef.current) return
      try {
        const p = await pdfDoc.getPage(page)
        if (cancelled || !canvasRef.current) return
        const viewport = p.getViewport({ scale: zoom })
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        await p.render({ canvasContext: ctx, viewport }).promise
      } catch (e: any) {
        console.error('[InlinePdfViewer] page render error', { filePath, page, zoom, message: e?.message || String(e) })
        if (!cancelled) {
          setError('Inline PDF page render failed.')
          setErrorDetail(e?.message ? String(e.message) : 'Unknown render error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [filePath, page, pdfDoc, zoom])

  return (
    <div className="grid-gap-8" style={{ height: '100%' }}>
      <div className="flex-row" style={{ justifyContent: 'space-between' }}>
        <div className="flex-gap-6 items-center">
          <button disabled={!pdfDoc || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
          <div>{page}/{pageCount || 1}</div>
          <button disabled={!pdfDoc || page >= pageCount} onClick={() => setPage(p => Math.min(pageCount || 1, p + 1))}>Next</button>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>-</button>
          <div>{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))}>+</button>
        </div>
        <div className="flex-gap-6">
          <button onClick={onPopout}>Pop out</button>
          <button onClick={onExternal}>Open externally</button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid #333', borderRadius: 6, background: '#1b1b1b', display: 'flex', justifyContent: 'center', alignItems: loading ? 'center' : 'flex-start', padding: 8 }}>
        {loading ? <div className="muted">Loading PDF…</div> : error ? <div className="muted">{error}{errorDetail ? ` (${errorDetail})` : ''}</div> : <canvas ref={canvasRef} />}
      </div>
    </div>
  )
}

export default InlinePdfViewer
