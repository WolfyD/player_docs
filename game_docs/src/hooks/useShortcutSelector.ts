import { useState, useCallback } from 'react'

export function useShortcutSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentShortcut, setCurrentShortcut] = useState<string>('')

  const openSelector = useCallback((shortcut?: string) => {
    setCurrentShortcut(shortcut || '')
    setIsOpen(true)
  }, [])

  const closeSelector = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleSelect = useCallback((shortcut: string) => {
    setCurrentShortcut(shortcut)
    setIsOpen(false)
    return shortcut
  }, [])

  return {
    isOpen,
    currentShortcut,
    openSelector,
    closeSelector,
    handleSelect
  }
}
