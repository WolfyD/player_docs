/**
 * Centralized logging service for PlayerDocs
 * 
 * This service provides a clean, configurable way to log application events.
 * Events are only logged if they are enabled in the configuration.
 */

import { 
  LoggableEvent, 
  LoggingConfig, 
  DEFAULT_LOGGING_CONFIG, 
  LogLevel,
  LogCategory 
} from '../types/logging'

/**
 * Centralized Logger class that handles event-driven logging
 */
export class Logger {
  private config: LoggingConfig = DEFAULT_LOGGING_CONFIG
  private gameId: string | null = null

  /**
   * Initialize the logger with a game ID
   */
  async initialize(gameId: string): Promise<void> {
    this.gameId = gameId
    await this.loadConfig()
  }

  /**
   * Load logging configuration from settings
   */
  private async loadConfig(): Promise<void> {
    try {
      const configStr = await window.ipcRenderer.invoke('gamedocs:get-setting', 'log_config')
      if (configStr) {
        this.config = { ...DEFAULT_LOGGING_CONFIG, ...JSON.parse(configStr) }
      }
    } catch (error) {
      console.warn('Failed to load logging config, using defaults:', error)
      this.config = DEFAULT_LOGGING_CONFIG
    }
  }

  /**
   * Save logging configuration to settings
   */
  async updateConfig(newConfig: Partial<LoggingConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig }
    try {
      await window.ipcRenderer.invoke('gamedocs:set-setting', 'log_config', JSON.stringify(this.config))
    } catch (error) {
      console.error('Failed to save logging config:', error)
    }
  }

  /**
   * Get current logging configuration
   */
  getConfig(): LoggingConfig {
    return { ...this.config }
  }

  /**
   * Log an event if it's enabled in the configuration
   */
  async log(event: LoggableEvent): Promise<void> {
    if (!this.gameId) {
      console.warn('Logger not initialized with game ID')
      return
    }

    // Check if this event type is enabled for logging
    if (!this.config[event.type as keyof LoggingConfig]) {
      return // Event type is disabled, don't log
    }

    try {
      // Create the log record
      const logRecord = {
        gameId: this.gameId,
        eventType: event.type,
        level: event.level,
        category: event.category,
        message: this.formatMessage(event),
        metadata: JSON.stringify(event.data),
        timestamp: event.timestamp || new Date().toISOString()
      }

      // Send to main process for database storage
      await window.ipcRenderer.invoke('gamedocs:log-event', logRecord)
    } catch (error) {
      console.error('Failed to log event:', error, event)
    }
  }

  /**
   * Format a human-readable message from an event
   */
  private formatMessage(event: LoggableEvent): string {
    switch (event.type) {
      case 'image_added':
        return `Image "${event.data.imageName}" added to ${event.data.objectName}${event.data.isDefault ? ' (set as default)' : ''}`
      
      case 'object_created':
        return `Created ${event.data.type} "${event.data.name}"`
      
      case 'object_deleted':
        return `Deleted ${event.data.type} "${event.data.name}"`
      
      case 'link_created':
        return `Created link from object ${event.data.fromObjectId} to ${event.data.toObjectId}`
      
      case 'cleanup_orphaned_links':
        return `Cleanup: Removed ${event.data.removedCount} orphaned link(s)`
      
      case 'cleanup_orphaned_tags':
        return `Cleanup: Removed ${event.data.removedCount} orphaned tag(s)`
      
      case 'cleanup_unused_images':
        return `Cleanup: Removed ${event.data.removedCount} unused image(s), freed ${this.formatBytes(event.data.freedSpaceBytes)}`
      
      case 'cleanup_missing_images':
        return `Cleanup: Removed ${event.data.removedCount} missing image(s) from database`
      
      default:
        return `Event: ${(event as any).type}`
    }
  }

  /**
   * Format bytes into human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Convenience methods for common event types
   */
  async logImageAdded(data: {
    objectId: string
    objectName: string
    imageName: string
    isDefault: boolean
  }): Promise<void> {
    await this.log({
      type: 'image_added',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'user_action',
      data
    })
  }

  async logObjectCreated(data: {
    objectId: string
    name: string
    type: string
    parentId?: string
  }): Promise<void> {
    await this.log({
      type: 'object_created',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'user_action',
      data
    })
  }

  async logObjectDeleted(data: {
    objectId: string
    name: string
    type: string
  }): Promise<void> {
    await this.log({
      type: 'object_deleted',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'user_action',
      data
    })
  }

  async logLinkCreated(data: {
    fromObjectId: string
    toObjectId: string
    tagId: string
  }): Promise<void> {
    await this.log({
      type: 'link_created',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'user_action',
      data
    })
  }

  async logCleanupOrphanedLinks(data: {
    removedCount: number
    gameId: string
  }): Promise<void> {
    await this.log({
      type: 'cleanup_orphaned_links',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'cleanup',
      data
    })
  }

  async logCleanupOrphanedTags(data: {
    removedCount: number
    gameId: string
  }): Promise<void> {
    await this.log({
      type: 'cleanup_orphaned_tags',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'cleanup',
      data
    })
  }

  async logCleanupUnusedImages(data: {
    removedCount: number
    freedSpaceBytes: number
  }): Promise<void> {
    await this.log({
      type: 'cleanup_unused_images',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'cleanup',
      data
    })
  }

  async logCleanupMissingImages(data: {
    removedCount: number
    gameId: string
    missingImages: Array<{
      id: string
      objectId: string
      filePath: string
      name: string | null
    }>
  }): Promise<void> {
    await this.log({
      type: 'cleanup_missing_images',
      timestamp: new Date().toISOString(),
      level: 'info',
      category: 'cleanup',
      data
    })
  }
}

/**
 * Global logger instance
 * Import this in components that need logging
 */
export const logger = new Logger()
