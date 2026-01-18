/**
 * SearchResultCache - LRU cache for search results to avoid repeated searches
 * 
 * This service provides an in-memory LRU cache for search results with
 * TTL-based expiration and automatic invalidation.
 * 
 * Features:
 * - Optional compression for large result sets
 * - Persistent backing via LMDB
 * - TTL-based expiration
 * 
 * Optionally backed by LMDB for persistence across server restarts.
 */

import { SearchResult, SearchOptions } from '../../types/index.js';
import { PersistentCache } from './PersistentCache.js';
import * as zlib from 'zlib';

/** Cache entry that may be compressed */
interface SearchCacheEntry {
    /** Cached search results (or compressed data if isCompressed is true) */
    results: SearchResult[] | string;
    /** Timestamp when the entry was created */
    timestamp: number;
    /** Whether the results are compressed */
    isCompressed?: boolean;
    /** Original size before compression (for stats) */
    originalSize?: number;
}

/** Configuration options for the cache */
export interface SearchResultCacheOptions {
    /** Maximum number of entries to cache (default: 50) */
    maxSize: number;
    /** TTL in milliseconds (default: 30000) */
    ttl: number;
    /** Enable compression for large results (default: false) */
    enableCompression: boolean;
    /** Compression threshold in bytes (default: 100000) */
    compressionThreshold: number;
}

/** Default options */
const DEFAULT_OPTIONS: SearchResultCacheOptions = {
    maxSize: 50,
    ttl: 30000,
    enableCompression: false,
    compressionThreshold: 100000,
};

export class SearchResultCache {
    /** In-memory cache store using Map for LRU behavior */
    private cache: Map<string, SearchCacheEntry> = new Map();
    
    /** Configuration options */
    private readonly options: SearchResultCacheOptions;

    /** Optional persistent cache backing store */
    private persistentCache: PersistentCache<SearchCacheEntry> | null = null;

    /** Statistics for compression */
    private compressionStats = {
        compressedCount: 0,
        uncompressedCount: 0,
        totalBytesSaved: 0,
    };

    /**
     * Creates a new SearchResultCache instance
     * @param maxSize Maximum number of entries to cache in memory (default: 50)
     * @param ttl Time-to-live in milliseconds (default: 30000 = 30 seconds)
     * @param persistentCache Optional persistent cache for LMDB backing
     * @param options Additional configuration options
     */
    constructor(
        maxSize: number = 50, 
        ttl: number = 30000, 
        persistentCache?: PersistentCache<SearchCacheEntry>,
        options?: Partial<SearchResultCacheOptions>
    ) {
        this.options = {
            maxSize: options?.maxSize ?? maxSize,
            ttl: options?.ttl ?? ttl,
            enableCompression: options?.enableCompression ?? DEFAULT_OPTIONS.enableCompression,
            compressionThreshold: options?.compressionThreshold ?? DEFAULT_OPTIONS.compressionThreshold,
        };
        this.persistentCache = persistentCache ?? null;
    }

    /**
     * Generate a cache key from search options
     * @param options Search options to generate key from
     * @returns Cache key string
     */
    private generateKey(options: SearchOptions): string {
        // Create a deterministic key from search options
        const parts: string[] = [];
        
        if (options.query) parts.push(`q:${options.query}`);
        if (options.glob) parts.push(`g:${options.glob}`);
        if (options.regex) parts.push(`r:${options.regex}`);
        if (options.limit !== undefined) parts.push(`l:${options.limit}`);
        if (options.offset !== undefined) parts.push(`o:${options.offset}`);
        if (options.minScore !== undefined) parts.push(`s:${options.minScore}`);
        if (options.tags) parts.push(`t:${options.tags.join(',')}`);
        if (options.frontmatter) parts.push(`f:${JSON.stringify(options.frontmatter)}`);
        
        return parts.join('|');
    }

    /**
     * Compress results if they exceed the threshold
     * @param results Results to potentially compress
     * @returns Cache entry with possibly compressed results
     */
    private maybeCompress(results: SearchResult[]): { data: SearchResult[] | string; isCompressed: boolean; originalSize: number } {
        const jsonStr = JSON.stringify(results);
        const originalSize = Buffer.byteLength(jsonStr, 'utf8');

        if (!this.options.enableCompression || originalSize < this.options.compressionThreshold) {
            this.compressionStats.uncompressedCount++;
            return { data: results, isCompressed: false, originalSize };
        }

        try {
            const compressed = zlib.deflateSync(jsonStr, { level: 6 }).toString('base64');
            const compressedSize = Buffer.byteLength(compressed, 'utf8');
            
            // Only use compression if it actually saves space
            if (compressedSize < originalSize) {
                this.compressionStats.compressedCount++;
                this.compressionStats.totalBytesSaved += (originalSize - compressedSize);
                return { data: compressed, isCompressed: true, originalSize };
            }
        } catch (error) {
            console.warn('Compression failed, storing uncompressed:', error);
        }

        this.compressionStats.uncompressedCount++;
        return { data: results, isCompressed: false, originalSize };
    }

