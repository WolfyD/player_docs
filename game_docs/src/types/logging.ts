/**
 * Logging system types and interfaces for PlayerDocs
 * 
 * This module defines the event-driven logging framework that allows
 * configurable logging of various application events.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogCategory = 
  | 'cleanup'
  | 'user_action' 
  | 'system'
  | 'database'
  | 'file_operation'

/**
 * Base interface for all loggable events
 */
export interface BaseLogEvent {
  type: string
  timestamp: string
  level: LogLevel
  category: LogCategory
}

/**
 * Specific event types that can be logged
 */
export interface ImageAddedEvent extends BaseLogEvent {
  type: 'image_added'
  category: 'user_action'
  data: {
    objectId: string
    objectName: string
    imageName: string
    isDefault: boolean
  }
}

export interface ObjectCreatedEvent extends BaseLogEvent {
  type: 'object_created'
  category: 'user_action'
  data: {
    objectId: string
    name: string
    type: string
    parentId?: string
  }
}

export interface ObjectDeletedEvent extends BaseLogEvent {
  type: 'object_deleted'
  category: 'user_action'
  data: {
    objectId: string
    name: string
    type: string
  }
}

export interface LinkCreatedEvent extends BaseLogEvent {
  type: 'link_created'
  category: 'user_action'
  data: {
    fromObjectId: string
    toObjectId: string
    tagId: string
  }
}

export interface CleanupOrphanedLinksEvent extends BaseLogEvent {
  type: 'cleanup_orphaned_links'
  category: 'cleanup'
  data: {
    removedCount: number
    gameId: string
  }
}

export interface CleanupOrphanedTagsEvent extends BaseLogEvent {
  type: 'cleanup_orphaned_tags'
  category: 'cleanup'
  data: {
    removedCount: number
    gameId: string
  }
}

export interface CleanupUnusedImagesEvent extends BaseLogEvent {
  type: 'cleanup_unused_images'
  category: 'cleanup'
  data: {
    removedCount: number
    freedSpaceBytes: number
  }
}

export interface CleanupMissingImagesEvent extends BaseLogEvent {
  type: 'cleanup_missing_images'
  category: 'cleanup'
  data: {
    removedCount: number
    gameId: string
    missingImages: Array<{
      id: string
      objectId: string
      filePath: string
      name: string | null
    }>
  }
}

/**
 * Union type of all possible log events
 * Add new event types here to extend the logging system
 */
export type LoggableEvent = 
  | ImageAddedEvent
  | ObjectCreatedEvent
  | ObjectDeletedEvent
  | LinkCreatedEvent
  | CleanupOrphanedLinksEvent
  | CleanupOrphanedTagsEvent
  | CleanupUnusedImagesEvent
  | CleanupMissingImagesEvent

/**
 * Configuration for which events should be logged
 */
export interface LoggingConfig {
  image_added: boolean
  object_created: boolean
  object_deleted: boolean
  link_created: boolean
  cleanup_orphaned_links: boolean
  cleanup_orphaned_tags: boolean
  cleanup_unused_images: boolean
  cleanup_missing_images: boolean
}

/**
 * Default logging configuration
 * Only cleanup events are enabled by default
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  image_added: false,
  object_created: false,
  object_deleted: false,
  link_created: false,
  cleanup_orphaned_links: true,
  cleanup_orphaned_tags: true,
  cleanup_unused_images: true,
  cleanup_missing_images: true,
}

/**
 * Database record structure for logs table
 */
export interface LogRecord {
  id: string
  game_id: string
  event_type: string
  level: LogLevel
  category: LogCategory
  message: string
  metadata: string // JSON string
  created_at: string
}
