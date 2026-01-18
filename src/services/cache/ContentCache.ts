/**
 * ContentCache - LRU cache for file contents with pre-computed metadata
 * 
 * This service provides an in-memory LRU (Least Recently Used) cache for file contents
 * with modification time tracking for automatic invalidation.
 * 
 * Enhanced with:
 * - Parsed frontmatter caching
 * - Pre-computed word and line counts
 * - Extracted inline tags
 * 
 * Optionally backed by LMDB for persistence across server restarts.
 */

import { PersistentCache } from './PersistentCache.js';

/** Parsed frontmatter structure (matches FrontmatterParser output) */
export interface CachedFrontmatter {
    /** Tags extracted from frontmatter */
    tags: string[];
    /** All frontmatter data as key-value pairs */
    data: Record<string, unknown>;
    /** Whether the file has frontmatter */
    hasFrontmatter: boolean;
}

/** Enhanced content cache entry with pre-computed metadata */
export interface ContentCacheEntry {
    /** The file content */
    content: string;
    /** File modification time in milliseconds for invalidation */
    mtime: number;
    /** Parsed frontmatter (optional, computed lazily or on set) */
    parsedFrontmatter?: CachedFrontmatter;
    /** Pre-computed word count */
    wordCount?: number;
    /** Pre-computed line count */
    lineCount?: number;
    /** Extracted inline tags from content body */
    inlineTags?: string[];
}

/** Metadata returned when retrieving cached content */
export interface ContentMetadata {
    /** Parsed frontmatter */
    frontmatter: CachedFrontmatter | null;
    /** Word count */
    wordCount: number;
    /** Line count */
    lineCount: number;
    /** Inline tags */
    inlineTags: string[];
    /** All tags (frontmatter + inline) */
    allTags: string[];
}

export class ContentCache {
    /** In-memory cache store using Map for LRU behavior (Map preserves insertion order) */
    private cache: Map<string, ContentCacheEntry> = new Map();
    
    /** Maximum number of entries in the in-memory cache */
    private readonly maxSize: number;

    /** Optional persistent cache backing store */
    private persistentCache: PersistentCache<ContentCacheEntry> | null = null;

    /** Regex pattern for extracting inline tags */
    private readonly inlineTagPattern: RegExp = /#([\w/-]+)/g;

    /**
     * Creates a new ContentCache instance
     * @param maxSize Maximum number of entries to cache in memory (default: 100)
     * @param persistentCache Optional persistent cache for LMDB backing
     */
    constructor(maxSize: number = 100, persistentCache?: PersistentCache<ContentCacheEntry>) {
        this.maxSize = maxSize;
        this.persistentCache = persistentCache ?? null;
    }

    /**
     * Retrieve cached content for a file
     * @param filePath File path (used as cache key)
     * @param currentMtime Current file modification time for validation
     * @returns Cached content or null if not found/stale
     */
    get(filePath: string, currentMtime: number): string | null {
        const normalizedPath = this.normalizePath(filePath);
        
        // Check in-memory cache first
        const memoryEntry = this.cache.get(normalizedPath);
        if (memoryEntry) {
            // Check if file has been modified since caching
            if (memoryEntry.mtime !== currentMtime) {
                // File modified, invalidate cache entry
                this.cache.delete(normalizedPath);
                this.persistentCache?.delete(normalizedPath);
                return null;
            }

            // Move to end (most recently used) by re-inserting
            this.cache.delete(normalizedPath);
            this.cache.set(normalizedPath, memoryEntry);

            return memoryEntry.content;
        }

        // Check persistent cache if available
        if (this.persistentCache) {
            const persistedEntry = this.persistentCache.getWithMtime(normalizedPath, currentMtime);
            if (persistedEntry) {
                // Warm memory cache with the persisted entry
                this.setInMemory(normalizedPath, persistedEntry);
                return persistedEntry.content;
            }
        }

        return null;
    }

    /**
     * Retrieve cached entry with full metadata
     * @param filePath File path (used as cache key)
     * @param currentMtime Current file modification time for validation
     * @returns Full cache entry or null if not found/stale
     */
    getEntry(filePath: string, currentMtime: number): ContentCacheEntry | null {
        const normalizedPath = this.normalizePath(filePath);
        
        // Check in-memory cache first
        const memoryEntry = this.cache.get(normalizedPath);
        if (memoryEntry) {
            if (memoryEntry.mtime !== currentMtime) {
                this.cache.delete(normalizedPath);
                this.persistentCache?.delete(normalizedPath);
                return null;
            }

            // Move to end (most recently used)
            this.cache.delete(normalizedPath);
            this.cache.set(normalizedPath, memoryEntry);

            return memoryEntry;
        }

        // Check persistent cache
        if (this.persistentCache) {
            const persistedEntry = this.persistentCache.getWithMtime(normalizedPath, currentMtime);
            if (persistedEntry) {
                this.setInMemory(normalizedPath, persistedEntry);
                return persistedEntry;
            }
        }

        return null;
    }

    /**
     * Get metadata for a cached file
     * @param filePath File path
     * @param currentMtime Current file modification time
     * @returns Metadata or null if not cached
     */
    getMetadata(filePath: string, currentMtime: number): ContentMetadata | null {
        const entry = this.getEntry(filePath, currentMtime);
        if (!entry) return null;

        const frontmatterTags = entry.parsedFrontmatter?.tags ?? [];
        const inlineTags = entry.inlineTags ?? [];

        return {
            frontmatter: entry.parsedFrontmatter ?? null,
            wordCount: entry.wordCount ?? 0,
            lineCount: entry.lineCount ?? 0,
            inlineTags,
            allTags: [...new Set([...frontmatterTags, ...inlineTags])],
        };
    }