    /**
     * Decompress results if they were compressed
     * @param entry Cache entry to decompress
     * @returns Decompressed results
     */
    private maybeDecompress(entry: SearchCacheEntry): SearchResult[] {
        if (!entry.isCompressed || typeof entry.results !== 'string') {
            return entry.results as SearchResult[];
        }

        try {
            const decompressed = zlib.inflateSync(Buffer.from(entry.results, 'base64')).toString('utf8');
            return JSON.parse(decompressed);
        } catch (error) {
            console.error('Decompression failed:', error);
            return [];
        }
    }

    /**
     * Retrieve cached results for search options
     * @param options Search options to look up
     * @returns Cached results or null if not found/expired
     */
    get(options: SearchOptions): SearchResult[] | null {
        const key = this.generateKey(options);
        
        // Check in-memory cache first
        const memoryEntry = this.cache.get(key);
        if (memoryEntry) {
            // Check if entry has expired
            if (Date.now() - memoryEntry.timestamp > this.options.ttl) {
                this.cache.delete(key);
                this.persistentCache?.delete(key);
                return null;
            }

            // Move to end (most recently used) by re-inserting
            this.cache.delete(key);
            this.cache.set(key, memoryEntry);

            // Decompress if needed and return a deep copy
            const results = this.maybeDecompress(memoryEntry);
            return this.deepCopyResults(results);
        }

        // Check persistent cache if available
        if (this.persistentCache) {
            const persistedEntry = this.persistentCache.getWithTtl(key, this.options.ttl);
            if (persistedEntry) {
                // Warm memory cache with the persisted entry
                this.setInMemory(key, persistedEntry);
                const results = this.maybeDecompress(persistedEntry);
                return this.deepCopyResults(results);
            }
        }

        return null;
    }

    /**
     * Store search results in cache
     * @param options Search options (used as key)
     * @param results Search results to cache
     */
    set(options: SearchOptions, results: SearchResult[]): void {
        const key = this.generateKey(options);
        
        // Store a deep copy and potentially compress
        const resultsCopy = this.deepCopyResults(results);
        const { data, isCompressed, originalSize } = this.maybeCompress(resultsCopy);
        
        const entry: SearchCacheEntry = {
            results: data,
            timestamp: Date.now(),
            isCompressed,
            originalSize,
        };

        // Store in memory cache
        this.setInMemory(key, entry);

        // Store in persistent cache if available
        this.persistentCache?.set(key, entry);
    }

    /**
     * Store entry in memory cache with LRU eviction
     * @param key Cache key
     * @param entry Cache entry to store
     */
    private setInMemory(key: string, entry: SearchCacheEntry): void {
        // If key exists, delete first to update position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict oldest entries if at capacity
        while (this.cache.size >= this.options.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(key, entry);
    }

    /**
     * Deep copy search results to prevent mutation
     * @param results Results to copy
     * @returns Deep copy of results
     */
    private deepCopyResults(results: SearchResult[]): SearchResult[] {
        return results.map(r => ({
            ...r,
            matches: r.matches.map(m => ({ ...m })),
        }));
    }

    /**
     * Invalidate all cached search results
     * Called when vault contents change
     */
    invalidate(): void {
        this.cache.clear();
        this.persistentCache?.clear();
    }

    /**
     * Get cache statistics for monitoring
     * @returns Object containing cache statistics
     */
    getStats(): { 
        size: number; 
        maxSize: number; 
        ttl: number; 
        persistentSize: number; 
        persistentEnabled: boolean;
        compressionEnabled: boolean;
        compressionStats: { compressedCount: number; uncompressedCount: number; totalBytesSaved: number };
    } {
        return {
            size: this.cache.size,
            maxSize: this.options.maxSize,
            ttl: this.options.ttl,
            persistentSize: this.persistentCache?.size() ?? 0,
            persistentEnabled: this.persistentCache?.isEnabled() ?? false,
            compressionEnabled: this.options.enableCompression,
            compressionStats: { ...this.compressionStats },
        };
    }

    /**
     * Get the maximum cache size
     * @returns Maximum number of entries
     */
    getMaxSize(): number {
        return this.options.maxSize;
    }

    /**
     * Get the TTL setting
     * @returns TTL in milliseconds
     */
    getTtl(): number {
        return this.options.ttl;
    }

    /**
     * Check if compression is enabled
     * @returns True if compression is enabled
     */
    isCompressionEnabled(): boolean {
        return this.options.enableCompression;
    }

    /**
     * Close the persistent cache
     */
    close(): void {
        this.persistentCache?.close();
    }
}
