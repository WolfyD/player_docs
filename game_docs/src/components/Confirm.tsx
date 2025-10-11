import React, { useEffect, useMemo, useState } from 'react'

export type ConfirmVariant = 'ok-cancel' | 'yes-no'
export type ConfirmOptions = {
  title?: string
  message: string
  variant?: ConfirmVariant
  icon?: React.ReactNode
}

type Pending = {
  opts: ConfirmOptions
  resolve: (v: boolean) => void
}

let openImpl: (opts: ConfirmOptions) => Promise<boolean> = async () => false

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return openImpl(opts)
}

export const ConfirmProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    openImpl = (opts: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        setPending({ opts, resolve })
      })
    }
    return () => { openImpl = async () => false }
  }, [])

  const labels = useMemo(() => {
    const v = (pending?.opts.variant || 'ok-cancel') as ConfirmVariant
    return v === 'yes-no' ? { pos: 'Yes', neg: 'No' } : { pos: 'OK', neg: 'Cancel' }
  }, [pending?.opts.variant])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        pending.resolve(true)
        setPending(null)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        pending.resolve(false)
        setPending(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  return (
    <>
      {children}
      {pending && (
        <div className="modal-overlay" onClick={() => { pending.resolve(false); setPending(null) }}>
          <div className="dialog-card w-360" onClick={e => e.stopPropagation()}>
            {pending.opts.title && <h3 className="mt-0">{pending.opts.title}</h3>}
            <div className="grid-gap-8">
              {pending.opts.icon ? (
                <div className="flex-gap-8 items-start">
                  <div>{pending.opts.icon}</div>
                  <div>{pending.opts.message}</div>
                </div>
              ) : (
                <div>{pending.opts.message}</div>
              )}
            </div>
            <div className="actions mt-12">
              <button onClick={() => { pending.resolve(false); setPending(null) }}>{labels.neg}</button>
              <button autoFocus onClick={() => { pending.resolve(true); setPending(null) }}>{labels.pos}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


