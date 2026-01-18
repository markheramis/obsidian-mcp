/**
 * FileWatcher - Watches the Obsidian vault for external file changes
 * 
 * This service uses chokidar to monitor file system changes and trigger
 * cache invalidation when files are modified outside of MCP operations.
 * 
 * Features:
 * - Configurable debounce delay
 * - Change coalescing (multiple edits to same file → single event)
 * - Batch processing of rapid changes
 */

import chokidar, { FSWatcher } from 'chokidar';
import * as path from 'path';

/** Event types for file changes */
export type FileChangeEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';

/** Callback type for file change events */
export type ChangeCallback = (eventType: FileChangeEventType, filePath: string) => void;

/** Options for file watcher configuration */
export interface FileWatcherOptions {
    /** Debounce delay in milliseconds (default: 100) */
    debounceDelay: number;
    /** Stability threshold for write completion detection (default: 100) */
    stabilityThreshold: number;
    /** Use polling instead of native events (useful for network drives) */
    usePolling: boolean;
    /** Polling interval in milliseconds when usePolling is true */
    pollInterval: number;
}

/** Default options */
const DEFAULT_OPTIONS: FileWatcherOptions = {
    debounceDelay: 100,
    stabilityThreshold: 100,
    usePolling: false,
    pollInterval: 100,
};

/** Represents a pending change with coalescing support */
interface PendingChange {
    eventType: FileChangeEventType;
    filePath: string;
    timestamp: number;
}

export class FileWatcher {
    /** The chokidar watcher instance */
    private watcher: FSWatcher | null = null;
    
    /** Path to the vault being watched */
    private readonly vaultPath: string;
    
    /** Callback to invoke on file changes */
    private onChangeCallback: ChangeCallback | null = null;
    
    /** Whether the watcher is active */
    private isWatching: boolean = false;
    
    /** Debounce timer for batch invalidation */
    private debounceTimer: NodeJS.Timeout | null = null;
    
    /** Configuration options */
    private readonly options: FileWatcherOptions;
    
    /** Pending changes during debounce period, keyed by file path for coalescing */
    private pendingChanges: Map<string, PendingChange> = new Map();
    
    /** Count of changes processed since start */
    private changesProcessed: number = 0;

    /**
     * Creates a new FileWatcher instance
     * @param vaultPath Path to the Obsidian vault to watch
     * @param options Configuration options
     */
    constructor(vaultPath: string, options?: Partial<FileWatcherOptions>) {
        this.vaultPath = vaultPath;
        this.options = {
            debounceDelay: options?.debounceDelay ?? DEFAULT_OPTIONS.debounceDelay,
            stabilityThreshold: options?.stabilityThreshold ?? DEFAULT_OPTIONS.stabilityThreshold,
            usePolling: options?.usePolling ?? DEFAULT_OPTIONS.usePolling,
            pollInterval: options?.pollInterval ?? DEFAULT_OPTIONS.pollInterval,
        };
    }

    /**
     * Start watching the vault for changes
     * @param onChange Callback to invoke when files change
     */
    start(onChange: ChangeCallback): void {
        if (this.isWatching) {
            console.warn('FileWatcher is already running');
            return;
        }

        this.onChangeCallback = onChange;

        // Configure chokidar with optimized settings
        this.watcher = chokidar.watch(this.vaultPath, {
            // Only watch markdown files
            ignored: [
                /(^|[\/\\])\../, // Ignore dotfiles
                '**/node_modules/**',
                '**/.git/**',
                '**/.obsidian/**',
            ],
            persistent: true,
            ignoreInitial: true, // Don't trigger events for existing files on startup
            awaitWriteFinish: {
                stabilityThreshold: this.options.stabilityThreshold,
                pollInterval: 50,
            },
            usePolling: this.options.usePolling,
            interval: this.options.pollInterval,
            // Depth limit to prevent watching too deep
            depth: 99,
        });

        // Handle file events with debouncing
        this.watcher
            .on('add', (filePath) => this.handleChange('add', filePath))
            .on('change', (filePath) => this.handleChange('change', filePath))
            .on('unlink', (filePath) => this.handleChange('unlink', filePath))
            .on('addDir', (dirPath) => this.handleChange('addDir', dirPath))
            .on('unlinkDir', (dirPath) => this.handleChange('unlinkDir', dirPath))
            .on('error', (error) => console.error('FileWatcher error:', error))
            .on('ready', () => {
                this.isWatching = true;
                console.error(`FileWatcher ready, watching: ${this.vaultPath} (debounce: ${this.options.debounceDelay}ms)`);
            });
    }

