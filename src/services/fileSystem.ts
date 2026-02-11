import * as fs from 'fs/promises';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { config } from '../config/index.js';
import { SearchResult, SearchOptions, CacheStats } from '../types/index.js';
import { FileListCache } from './cache/FileListCache.js';
import { ContentCache, CachedFrontmatter, ContentCacheEntry } from './cache/ContentCache.js';
import { SearchResultCache } from './cache/SearchResultCache.js';
import { PersistentCache } from './cache/PersistentCache.js';
import { SearchResultFilter } from './search/SearchResultFilter.js';
import { SearchScorer } from './search/SearchScorer.js';
import { MatchExtractor } from './search/MatchExtractor.js';
import { InvertedIndex } from './search/InvertedIndex.js';
import { PathTrie } from './search/PathTrie.js';
import { FrontmatterParser, ParsedFrontmatter } from './FrontmatterParser.js';
import { FileWatcher } from './FileWatcher.js';

/** Directories to ignore when listing files */
const IGNORED_DIRECTORIES = new Set(['.obsidian', '.git', '.DS_Store', 'node_modules']);

/** Entry type for FileListCache persistence */
interface FileListCacheEntry {
    files: string[];
    timestamp: number;
}

/** Entry type for SearchResultCache persistence */
interface SearchCacheEntry {
    results: SearchResult[];
    timestamp: number;
}

/**
 * FileSystemService - Handles file system operations for the Obsidian vault
 * 
 * This service orchestrates file operations and search functionality with
 * multiple optimization layers:
 * - InvertedIndex for fast text search
 * - PathTrie for fast glob matching
 * - ContentCache with pre-computed metadata (frontmatter, word/line counts)
 * - SearchResultCache with optional compression
 * - Streaming search for large vaults
 */
export class FileSystemService {
    /** Cache for file listings */
    private fileListCache: FileListCache;

    /** Cache for file contents with metadata */
    private contentCache: ContentCache;

    /** Cache for search results */
    private searchResultCache: SearchResultCache;
    
    /** Filter for search results */
    private searchResultFilter: SearchResultFilter;

    /** Scorer for search results */
    private searchScorer: SearchScorer;

    /** Extractor for match context and snippets */
    private matchExtractor: MatchExtractor;

    /** Parser for YAML frontmatter */
    private frontmatterParser: FrontmatterParser;

    /** File watcher for automatic cache invalidation */
    private fileWatcher: FileWatcher | null = null;

    /** Inverted index for fast text search */
    private invertedIndex: InvertedIndex | null = null;

    /** Path trie for fast glob matching */
    private pathTrie: PathTrie | null = null;

    /** Whether persistent cache is enabled */
    private persistentCacheEnabled: boolean = false;

    /** Whether the service has been initialized with warmup */
    private isWarmedUp: boolean = false;

