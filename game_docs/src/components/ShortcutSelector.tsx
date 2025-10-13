import React, { useState, useEffect, useCallback } from 'react'

interface ShortcutSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (shortcut: string) => void
  currentShortcut?: string
}

interface KeyState {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string | null
}

export default function ShortcutSelector({ isOpen, onClose, onSelect, currentShortcut }: ShortcutSelectorProps) {
  const [keyState, setKeyState] = useState<KeyState>({
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: null
  })
  const [CtrlDown, setCtrlDown] = useState(false)
  const [ShiftDown, setShiftDown] = useState(false)
  const [AltDown, setAltDown] = useState(false)
  const [MetaDown, setMetaDown] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [StateChange, setStateChange] = useState(false)



  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return

    // Handle escape to close
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }

    // Start recording on any key press
    if (!isRecording) {
      setIsRecording(true)
    }

    // Update modifier states only if they've changed
    if (event.key === 'Control' && !CtrlDown) {
      setCtrlDown(true)
    } else if (event.key === 'Shift' && !ShiftDown) {
      setShiftDown(true)
    } else if (event.key === 'Alt' && !AltDown) {
      setAltDown(true)
    } else if (event.key === 'Meta' && !MetaDown) {
      setMetaDown(true)
    }

    // If a non-modifier key is pressed, finalize the shortcut
    if (!['control', 'shift', 'alt', 'meta'].includes(event.key.toLowerCase())) {
      event.preventDefault()
      event.stopPropagation()
      
      const shortcut = buildShortcutString({
        ctrl: CtrlDown || event.ctrlKey,
        shift: ShiftDown || event.shiftKey,
        alt: AltDown || event.altKey,
        meta: MetaDown || event.metaKey,
        key: event.key.toLowerCase()
      })
      
      onSelect(shortcut)
      onClose()
    }
  }, [isOpen, isRecording, onClose, onSelect, CtrlDown, ShiftDown, AltDown, MetaDown])

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return
    
    // Update modifier states only if they've changed
    if (event.key === 'Control' && CtrlDown) {
      setCtrlDown(false)
    } else if (event.key === 'Shift' && ShiftDown) {
      setShiftDown(false)
    } else if (event.key === 'Alt' && AltDown) {
      setAltDown(false)
    } else if (event.key === 'Meta' && MetaDown) {
      setMetaDown(false)
    }
  }, [isOpen, CtrlDown, ShiftDown, AltDown, MetaDown])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('keyup', handleKeyUp)
      setIsRecording(false)
      setKeyState({
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        key: null
      })
      // Reset all modifier states
      setCtrlDown(false)
      setShiftDown(false)
      setAltDown(false)
      setMetaDown(false)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
    }
  }, [isOpen, handleKeyDown, handleKeyUp])

  const buildShortcutString = (keys: KeyState): string => {
    const parts: string[] = []
    
    if (keys.ctrl) parts.push('Ctrl')
    if (keys.shift) parts.push('Shift')
    if (keys.alt) parts.push('Alt')
    if (keys.meta) parts.push('Meta')
    
    if (keys.key && !['control', 'shift', 'alt', 'meta'].includes(keys.key)) {
      parts.push(keys.key.toUpperCase())
    }
    
    return parts.join('+')
  }

  const getKeyDisplayName = (key: string): string => {
    const keyMap: { [key: string]: string } = {
      ' ': 'Space',
      'arrowup': '↑',
      'arrowdown': '↓',
      'arrowleft': '←',
      'arrowright': '→',
      'enter': 'Enter',
      'tab': 'Tab',
      'backspace': 'Backspace',
      'delete': 'Delete',
      'escape': 'Esc',
      'f1': 'F1', 'f2': 'F2', 'f3': 'F3', 'f4': 'F4',
      'f5': 'F5', 'f6': 'F6', 'f7': 'F7', 'f8': 'F8',
      'f9': 'F9', 'f10': 'F10', 'f11': 'F11', 'f12': 'F12'
    }
    
    return keyMap[key] || key.toUpperCase()
  }

  const getCurrentShortcutDisplay = (): string => {
    if (!isRecording) {
      return currentShortcut || 'No shortcut set'
    }

    const parts: string[] = []
    
    if (keyState.ctrl) parts.push('Ctrl')
    if (keyState.shift) parts.push('Shift')
    if (keyState.alt) parts.push('Alt')
    if (keyState.meta) parts.push('Meta')
    
    if (keyState.key && !['control', 'shift', 'alt', 'meta'].includes(keyState.key)) {
      parts.push(getKeyDisplayName(keyState.key))
    }
    
    return parts.length > 0 ? parts.join(' + ') : 'Press any key combination...'
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Set Keyboard Shortcut
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Current shortcut:
          </div>
          <div className="current-shortcut text-lg font-mono bg-gray-100 dark:bg-gray-700 p-3 rounded border text-center">
            {getCurrentShortcutDisplay()}
          </div>
        </div>

        <div className="mb-4">
          <div 
             onKeyDown={e => { 
              console.log('Key down', e.key)
              setStateChange(false)
               e.preventDefault(); 
               e.stopPropagation(); 
               if (e.shiftKey && !ShiftDown) { 
                 setShiftDown(true)
                 setStateChange(true)
                 return
               } else if (e.ctrlKey && !CtrlDown) { 
                console.log('Control down')
                 setCtrlDown(true) 
                 setStateChange(true)
                 return
               } else if (e.key === 'Alt' && !AltDown) { 
                 setAltDown(true) 
                 setStateChange(true)
                 return
               } else if (e.key === 'Meta' && !MetaDown) { 
                 setMetaDown(true) 
                 setStateChange(true)
                 return
               }
               setStateChange(false)
             }} 
             onKeyUp={e => { 
              setStateChange(false)
               e.preventDefault(); 
               e.stopPropagation(); 
               if (e.key === 'Shift' && ShiftDown) { 
                 setShiftDown(false) 
                 setStateChange(true)
                 return
               } 
               else if (e.key === 'Control' && CtrlDown) { 
                 setCtrlDown(false) 
                 setStateChange(true)
                 return
               } 
               else if (e.key === 'Alt' && AltDown) { 
                 setAltDown(false) 
                 setStateChange(true)
                 return
               } else if (e.key === 'Meta' && MetaDown) { 
                 setMetaDown(false) 
                 setStateChange(true)
                 return
               }
               setStateChange(false)
             }}
            className="flex items-center justify-center space-x-2 h-8">
            {isRecording && StateChange && (
              <>
              { CtrlDown && (
                <>
                  {CtrlDown && StateChange && (
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm font-medium">
                      Ctrl
                    </span>
                  )}
                </>
              )}
                {ShiftDown && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm font-medium">
                    Shift
                  </span>
                )}
                {AltDown && (
                  <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded text-sm font-medium">
                    Alt
                  </span>
                )}
                {MetaDown && (
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-sm font-medium">
                    Meta
                  </span>
                )}
                {keyState.key && !CtrlDown && !ShiftDown && !AltDown && !MetaDown && (
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded text-sm font-medium">
                    {getKeyDisplayName(keyState.key)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          {isRecording ? (
            <span className="text-blue-600 dark:text-blue-400">
              Press the key combination you want to use...
            </span>
          ) : (
            <span>Press any key to start recording</span>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
          Press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">Esc</kbd> to cancel
        </div>
      </div>
    </div>
  )
}
