# Logging System Documentation

## Overview

The PlayerDocs logging system provides a configurable, event-driven way to log application events. It's designed to be easy to extend and manage.

## Architecture

### Files
- `src/types/logging.ts` - Type definitions for all loggable events
- `src/utils/logger.ts` - Centralized Logger service
- `db/schema.sql` - Database schema with logs table
- `electron/main/index.ts` - IPC handlers for logging

### Key Features
- **Event-driven**: Components emit events, logger decides whether to log them
- **Configurable**: Each event type can be enabled/disabled independently
- **Extensible**: Adding new event types is straightforward
- **Performance**: Zero overhead when logging is disabled

## Current Event Types

### Cleanup Events (Enabled by Default)
- `cleanup_orphaned_links` - When orphaned link references are removed
- `cleanup_orphaned_tags` - When orphaned link tags are removed
- `cleanup_unused_images` - When unused images are cleaned up
- `cleanup_missing_images` - When images that don't exist physically are removed from database

### User Action Events (Disabled by Default)
- `image_added` - When an image is added to an object
- `object_created` - When a new object is created
- `object_deleted` - When an object is deleted
- `link_created` - When a link between objects is created

## Usage

### Basic Usage
```typescript
import { logger } from '../utils/logger'

// Log a cleanup event
await logger.logCleanupOrphanedLinks({
  removedCount: 5,
  gameId: 'campaign-123'
})

// Log missing image cleanup
await logger.logCleanupMissingImages({
  removedCount: 3,
  gameId: 'campaign-123',
  missingImages: [
    { id: 'img-1', objectId: 'obj-1', filePath: '/path/to/missing.jpg', name: 'portrait.jpg' }
  ]
})

// Log a user action
await logger.logImageAdded({
  objectId: 'obj-456',
  objectName: 'Beowulf',
  imageName: 'portrait.jpg',
  isDefault: true
})
```

### Adding New Event Types

1. **Define the event type** in `src/types/logging.ts`:
```typescript
export interface NewEventType extends BaseLogEvent {
  type: 'new_event_type'
  category: 'user_action' // or 'cleanup', 'system', etc.
  data: {
    // your event data
  }
}

// Add to the union type
export type LoggableEvent = 
  | ImageAddedEvent
  | NewEventType  // add here
  // ... other events
```

2. **Add to configuration** in `src/types/logging.ts`:
```typescript
export interface LoggingConfig {
  // ... existing config
  new_event_type: boolean
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  // ... existing defaults
  new_event_type: false, // or true if you want it enabled by default
}
```

3. **Add convenience method** in `src/utils/logger.ts`:
```typescript
async logNewEventType(data: {
  // your event data
}): Promise<void> {
  await this.log({
    type: 'new_event_type',
    timestamp: new Date().toISOString(),
    level: 'info',
    category: 'user_action',
    data
  })
}
```

4. **Use in your component**:
```typescript
// Where the action happens
await logger.logNewEventType({
  // your event data
})
```

## Configuration

The logging configuration is stored in the `settings` table with the key `log_config`. You can modify it programmatically:

```typescript
// Enable/disable specific event types
await logger.updateConfig({
  image_added: true,
  object_created: false
})

// Get current configuration
const config = logger.getConfig()
```

## Database Schema

The `logs` table stores all log entries:
```sql
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  event_type TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error')),
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT, -- JSON string with event data
  created_at TEXT NOT NULL
);
```

## Future Enhancements

- Log viewer UI component
- Log filtering and search
- Log export functionality
- Log rotation/cleanup
- Performance metrics logging
