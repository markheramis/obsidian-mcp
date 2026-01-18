/**
 * FileListCache - Manages caching of file listings for improved search performance
 * 
 * This service provides an in-memory cache for file listings to reduce
 * filesystem I/O operations during repeated searches.
 * 
 * Optionally backed by LMDB for persistence across server restarts.
 */

import { PersistentCache } from './PersistentCache.js';

interface CacheEntry {
    files: string[];
    timestamp: number;
}

interface CacheStore {
    [folder: string]: CacheEntry;
}

export class FileListCache {
    /** In-memory cache store indexed by folder path */
    private cache: CacheStore = {};
    
    /** Time-to-live in milliseconds (default: 1 minute) */
    private readonly ttl: number;

    /** Optional persistent cache backing store */
    private persistentCache: PersistentCache<CacheEntry> | null = null;

    /**
     * Creates a new FileListCache instance
     * @param ttl Time-to-live in milliseconds (default: 60000ms / 1 minute)
     * @param persistentCache Optional persistent cache for LMDB backing
     */
    constructor(ttl: number = 60000, persistentCache?: PersistentCache<CacheEntry>) {
        this.ttl = ttl;
        this.persistentCache = persistentCache ?? null;
    }

    /**
     * Retrieve cached files for a specific folder
     * @param folder Folder path (empty string for root)
     * @returns Cached file list or null if not found/expired
     */
    get(folder: string = ''): string[] | null {
        const normalizedFolder = this.normalizeFolder(folder);
        
        // Check in-memory cache first
        const memoryEntry = this.cache[normalizedFolder];
        if (memoryEntry && this.isEntryValid(memoryEntry)) {
            return [...memoryEntry.files]; // Return a copy to prevent mutation
        }

        // Entry not in memory or expired, check persistent cache
        if (this.persistentCache) {
            const persistedEntry = this.persistentCache.getWithTtl(normalizedFolder, this.ttl);
            if (persistedEntry) {
                // Warm memory cache with the persisted entry
                this.cache[normalizedFolder] = persistedEntry;
                return [...persistedEntry.files];
            }
        }

        // Clean up expired memory entry if it exists
        if (memoryEntry) {
            delete this.cache[normalizedFolder];
        }

        return null;
    }

    /**
     * Store files in cache for a specific folder
     * @param folder Folder path (empty string for root)
     * @param files Array of file paths to cache
     */
    set(folder: string = '', files: string[]): void {
        const normalizedFolder = this.normalizeFolder(folder);
        const entry: CacheEntry = {
            files: [...files], // Store a copy to prevent external mutation
            timestamp: Date.now(),
        };

        // Store in memory
        this.cache[normalizedFolder] = entry;

        // Store in persistent cache if available
        this.persistentCache?.set(normalizedFolder, entry);
    }

    /**
     * Invalidate cache entries
     * @param folder Optional folder path. If provided, only invalidates that folder.
     *               If not provided, invalidates all cached entries.
     */
    invalidate(folder?: string): void {
        if (folder === undefined) {
            // Invalidate all cache entries
            this.cache = {};
            this.persistentCache?.clear();
        } else {
            const normalizedFolder = this.normalizeFolder(folder);
            delete this.cache[normalizedFolder];
            this.persistentCache?.delete(normalizedFolder);
            
            // Also invalidate any parent folders that might contain this folder's files
            // and any child folders
            for (const cachedFolder of Object.keys(this.cache)) {
                if (this.isRelatedFolder(cachedFolder, normalizedFolder)) {
                    delete this.cache[cachedFolder];
                    this.persistentCache?.delete(cachedFolder);
                }
            }
        }
    }

    /**
     * Check if cache is valid for a specific folder
     * @param folder Folder path (empty string for root)
     * @returns True if cache exists and is not expired
     */
    isValid(folder: string = ''): boolean {
        const normalizedFolder = this.normalizeFolder(folder);
        const entry = this.cache[normalizedFolder];
        if (entry && this.isEntryValid(entry)) {
            return true;
        }

        // Check persistent cache
        if (this.persistentCache) {
            const persistedEntry = this.persistentCache.getWithTtl(normalizedFolder, this.ttl);
            return persistedEntry !== null;
        }

        return false;
    }

    /**
     * Clear entire cache (both memory and persistent)
     */
    clear(): void {
        this.cache = {};
        this.persistentCache?.clear();
    }

    /**
     * Get the current TTL setting
     * @returns TTL in milliseconds
     */
    getTtl(): number {
        return this.ttl;
    }

    /**
     * Get cache statistics for debugging/monitoring
     * @returns Object containing cache statistics
     */
    getStats(): { entryCount: number; folders: string[]; persistentSize: number; persistentEnabled: boolean } {
        const folders = Object.keys(this.cache);
        return {
            entryCount: folders.length,
            folders,
            persistentSize: this.persistentCache?.size() ?? 0,
            persistentEnabled: this.persistentCache?.isEnabled() ?? false,
        };
    }

    /**
     * Check if a cache entry is still valid (not expired)
     * @param entry Cache entry to check
     * @returns True if entry is still valid
     */
    private isEntryValid(entry: CacheEntry): boolean {
        return (Date.now() - entry.timestamp) < this.ttl;
    }

    /**
     * Normalize folder path for consistent cache keys
     * @param folder Folder path to normalize
     * @returns Normalized folder path
     */
    private normalizeFolder(folder: string): string {
        // Normalize path separators and remove trailing slashes
        return folder
            .replace(/\\/g, '/')
            .replace(/\/+$/, '')
            .toLowerCase();
    }

    /**
     * Check if two folders are related (one is parent/child of the other)
     * @param folder1 First folder path
     * @param folder2 Second folder path
     * @returns True if folders are related
     */
    private isRelatedFolder(folder1: string, folder2: string): boolean {
        // Root folder is related to everything
        if (folder1 === '' || folder2 === '') {
            return true;
        }
        
        // Check if one folder contains the other
        return folder1.startsWith(folder2 + '/') || folder2.startsWith(folder1 + '/');
    }

    /**
     * Close the persistent cache
     */
    close(): void {
        this.persistentCache?.close();
    }
}