    /**
     * Handle a file change event with debouncing and coalescing
     * @param eventType Type of change event
     * @param filePath Path to the changed file
     */
    private handleChange(eventType: FileChangeEventType, filePath: string): void {
        // Only track markdown files for content changes
        if (eventType !== 'addDir' && eventType !== 'unlinkDir' && !filePath.endsWith('.md')) {
            return;
        }

        // Get relative path from vault
        const relativePath = path.relative(this.vaultPath, filePath);
        
        // Coalesce changes to the same file
        // Priority: unlink > add > change (if file is deleted, that's the final state)
        const existing = this.pendingChanges.get(relativePath);
        const newChange: PendingChange = {
            eventType: this.coalesceEventType(existing?.eventType, eventType),
            filePath: relativePath,
            timestamp: Date.now(),
        };
        this.pendingChanges.set(relativePath, newChange);

        // Debounce multiple rapid changes
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.processPendingChanges();
        }, this.options.debounceDelay);
    }

    /**
     * Coalesce event types when multiple changes occur to the same file
     * @param existing Existing event type (if any)
     * @param incoming New event type
     * @returns Coalesced event type
     */
    private coalesceEventType(
        existing: FileChangeEventType | undefined, 
        incoming: FileChangeEventType
    ): FileChangeEventType {
        if (!existing) return incoming;
        
        // If file was added then changed, it's still just "add"
        if (existing === 'add' && incoming === 'change') return 'add';
        
        // If file was changed then deleted, it's "unlink"
        if (incoming === 'unlink' || incoming === 'unlinkDir') return incoming;
        
        // If file was deleted then added (recreated), treat as "change"
        if (existing === 'unlink' && incoming === 'add') return 'change';
        
        // Default to the most recent event
        return incoming;
    }

    /**
     * Process all pending changes after debounce period
     */
    private processPendingChanges(): void {
        if (!this.onChangeCallback || this.pendingChanges.size === 0) {
            return;
        }

        // Process each pending change
        for (const change of this.pendingChanges.values()) {
            this.onChangeCallback(change.eventType, change.filePath);
            this.changesProcessed++;
        }

        this.pendingChanges.clear();
    }

    /**
     * Stop watching the vault
     */
    async stop(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        // Process any remaining pending changes
        if (this.pendingChanges.size > 0) {
            this.processPendingChanges();
        }

        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
            this.isWatching = false;
            console.error('FileWatcher stopped');
        }
    }

    /**
     * Check if the watcher is currently active
     * @returns True if watching
     */
    isActive(): boolean {
        return this.isWatching;
    }

    /**
     * Get watcher statistics
     * @returns Statistics about the watcher
     */
    getStats(): { 
        isActive: boolean; 
        vaultPath: string; 
        watchedCount: number;
        debounceDelay: number;
        pendingChanges: number;
        changesProcessed: number;
    } {
        return {
            isActive: this.isWatching,
            vaultPath: this.vaultPath,
            watchedCount: this.watcher ? Object.keys(this.watcher.getWatched()).length : 0,
            debounceDelay: this.options.debounceDelay,
            pendingChanges: this.pendingChanges.size,
            changesProcessed: this.changesProcessed,
        };
    }

    /**
     * Get the current debounce delay
     * @returns Debounce delay in milliseconds
     */
    getDebounceDelay(): number {
        return this.options.debounceDelay;
    }
}
