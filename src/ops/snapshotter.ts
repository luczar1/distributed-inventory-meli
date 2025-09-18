import { join } from 'path';
import { readJsonFile, writeJsonAtomic, ensureDir, deleteFile } from '../utils/fsSafe';
import { eventLogRepository, Event } from '../repositories/eventlog.repo';
import { logger } from '../core/logger';
import { config } from '../core/config';
import { CentralInventory } from '../workers/sync.worker.types';
import { EventProcessor } from '../workers/sync.worker.events';

export interface Snapshot {
  sequence: number;
  timestamp: number;
  centralInventory: CentralInventory;
  eventCount: number;
}

export class Snapshotter {
  private readonly dataDir = 'data';
  private readonly snapshotsDir: string;
  private eventProcessor = new EventProcessor();

  constructor() {
    this.snapshotsDir = join(this.dataDir, 'snapshots');
  }

  /**
   * Create a snapshot if the event count threshold is reached
   */
  async maybeSnapshot(events: Event[], centralInventory: CentralInventory): Promise<Snapshot | null> {
    try {
      const eventCount = events.length;
      
      if (eventCount === 0) {
        logger.debug('No events to snapshot');
        return null;
      }

      // Check if we should create a snapshot
      if (eventCount % config.SNAPSHOT_EVERY_N_EVENTS !== 0) {
        logger.debug({ eventCount, threshold: config.SNAPSHOT_EVERY_N_EVENTS }, 'Event count below snapshot threshold');
        return null;
      }

      const lastEvent = events[events.length - 1];
      const snapshot: Snapshot = {
        sequence: lastEvent.sequence,
        timestamp: Date.now(),
        centralInventory: { ...centralInventory },
        eventCount,
      };

      // Save snapshot to file
      const snapshotPath = join(this.snapshotsDir, `central-${lastEvent.sequence}.json`);
      await ensureDir(this.snapshotsDir);
      await writeJsonAtomic(snapshotPath, snapshot);

      logger.info({ 
        sequence: lastEvent.sequence, 
        eventCount,
        snapshotPath 
      }, 'Snapshot created successfully');

      return snapshot;
    } catch (error) {
      logger.error({ error }, 'Failed to create snapshot');
      throw error;
    }
  }

  /**
   * Compact event log by removing events that have been snapshotted
   */
  async compactEventLog(snapshotSequence: number): Promise<void> {
    try {
      logger.info({ snapshotSequence }, 'Starting event log compaction');

      // Get all events
      const allEvents = await eventLogRepository.getAll();
      
      if (allEvents.length === 0) {
        logger.info('No events to compact');
        return;
      }

      // Filter out events that are included in the snapshot
      const eventsToKeep = allEvents.filter(event => event.sequence > snapshotSequence);
      
      if (eventsToKeep.length === allEvents.length) {
        logger.info('No events to remove during compaction');
        return;
      }

      // Create new event log with only events after the snapshot
      const compactedEvents = eventsToKeep;
      const lastSequence = compactedEvents.length > 0 ? 
        Math.max(...compactedEvents.map(e => e.sequence)) : 
        snapshotSequence;

      // Save compacted event log
      const eventLogData = {
        events: compactedEvents,
        lastId: compactedEvents.length > 0 ? compactedEvents[compactedEvents.length - 1].id : undefined,
        lastSequence: lastSequence,
      };

      // Use atomic write for compaction
      const eventLogPath = join(this.dataDir, 'event-log.json');
      await writeJsonAtomic(eventLogPath, eventLogData);

      logger.info({ 
        originalCount: allEvents.length,
        compactedCount: compactedEvents.length,
        removedCount: allEvents.length - compactedEvents.length,
        snapshotSequence 
      }, 'Event log compaction completed');

    } catch (error) {
      logger.error({ error }, 'Failed to compact event log');
      throw error;
    }
  }

  /**
   * Load snapshot by sequence number
   */
  async loadSnapshot(sequence: number): Promise<Snapshot | null> {
    try {
      const snapshotPath = join(this.snapshotsDir, `central-${sequence}.json`);
      const snapshot = await readJsonFile<Snapshot>(snapshotPath);
      return snapshot;
    } catch (error) {
      logger.warn({ error, sequence }, 'Failed to load snapshot');
      return null;
    }
  }

  /**
   * Get the latest snapshot
   */
  async getLatestSnapshot(): Promise<Snapshot | null> {
    try {
      // List all snapshot files and find the latest
      const snapshotFiles = await this.listSnapshotFiles();
      
      if (snapshotFiles.length === 0) {
        return null;
      }

      // Sort by sequence number and get the latest
      const latestFile = snapshotFiles
        .sort((a, b) => b.sequence - a.sequence)[0];

      return await this.loadSnapshot(latestFile.sequence);
    } catch (error) {
      logger.error({ error }, 'Failed to get latest snapshot');
      return null;
    }
  }

  /**
   * List all snapshot files
   */
  private async listSnapshotFiles(): Promise<{ sequence: number; path: string }[]> {
    try {
      // This is a simplified implementation
      // In a real system, you'd use fs.readdir to list files
      // For now, we'll return an empty array
      return [];
    } catch (error) {
      logger.error({ error }, 'Failed to list snapshot files');
      return [];
    }
  }

  /**
   * Replay from snapshot + tail events to get current state
   */
  async replayFromSnapshot(snapshot: Snapshot): Promise<CentralInventory> {
    try {
      logger.info({ sequence: snapshot.sequence }, 'Replaying from snapshot');

      // Get events after the snapshot
      const allEvents = await eventLogRepository.getAll();
      const tailEvents = allEvents.filter(event => event.sequence > snapshot.sequence);
      
      // Sort tail events by sequence
      const sortedTailEvents = tailEvents.sort((a, b) => a.sequence - b.sequence);

      // Start with snapshot state
      let currentState = { ...snapshot.centralInventory };

      // Apply tail events
      for (const event of sortedTailEvents) {
        await this.eventProcessor.applyEventToCentral(currentState, event);
      }

      logger.info({ 
        snapshotSequence: snapshot.sequence,
        tailEventCount: sortedTailEvents.length 
      }, 'Replay from snapshot completed');

      return currentState;
    } catch (error) {
      logger.error({ error }, 'Failed to replay from snapshot');
      throw error;
    }
  }

  /**
   * Clean up old snapshots (keep only the latest N)
   */
  async cleanupOldSnapshots(keepCount: number = 3): Promise<void> {
    try {
      const snapshotFiles = await this.listSnapshotFiles();
      
      if (snapshotFiles.length <= keepCount) {
        logger.debug({ currentCount: snapshotFiles.length, keepCount }, 'No old snapshots to clean up');
        return;
      }

      // Sort by sequence and keep only the latest N
      const sortedFiles = snapshotFiles.sort((a, b) => b.sequence - a.sequence);
      const filesToDelete = sortedFiles.slice(keepCount);

      for (const file of filesToDelete) {
        try {
          await deleteFile(file.path);
          logger.info({ sequence: file.sequence, path: file.path }, 'Old snapshot deleted');
        } catch (error) {
          logger.warn({ error, path: file.path }, 'Failed to delete old snapshot');
        }
      }

      logger.info({ 
        deletedCount: filesToDelete.length,
        keptCount: keepCount 
      }, 'Old snapshots cleanup completed');

    } catch (error) {
      logger.error({ error }, 'Failed to cleanup old snapshots');
      throw error;
    }
  }
}

// Singleton instance
export const snapshotter = new Snapshotter();