    /**
     * Creates a new FileSystemService instance
     */
    constructor(
        fileListCache?: FileListCache,
        contentCache?: ContentCache,
        searchResultCache?: SearchResultCache,
        searchResultFilter?: SearchResultFilter,
        searchScorer?: SearchScorer,
        matchExtractor?: MatchExtractor,
        frontmatterParser?: FrontmatterParser
    ) {
        // Initialize persistent caches if enabled and not provided
        if (config.enablePersistentCache && !fileListCache && !contentCache && !searchResultCache) {
            this.persistentCacheEnabled = true;
            const cachePath = config.cachePath;

            const fileListPersistent = new PersistentCache<FileListCacheEntry>({
                dbPath: cachePath,
                dbName: 'fileList',
                compression: false,
            });

            const contentPersistent = new PersistentCache<ContentCacheEntry>({
                dbPath: cachePath,
                dbName: 'content',
                compression: true,
            });

            const searchPersistent = new PersistentCache<SearchCacheEntry>({
                dbPath: cachePath,
                dbName: 'search',
                compression: true,
            });

            this.fileListCache = new FileListCache(config.fileListCacheTtl, fileListPersistent);
            this.contentCache = new ContentCache(config.contentCacheMaxSize, contentPersistent);
            this.searchResultCache = new SearchResultCache(
                config.searchCacheMaxSize,
                config.searchCacheTtl,
                searchPersistent,
                {
                    enableCompression: config.enableCompression,
                    compressionThreshold: config.compressionThreshold,
                }
            );
        } else {
            this.fileListCache = fileListCache ?? new FileListCache(config.fileListCacheTtl);
            this.contentCache = contentCache ?? new ContentCache(config.contentCacheMaxSize);
            this.searchResultCache = searchResultCache ?? new SearchResultCache(
                config.searchCacheMaxSize,
                config.searchCacheTtl,
                undefined,
                {
                    enableCompression: config.enableCompression,
                    compressionThreshold: config.compressionThreshold,
                }
            );
        }

        this.searchResultFilter = searchResultFilter ?? new SearchResultFilter();
        this.searchScorer = searchScorer ?? new SearchScorer();
        this.matchExtractor = matchExtractor ?? new MatchExtractor();
        this.frontmatterParser = frontmatterParser ?? new FrontmatterParser();

        // Initialize inverted index if enabled
        if (config.enableInvertedIndex) {
            this.invertedIndex = new InvertedIndex({
                minWordLength: config.invertedIndexMinWordLength,
                maxWordsPerFile: config.invertedIndexMaxWordsPerFile,
            });
        }

        // Initialize path trie if enabled
        if (config.enablePathTrie) {
            this.pathTrie = new PathTrie();
        }

        // Start file watcher if enabled
        if (config.enableFileWatcher) {
            this.startFileWatcher();
        }

        // Perform cache warmup if enabled (async, don't await)
        if (config.enableCacheWarmup) {
            this.warmCache().catch(err => console.error('Cache warmup failed:', err));
        }
    }

    /**
     * Start the file watcher for automatic cache invalidation
     */
    private startFileWatcher(): void {
        this.fileWatcher = new FileWatcher(config.vaultPath, {
            debounceDelay: config.fileWatcherDebounce,
        });
        
        this.fileWatcher.start((eventType, filePath) => {
            switch (eventType) {
                case 'add':
                    // File added - update indexes and invalidate caches
                    this.fileListCache.invalidate();
                    this.searchResultCache.invalidate();
                    this.pathTrie?.insert(filePath);
                    break;
                    
                case 'unlink':
                    // File deleted - update indexes and invalidate caches
                    this.fileListCache.invalidate();
                    this.searchResultCache.invalidate();
                    this.contentCache.invalidate(filePath);
                    this.invertedIndex?.invalidate(filePath);
                    this.pathTrie?.remove(filePath);
                    break;
                    
                case 'addDir':
                case 'unlinkDir':
                    // Directory changed
                    this.fileListCache.invalidate();
                    this.searchResultCache.invalidate();
                    break;
                    
                case 'change':
                    // Content changed - invalidate content and search caches, re-index
                    this.contentCache.invalidate(filePath);
                    this.searchResultCache.invalidate();
                    this.invertedIndex?.invalidate(filePath);
                    break;
            }
        });
    }

    /**
     * Warm up caches on startup
     */
    async warmCache(): Promise<void> {
        if (this.isWarmedUp) return;

        console.error('Starting cache warmup...');
        const startTime = Date.now();

        try {
            // List all files and populate path trie
            const files = await this.listVaultFiles();
            
            // Populate path trie
            if (this.pathTrie) {
                for (const file of files) {
                    this.pathTrie.insert(file);
                }
            }

            // Pre-load recent files into content cache and index
            const filesToWarm = files.slice(0, config.warmupFileCount);
            
            await Promise.all(filesToWarm.map(async (file) => {
                try {
                    const content = await this.readNote(file);
                    // Index content for inverted index
                    this.invertedIndex?.indexContent(file, content);
                } catch {
                    // Ignore errors during warmup
                }
            }));

            this.isWarmedUp = true;
            console.error(`Cache warmup completed in ${Date.now() - startTime}ms (${filesToWarm.length} files)`);
        } catch (error) {
            console.error('Cache warmup error:', error);
        }
    }

