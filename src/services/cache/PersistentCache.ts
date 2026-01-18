/**
 * PersistentCache - Generic LMDB-backed persistent cache
 * 
 * This service provides a persistent key-value store using LMDB (Lightning Memory-Mapped Database).
 * It supports TTL-based expiration, mtime validation for content caching, and compression.
 * 
 * LMDB is chosen for its:
 * - Excellent read performance (memory-mapped B+tree)
 * - ACID transactions
 * - Fast startup time
 * - No background compaction (predictable latency)
 */

import { open, Database, RootDatabase } from 'lmdb';
import * as fs from 'fs';

/**
 * Entry stored in the persistent cache
 */
interface PersistentCacheEntry<T> {
    /** The cached data */
    data: T;
    /** Timestamp when the entry was created (ms since epoch) */
    timestamp: number;
    /** Optional file modification time for content validation */
    mtime?: number;
}

/**
 * Options for creating a PersistentCache instance
 */
export interface PersistentCacheOptions {
    /** Path to the LMDB database directory */
    dbPath: string;
    /** Name of the database (used for separate named databases) */
    dbName: string;
    /** Enable compression for values (default: true) */
    compression?: boolean;
    /** Maximum database size in bytes (default: 1GB) */
    maxDbSize?: number;
}

/**
 * Shared LMDB environment manager
 * Manages a single LMDB environment with multiple named databases
 */
class LmdbEnvironmentManager {
    private static instance: LmdbEnvironmentManager | null = null;
    private rootDb: RootDatabase | null = null;
    private databases: Map<string, Database<PersistentCacheEntry<unknown>, string>> = new Map();
    private dbPath: string = '';
    private refCount: number = 0;

    /**
     * Get the singleton instance
     */
    static getInstance(): LmdbEnvironmentManager {
        if (!LmdbEnvironmentManager.instance) {
            LmdbEnvironmentManager.instance = new LmdbEnvironmentManager();
        }
        return LmdbEnvironmentManager.instance;
    }

    /**
     * Reset the singleton (for testing)
     */
    static resetInstance(): void {
        if (LmdbEnvironmentManager.instance) {
            LmdbEnvironmentManager.instance.rootDb = null;
            LmdbEnvironmentManager.instance.databases.clear();
            LmdbEnvironmentManager.instance.dbPath = '';
            LmdbEnvironmentManager.instance.refCount = 0;
        }
        LmdbEnvironmentManager.instance = null;
    }

    /**
     * Open or get an existing database
     * @param options Database options
     * @returns The LMDB database instance
     */
    openDatabase<T>(options: PersistentCacheOptions): Database<PersistentCacheEntry<T>, string> | null {
        try {
            // Ensure directory exists
            if (!fs.existsSync(options.dbPath)) {
                fs.mkdirSync(options.dbPath, { recursive: true });
            }

            // Open root database if not already open or if path changed
            if (!this.rootDb || this.dbPath !== options.dbPath) {
                // Close existing if path changed
                if (this.rootDb && this.dbPath !== options.dbPath) {
                    try {
                        this.rootDb.close();
                    } catch {
                        // Ignore close errors
                    }
                    this.rootDb = null;
                    this.databases.clear();
                }

                this.dbPath = options.dbPath;
                this.rootDb = open({
                    path: options.dbPath,
                    compression: options.compression ?? true,
                    maxDbs: 10, // Support multiple named databases
                    mapSize: options.maxDbSize ?? 1024 * 1024 * 1024, // 1GB default
                });
            }

            // Check if database already exists
            const existingDb = this.databases.get(options.dbName);
            if (existingDb) {
                this.refCount++;
                return existingDb as Database<PersistentCacheEntry<T>, string>;
            }

            // Open named database
            const db = this.rootDb.openDB<PersistentCacheEntry<T>, string>({
                name: options.dbName,
                compression: options.compression ?? true,
            });

            this.databases.set(options.dbName, db as Database<PersistentCacheEntry<unknown>, string>);
            this.refCount++;
            
            return db;
        } catch (error) {
            console.error(`Failed to open LMDB database ${options.dbName}:`, error);
            return null;
        }
    }

    /**
     * Close a specific database reference
     * @param dbName Name of the database
     */
    closeDatabase(dbName: string): void {
        this.refCount--;
        // Don't actually close until all references are gone
        // LMDB handles this internally
    }

    /**
     * Close all databases and the environment
     */
    async closeAll(): Promise<void> {
        if (this.rootDb) {
            try {
                await this.rootDb.close();
            } catch (error) {
                console.error('Error closing LMDB environment:', error);
            }
            this.rootDb = null;
            this.databases.clear();
            this.refCount = 0;
            this.dbPath = '';
        }
        // Reset the singleton so it can be reopened with a different path
        LmdbEnvironmentManager.resetInstance();
    }

    /**
     * Check if the environment is open
     */
    isOpen(): boolean {
        return this.rootDb !== null;
    }

    /**
     * Get statistics about the environment
     */
    getStats(): { isOpen: boolean; dbPath: string; databases: string[]; refCount: number } {
        return {
            isOpen: this.isOpen(),
            dbPath: this.dbPath,
            databases: Array.from(this.databases.keys()),
            refCount: this.refCount,
        };
    }
}

/**
 * PersistentCache - Generic persistent cache backed by LMDB
 */
export class PersistentCache<T> {
    /** The LMDB database instance */
    private db: Database<PersistentCacheEntry<T>, string> | null = null;
    