    /**
     * Store content in cache (basic, without metadata)
     * @param filePath File path (used as cache key)
     * @param content File content to cache
     * @param mtime File modification time
     */
    set(filePath: string, content: string, mtime: number): void {
        const normalizedPath = this.normalizePath(filePath);
        
        // Compute metadata automatically
        const wordCount = this.computeWordCount(content);
        const lineCount = this.computeLineCount(content);
        const inlineTags = this.extractInlineTags(content);

        const entry: ContentCacheEntry = { 
            content, 
            mtime,
            wordCount,
            lineCount,
            inlineTags,
        };

        // Store in memory cache
        this.setInMemory(normalizedPath, entry);

        // Store in persistent cache if available
        this.persistentCache?.set(normalizedPath, entry, mtime);
    }

    /**
     * Store content with pre-computed metadata (more efficient when frontmatter is already parsed)
     * @param filePath File path (used as cache key)
     * @param content File content to cache
     * @param mtime File modification time
     * @param frontmatter Parsed frontmatter
     */
    setWithMetadata(
        filePath: string, 
        content: string, 
        mtime: number, 
        frontmatter: CachedFrontmatter
    ): void {
        const normalizedPath = this.normalizePath(filePath);
        
        const entry: ContentCacheEntry = {
            content,
            mtime,
            parsedFrontmatter: frontmatter,
            wordCount: this.computeWordCount(content),
            lineCount: this.computeLineCount(content),
            inlineTags: this.extractInlineTags(content),
        };

        this.setInMemory(normalizedPath, entry);
        this.persistentCache?.set(normalizedPath, entry, mtime);
    }

    /**
     * Update cached entry with frontmatter (for lazy parsing)
     * @param filePath File path
     * @param frontmatter Parsed frontmatter to add
     */
    updateFrontmatter(filePath: string, frontmatter: CachedFrontmatter): void {
        const normalizedPath = this.normalizePath(filePath);
        const entry = this.cache.get(normalizedPath);
        
        if (entry) {
            entry.parsedFrontmatter = frontmatter;
            // Update persistent cache too
            this.persistentCache?.set(normalizedPath, entry, entry.mtime);
        }
    }

    /**
     * Compute word count for content
     * @param content File content
     * @returns Number of words
     */
    private computeWordCount(content: string): number {
        if (!content) return 0;
        return content.split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Compute line count for content
     * @param content File content
     * @returns Number of lines
     */
    private computeLineCount(content: string): number {
        if (!content) return 0;
        return content.split('\n').length;
    }

    /**
     * Extract inline tags from content body
     * @param content File content
     * @returns Array of normalized inline tags
     */
    private extractInlineTags(content: string): string[] {
        if (!content) return [];

        const matches = content.match(this.inlineTagPattern);
        if (!matches) return [];

        // Normalize and deduplicate
        const tags = matches.map(m => m.slice(1).toLowerCase());
        return [...new Set(tags)];
    }

    /**
     * Store entry in memory cache with LRU eviction
     * @param normalizedPath Normalized file path
     * @param entry Cache entry to store
     */
    private setInMemory(normalizedPath: string, entry: ContentCacheEntry): void {
        // If key exists, delete first to update position
        if (this.cache.has(normalizedPath)) {
            this.cache.delete(normalizedPath);
        }

        // Evict oldest entries if at capacity
        while (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(normalizedPath, entry);
    }

    /**
     * Invalidate a specific cache entry
     * @param filePath File path to invalidate
     */
    invalidate(filePath: string): void {
        const normalizedPath = this.normalizePath(filePath);
        this.cache.delete(normalizedPath);
        this.persistentCache?.delete(normalizedPath);
    }

    /**
     * Clear entire cache (both memory and persistent)
     */
    clear(): void {
        this.cache.clear();
        this.persistentCache?.clear();
    }

    /**
     * Check if a file is in the cache
     * @param filePath File path to check
     * @returns True if file is cached (may still be stale)
     */
    has(filePath: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        return this.cache.has(normalizedPath) || (this.persistentCache?.has(normalizedPath) ?? false);
    }

    /**
     * Get cache statistics for debugging/monitoring
     * @returns Object containing cache statistics
     */
    getStats(): { size: number; maxSize: number; files: string[]; persistentSize: number; persistentEnabled: boolean } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            files: Array.from(this.cache.keys()),
            persistentSize: this.persistentCache?.size() ?? 0,
            persistentEnabled: this.persistentCache?.isEnabled() ?? false,
        };
    }

    /**
     * Get the maximum cache size
     * @returns Maximum number of entries
     */
    getMaxSize(): number {
        return this.maxSize;
    }

    /**
     * Normalize file path for consistent cache keys
     * @param filePath File path to normalize
     * @returns Normalized file path
     */
    private normalizePath(filePath: string): string {
        // Normalize path separators for cross-platform consistency
        return filePath.replace(/\\/g, '/');
    }

    /**
     * Close the persistent cache
     */
    close(): void {
        this.persistentCache?.close();
    }
}