    /**
     * Stop the file watcher
     */
    async stopFileWatcher(): Promise<void> {
        if (this.fileWatcher) {
            await this.fileWatcher.stop();
            this.fileWatcher = null;
        }
    }

    /**
     * Close all resources
     */
    async close(): Promise<void> {
        await this.stopFileWatcher();
        this.fileListCache.close();
        this.contentCache.close();
        this.searchResultCache.close();

        if (this.persistentCacheEnabled) {
            await PersistentCache.closeAll();
        }
    }

    /**
     * List all markdown files in the vault
     */
    async listVaultFiles(folder: string = ''): Promise<string[]> {
        const cachedFiles = this.fileListCache.get(folder);
        if (cachedFiles !== null) {
            return cachedFiles;
        }

        const basePath = path.join(config.vaultPath, folder);
        
        try {
            const entries = await fs.readdir(basePath, { 
                recursive: true, 
                withFileTypes: true 
            });

            const files = entries
                .filter(entry => {
                    if (!entry.isFile() || !entry.name.endsWith('.md')) {
                        return false;
                    }
                    
                    const parentPath = entry.parentPath ?? (entry as any).path ?? '';
                    const relativePath = path.relative(basePath, parentPath);
                    const pathParts = relativePath.split(path.sep);
                    
                    return !pathParts.some(part => IGNORED_DIRECTORIES.has(part));
                })
                .map(entry => {
                    const parentPath = entry.parentPath ?? (entry as any).path ?? '';
                    const fullPath = path.join(parentPath, entry.name);
                    return path.relative(config.vaultPath, fullPath);
                });

            this.fileListCache.set(folder, files);
            
            // Update path trie with new files
            if (this.pathTrie && folder === '') {
                this.pathTrie.clear();
                for (const file of files) {
                    this.pathTrie.insert(file);
                }
            }
            
            return files;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    /**
     * Invalidate the file list cache
     */
    invalidateCache(folder?: string): void {
        this.fileListCache.invalidate(folder);
        this.searchResultCache.invalidate();
    }

    /**
     * Read the content of a note with caching and metadata
     */
    async readNote(notePath: string): Promise<string> {
        const fullPath = path.join(config.vaultPath, notePath);
        
        const stats = await fs.stat(fullPath);
        const mtime = stats.mtimeMs;
        
        const cachedContent = this.contentCache.get(notePath, mtime);
        if (cachedContent !== null) {
            return cachedContent;
        }
        
        const content = await fs.readFile(fullPath, 'utf-8');
        
        // Parse frontmatter and store with metadata
        const parsed = this.frontmatterParser.parse(content);
        const cachedFrontmatter: CachedFrontmatter = {
            tags: parsed.tags,
            data: parsed.data,
            hasFrontmatter: parsed.hasFrontmatter,
        };
        
        this.contentCache.setWithMetadata(notePath, content, mtime, cachedFrontmatter);
        
        // Index content for inverted index
        this.invertedIndex?.indexContent(notePath, content);
        
        return content;
    }

    /**
     * Read note with parsed frontmatter
     */
    async readNoteWithFrontmatter(notePath: string): Promise<ParsedFrontmatter & { path: string }> {
        const content = await this.readNote(notePath);
        const parsed = this.frontmatterParser.parse(content);
        return {
            ...parsed,
            path: notePath,
        };
    }

    /**
     * Check if a file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create a new note
     */
    async createNote(notePath: string, content: string): Promise<void> {
        const fullPath = path.join(config.vaultPath, notePath);
        const dir = path.dirname(fullPath);

        if (await this.fileExists(fullPath)) {
            throw new Error(`Note already exists: ${notePath}`);
        }

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        
        this.fileListCache.invalidate();
        this.contentCache.invalidate(notePath);
        this.searchResultCache.invalidate();
        this.pathTrie?.insert(notePath);
    }

    /**
     * Update an existing note
     */
    async updateNote(notePath: string, content: string, createIfNotExists: boolean = false): Promise<void> {
        const fullPath = path.join(config.vaultPath, notePath);

        if (!(await this.fileExists(fullPath))) {
            if (createIfNotExists) {
                await this.createNote(notePath, content);
                return;
            } else {
                throw new Error(`Note not found: ${notePath}`);
            }
        }

        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        
        this.contentCache.invalidate(notePath);
        this.searchResultCache.invalidate();
        this.invertedIndex?.invalidate(notePath);
    }

    /**
     * Delete a note
     */
    async deleteNote(notePath: string): Promise<void> {
        const fullPath = path.join(config.vaultPath, notePath);

        try {
            await fs.unlink(fullPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`Note not found: ${notePath}`);
            }
            throw error;
        }

        const dir = path.dirname(fullPath);
        if (dir !== config.vaultPath) {
            try {
                const items = await fs.readdir(dir);
                if (items.length === 0) {
                    await fs.rmdir(dir);
                }
            } catch {
                // Ignore
            }
        }
        
        this.fileListCache.invalidate();
        this.contentCache.invalidate(notePath);
        this.searchResultCache.invalidate();
        this.invertedIndex?.invalidate(notePath);
        this.pathTrie?.remove(notePath);
    }

    /**
     * Search vault with basic query
     */
    async searchVault(query: string): Promise<SearchResult[]> {
        return await this.searchVaultWithOptions({ query });
    }

    /**
     * Search vault with advanced options
     */
    async searchVaultWithOptions(options: SearchOptions): Promise<SearchResult[]> {
        if (!options.query && !options.glob && !options.regex && !options.tags && !options.frontmatter) {
            throw new Error('At least one of query, glob, regex, tags, or frontmatter must be provided');
        }

        const cachedResults = this.searchResultCache.get(options);
        if (cachedResults !== null) {
            return cachedResults;
        }

        // Get candidate files using optimized path
        let files = await this.getCandidateFiles(options);
        
        // Apply glob/regex filtering
        files = this.filterFilesByPattern(files, options.glob, options.regex);
        
        const results: SearchResult[] = [];

        // If only glob/regex filtering, return matching files
        if (!options.query && !options.tags && !options.frontmatter) {
            const matchedFiles = files.map(file => ({
                path: file,
                score: 1,
                matches: [],
            }));
            const processedResults = this.searchResultFilter.processResults(matchedFiles, {
                minScore: options.minScore,
                limit: options.limit,
                offset: options.offset,
            });
            
            this.searchResultCache.set(options, processedResults);
            return processedResults;
        }

        // Use batch processing with early metadata filtering
        const query = options.query;
        const batchSize = config.searchBatchSize;
        const effectiveLimit = options.limit;
        
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            
            // Batch frontmatter parsing for metadata filtering
            const batchWithMetadata = await this.batchReadWithMetadata(batch);
            
            const batchResults = await Promise.all(
                batchWithMetadata.map(async ({ file, content, metadata }) => {
                    try {
                        // Apply tag filter using cached metadata
                        if (options.tags && options.tags.length > 0) {
                            const allTags = metadata?.allTags ?? [];
                            const normalizedRequired = options.tags.map(t => t.toLowerCase().replace(/^#/, ''));
                            const hasAllTags = normalizedRequired.every(required => 
                                allTags.some(tag => tag === required || tag.startsWith(required + '/'))
                            );
                            if (!hasAllTags) return null;
                        }
                        
                        // Apply frontmatter filter using cached metadata
                        if (options.frontmatter && Object.keys(options.frontmatter).length > 0) {
                            const frontmatterData = metadata?.frontmatter?.data ?? {};
                            const matches = Object.entries(options.frontmatter).every(([key, value]) => {
                                const fmValue = frontmatterData[key];
                                if (Array.isArray(fmValue)) return fmValue.includes(value);
                                if (typeof fmValue === 'string' && typeof value === 'string') {
                                    return fmValue.toLowerCase() === value.toLowerCase();
                                }
                                return fmValue === value;
                            });
                            if (!matches) return null;
                        }
                        
                        // If no query, file passed filters
                        if (!query) {
                            return { path: file, score: 1, matches: [] };
                        }
                        
                        // Extract matches and calculate score
                        const matches = this.matchExtractor.extractMatches(content, query);
                        
                        if (matches.length > 0) {
                            // Use pre-computed metadata for scoring if available
                            const wordCount = metadata?.wordCount ?? content.split(/\s+/).filter(w => w.length > 0).length;
                            const lineCount = metadata?.lineCount ?? content.split('\n').length;
                            
                            const score = this.searchScorer.calculateScore(matches, content, query);
                            return { path: file, score, matches };
                        }
                        return null;
                    } catch (error) {
                        console.warn(`Failed to process file ${file}:`, error);
                        return null;
                    }
                })
            );

            const validResults = batchResults.filter((result): result is SearchResult => result !== null);
            results.push(...validResults);

            if (effectiveLimit !== undefined && effectiveLimit > 0) {
                if (this.searchResultFilter.shouldStopEarly(results, effectiveLimit)) {
                    break;
                }
            }
        }

        const processedResults = this.searchResultFilter.processResults(results, {
            minScore: options.minScore,
            limit: options.limit,
            offset: options.offset,
        });

        this.searchResultCache.set(options, processedResults);
        return processedResults;
    }

    /**
     * Streaming search - yields results as they're found
     */
    async *searchVaultStreaming(options: SearchOptions): AsyncGenerator<SearchResult> {
        if (!options.query && !options.glob && !options.regex && !options.tags && !options.frontmatter) {
            throw new Error('At least one of query, glob, regex, tags, or frontmatter must be provided');
        }

        let files = await this.getCandidateFiles(options);
        files = this.filterFilesByPattern(files, options.glob, options.regex);

        const query = options.query;
        let yieldedCount = 0;
        const limit = options.limit;

        for (const file of files) {
            if (limit !== undefined && yieldedCount >= limit) break;

            try {
                const content = await this.readNote(file);
                
                // Apply tag filter
                if (options.tags && options.tags.length > 0) {
                    if (!this.frontmatterParser.matchesTags(content, options.tags)) {
                        continue;
                    }
                }
                
                // Apply frontmatter filter
                if (options.frontmatter && Object.keys(options.frontmatter).length > 0) {
                    if (!this.frontmatterParser.matchesFrontmatter(content, options.frontmatter)) {
                        continue;
                    }
                }
                
                if (!query) {
                    yield { path: file, score: 1, matches: [] };
                    yieldedCount++;
                    continue;
                }
                
                const matches = this.matchExtractor.extractMatches(content, query);
                
                if (matches.length > 0) {
                    const score = this.searchScorer.calculateScore(matches, content, query);
                    if (options.minScore === undefined || score >= options.minScore) {
                        yield { path: file, score, matches };
                        yieldedCount++;
                    }
                }
            } catch {
                // Skip files that can't be read
            }
        }
    }

    /**
     * Get candidate files for search, using inverted index if available
     */
    private async getCandidateFiles(options: SearchOptions): Promise<string[]> {
        // If we have a query and inverted index is enabled, use it to narrow candidates
        if (options.query && this.invertedIndex?.isEnabled()) {
            const indexedCandidates = this.invertedIndex.searchAny(options.query);
            if (indexedCandidates.size > 0) {
                return Array.from(indexedCandidates);
            }
        }

        // Use path trie for glob matching if available
        if (options.glob && this.pathTrie) {
            return this.pathTrie.matchGlob(options.glob);
        }

        // Fall back to full file list
        return await this.listVaultFiles();
    }

    /**
     * Batch read files with cached metadata
     */
    private async batchReadWithMetadata(files: string[]): Promise<Array<{
        file: string;
        content: string;
        metadata: ReturnType<ContentCache['getMetadata']>;
    }>> {
        return await Promise.all(files.map(async (file) => {
            const fullPath = path.join(config.vaultPath, file);
            try {
                const stats = await fs.stat(fullPath);
                const mtime = stats.mtimeMs;
                
                // Try to get from cache with metadata
                const cachedEntry = this.contentCache.getEntry(file, mtime);
                if (cachedEntry) {
                    return {
                        file,
                        content: cachedEntry.content,
                        metadata: this.contentCache.getMetadata(file, mtime),
                    };
                }
                
                // Read and cache
                const content = await this.readNote(file);
                return {
                    file,
                    content,
                    metadata: this.contentCache.getMetadata(file, mtime),
                };
            } catch {
                return { file, content: '', metadata: null };
            }
        }));
    }

    /**
     * Filter files by glob and regex patterns
     */
    private filterFilesByPattern(files: string[], glob?: string, regexPattern?: string): string[] {
        let filtered = files;

        if (glob) {
            try {
                // Use path trie for glob matching if available
                if (this.pathTrie && files.length === this.pathTrie.size()) {
                    filtered = this.pathTrie.matchGlob(glob);
                } else {
                    filtered = filtered.filter(file => minimatch(file, glob));
                }
            } catch (error) {
                throw new Error(`Invalid glob pattern: ${glob}. ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        if (regexPattern) {
            try {
                const regex = new RegExp(regexPattern);
                filtered = filtered.filter(file => regex.test(file));
            } catch (error) {
                throw new Error(`Invalid regex pattern: ${regexPattern}. ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return filtered;
    }

    /**
     * Create a folder
     */
    async createFolder(folderPath: string): Promise<void> {
        const fullPath = path.join(config.vaultPath, folderPath);
        await fs.mkdir(fullPath, { recursive: true });
        
        this.fileListCache.invalidate();
        this.searchResultCache.invalidate();
    }

    /**
     * Rename a folder
     */
    async renameFolder(folderPath: string, newPath: string): Promise<void> {
        const fullPath = path.join(config.vaultPath, folderPath);
        const newFullPath = path.join(config.vaultPath, newPath);

        if (!(await this.fileExists(fullPath))) {
            throw new Error(`Folder not found: ${folderPath}`);
        }

        if (await this.fileExists(newFullPath)) {
            throw new Error(`Destination folder already exists: ${newPath}`);
        }

        const parentDir = path.dirname(newFullPath);
        await fs.mkdir(parentDir, { recursive: true });
        await fs.rename(fullPath, newFullPath);
        
        this.fileListCache.invalidate();
        this.contentCache.clear();
        this.searchResultCache.invalidate();
        this.invertedIndex?.clear();
        this.pathTrie?.clear();
    }

    /**
     * Move a folder
     */
    async moveFolder(folderPath: string, newPath: string): Promise<void> {
        await this.renameFolder(folderPath, newPath);
    }

    /**
     * Delete a folder
     */
    async deleteFolder(folderPath: string): Promise<void> {
        const fullPath = path.join(config.vaultPath, folderPath);

        if (!(await this.fileExists(fullPath))) {
            throw new Error(`Folder not found: ${folderPath}`);
        }

        await fs.rm(fullPath, { recursive: true, force: true });
        
        this.fileListCache.invalidate();
        this.contentCache.clear();
        this.searchResultCache.invalidate();
        this.invertedIndex?.clear();
        this.pathTrie?.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): CacheStats {
        const fileListStats = this.fileListCache.getStats();
        const contentStats = this.contentCache.getStats();
        const searchStats = this.searchResultCache.getStats();
        const watcherStats = this.fileWatcher?.getStats() ?? {
            isActive: false,
            vaultPath: config.vaultPath,
            watchedCount: 0,
            debounceDelay: config.fileWatcherDebounce,
            pendingChanges: 0,
            changesProcessed: 0,
        };
        const lmdbStats = PersistentCache.getEnvironmentStats();

        return {
            fileListCache: {
                entryCount: fileListStats.entryCount,
                folders: fileListStats.folders,
                ttl: this.fileListCache.getTtl(),
                persistentSize: fileListStats.persistentSize,
                persistentEnabled: fileListStats.persistentEnabled,
            },
            contentCache: {
                size: contentStats.size,
                maxSize: contentStats.maxSize,
                files: contentStats.files,
                persistentSize: contentStats.persistentSize,
                persistentEnabled: contentStats.persistentEnabled,
            },
            searchCache: {
                size: searchStats.size,
                maxSize: searchStats.maxSize,
                ttl: searchStats.ttl,
                persistentSize: searchStats.persistentSize,
                persistentEnabled: searchStats.persistentEnabled,
            },
            fileWatcher: watcherStats,
            persistentCache: {
                enabled: this.persistentCacheEnabled,
                dbPath: lmdbStats.dbPath,
                databases: lmdbStats.databases,
            },
        };
    }

    /**
     * Get extended stats including inverted index and path trie
     */
    getExtendedStats(): {
        cache: CacheStats;
        invertedIndex: ReturnType<InvertedIndex['getStats']> | null;
        pathTrie: ReturnType<PathTrie['getStats']> | null;
        isWarmedUp: boolean;
    } {
        return {
            cache: this.getCacheStats(),
            invertedIndex: this.invertedIndex?.getStats() ?? null,
            pathTrie: this.pathTrie?.getStats() ?? null,
            isWarmedUp: this.isWarmedUp,
        };
    }

    /**
     * Get all tags from a note
     */
    async getNoteTags(notePath: string): Promise<string[]> {
        const content = await this.readNote(notePath);
        return this.frontmatterParser.getAllTags(content);
    }

    /**
     * Get frontmatter data from a note
     */
    async getNoteFrontmatter(notePath: string): Promise<Record<string, unknown>> {
        const content = await this.readNote(notePath);
        const parsed = this.frontmatterParser.parse(content);
        return parsed.data;
    }

    /**
     * Get frontmatter and tags in a single read (avoids double read used by getNoteFrontmatter + getNoteTags).
     */
    async getNoteMetadata(notePath: string): Promise<{ frontmatter: Record<string, unknown>; tags: string[] }> {
        await this.readNote(notePath);
        const fullPath = path.join(config.vaultPath, notePath);
        const stats = await fs.stat(fullPath);
        const mtime = stats.mtimeMs;
        const metadata = this.contentCache.getMetadata(notePath, mtime);
        if (metadata) {
            return {
                frontmatter: metadata.frontmatter?.data ?? {},
                tags: metadata.allTags,
            };
        }
        const entry = this.contentCache.getEntry(notePath, mtime);
        if (entry) {
            const frontmatterTags = entry.parsedFrontmatter?.tags ?? [];
            const inlineTags = entry.inlineTags ?? [];
            return {
                frontmatter: entry.parsedFrontmatter?.data ?? {},
                tags: [...new Set([...frontmatterTags, ...inlineTags])],
            };
        }
        const content = await fs.readFile(fullPath, 'utf-8');
        const parsed = this.frontmatterParser.parse(content);
        return {
            frontmatter: parsed.data,
            tags: this.frontmatterParser.getAllTags(content),
        };
    }
}