    /** Database name for reference */
    private readonly dbName: string;
    
    /** Whether persistence is enabled */
    private readonly enabled: boolean;

    /**
     * Creates a new PersistentCache instance
     * @param options Options for the persistent cache
     */
    constructor(options: PersistentCacheOptions) {
        this.dbName = options.dbName;
        this.db = LmdbEnvironmentManager.getInstance().openDatabase<T>(options);
        this.enabled = this.db !== null;
        
        if (!this.enabled) {
            console.warn(`PersistentCache ${options.dbName}: Running in memory-only mode (LMDB unavailable)`);
        }
    }

    /**
     * Check if persistence is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Get a value from the cache
     * @param key Cache key
     * @returns The cached value or null if not found
     */
    get(key: string): T | null {
        if (!this.db) return null;

        try {
            const entry = this.db.get(key);
            if (!entry) return null;
            return entry.data;
        } catch (error) {
            console.error(`PersistentCache.get error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Get a value with TTL validation
     * @param key Cache key
     * @param ttl Time-to-live in milliseconds
     * @returns The cached value or null if not found or expired
     */
    getWithTtl(key: string, ttl: number): T | null {
        if (!this.db) return null;

        try {
            const entry = this.db.get(key);
            if (!entry) return null;

            // Check TTL
            if (Date.now() - entry.timestamp > ttl) {
                // Expired - delete synchronously
                this.db.removeSync(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.error(`PersistentCache.getWithTtl error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Get a value with mtime validation (for content cache)
     * @param key Cache key
     * @param currentMtime Current file modification time
     * @returns The cached value or null if not found or stale
     */
    getWithMtime(key: string, currentMtime: number): T | null {
        if (!this.db) return null;

        try {
            const entry = this.db.get(key);
            if (!entry) return null;

            // Check mtime
            if (entry.mtime !== currentMtime) {
                // Stale - delete synchronously
                this.db.removeSync(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.error(`PersistentCache.getWithMtime error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Get a value with both TTL and mtime validation
     * @param key Cache key
     * @param ttl Time-to-live in milliseconds
     * @param currentMtime Current file modification time
     * @returns The cached value or null if not found, expired, or stale
     */
    getWithTtlAndMtime(key: string, ttl: number, currentMtime: number): T | null {
        if (!this.db) return null;

        try {
            const entry = this.db.get(key);
            if (!entry) return null;

            // Check TTL
            if (Date.now() - entry.timestamp > ttl) {
                this.db.removeSync(key);
                return null;
            }

            // Check mtime
            if (entry.mtime !== undefined && entry.mtime !== currentMtime) {
                this.db.removeSync(key);
                return null;
            }

            return entry.data;
        } catch (error) {
            console.error(`PersistentCache.getWithTtlAndMtime error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Store a value in the cache (synchronous)
     * @param key Cache key
     * @param data Data to cache
     * @param mtime Optional file modification time
     */
    set(key: string, data: T, mtime?: number): void {
        if (!this.db) return;

        try {
            const entry: PersistentCacheEntry<T> = {
                data,
                timestamp: Date.now(),
                mtime,
            };
            // Use synchronous put for immediate availability
            this.db.putSync(key, entry);
        } catch (error) {
            console.error(`PersistentCache.set error for key ${key}:`, error);
        }
    }

    /**
     * Delete a value from the cache (synchronous)
     * @param key Cache key
     */
    delete(key: string): void {
        if (!this.db) return;

        try {
            this.db.removeSync(key);
        } catch (error) {
            console.error(`PersistentCache.delete error for key ${key}:`, error);
        }
    }

    /**
     * Clear all entries from this database
     */
    clear(): void {
        if (!this.db) return;

        try {
            this.db.clearSync();
        } catch (error) {
            console.error(`PersistentCache.clear error:`, error);
        }
    }

    /**
     * Check if a key exists in the cache
     * @param key Cache key
     * @returns True if the key exists
     */
    has(key: string): boolean {
        if (!this.db) return false;

        try {
            return this.db.doesExist(key);
        } catch (error) {
            console.error(`PersistentCache.has error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Get all keys in the cache
     * @returns Array of keys
     */
    keys(): string[] {
        if (!this.db) return [];

        try {
            const keys: string[] = [];
            for (const { key } of this.db.getRange({})) {
                keys.push(key);
            }
            return keys;
        } catch (error) {
            console.error(`PersistentCache.keys error:`, error);
            return [];
        }
    }

    /**
     * Get the number of entries in the cache
     * @returns Number of entries
     */
    size(): number {
        if (!this.db) return 0;

        try {
            return this.db.getCount();
        } catch (error) {
            console.error(`PersistentCache.size error:`, error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     * @returns Statistics object
     */
    getStats(): { enabled: boolean; dbName: string; size: number } {
        return {
            enabled: this.enabled,
            dbName: this.dbName,
            size: this.size(),
        };
    }

    /**
     * Close this cache (decrements reference count)
     */
    close(): void {
        LmdbEnvironmentManager.getInstance().closeDatabase(this.dbName);
    }

    /**
     * Close all persistent caches and the LMDB environment
     * Call this on server shutdown
     */
    static async closeAll(): Promise<void> {
        await LmdbEnvironmentManager.getInstance().closeAll();
    }

    /**
     * Get the environment manager stats
     */
    static getEnvironmentStats(): { isOpen: boolean; dbPath: string; databases: string[]; refCount: number } {
        return LmdbEnvironmentManager.getInstance().getStats();
    }
}
