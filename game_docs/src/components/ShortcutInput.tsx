import React from 'react'
import { useShortcutSelector } from '../hooks/useShortcutSelector'
import ShortcutSelector from './ShortcutSelector'

interface ShortcutInputProps {
  value: string
  onChange: (shortcut: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function ShortcutInput({ 
  value, 
  onChange, 
  placeholder = "Click to set shortcut...", 
  className = "",
  disabled = false
}: ShortcutInputProps) {
  const { isOpen, openSelector, closeSelector, handleSelect } = useShortcutSelector()

  const handleClick = () => {
    if (!disabled) {
      openSelector(value)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const onShortcutSelect = (shortcut: string) => {
    onChange(shortcut)
    handleSelect(shortcut)
  }

  return (
    <>
      <div
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        className={`shortcut-button
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${className}
        `}
        role="button"
        aria-label="Set keyboard shortcut"
      >
        <div className="flex items-center justify-between">
          <span className={value ? 'font-mono text-sm' : 'text-gray-500 dark:text-gray-400'}>
            {value || placeholder}
          </span>
          <svg 
            className="shortcut-button-icon" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" 
            />
          </svg>
        </div>
      </div>

      <ShortcutSelector
        isOpen={isOpen}
        onClose={closeSelector}
        onSelect={onShortcutSelect}
        currentShortcut={value}
      />
    </>
  )
}
