/**
 * Obsidian MCP Server Configuration
 * 
 * Configuration is loaded from environment variables with sensible defaults.
 * All cache-related settings can be tuned for different vault sizes.
 */
export const config = {
    /** Path to the Obsidian vault */
    vaultPath: process.env.OBSIDIAN_VAULT_PATH || './vault',
    
    // ==================== File Watcher Settings ====================
    
    /** Enable file watching for automatic cache invalidation (default: true) */
    enableFileWatcher: process.env.OBSIDIAN_ENABLE_FILE_WATCHER !== 'false',
    
    /** File watcher debounce delay in milliseconds (default: 100) */
    fileWatcherDebounce: parseInt(process.env.OBSIDIAN_FILE_WATCHER_DEBOUNCE || '100', 10),
    
    // ==================== Persistent Cache Settings ====================
    
    /** Enable persistent cache using LMDB (default: true) */
    enablePersistentCache: process.env.OBSIDIAN_ENABLE_PERSISTENT_CACHE !== 'false',
    
    /** Path for persistent cache database (default: ./.obsidian-cache) */
    cachePath: process.env.OBSIDIAN_CACHE_PATH || './.obsidian-cache',
    
    // ==================== File List Cache Settings ====================
    
    /** File list cache TTL in milliseconds (default: 60000 = 1 minute) */
    fileListCacheTtl: parseInt(process.env.OBSIDIAN_FILE_LIST_CACHE_TTL || '60000', 10),
    
    // ==================== Content Cache Settings ====================
    
    /** Content cache max size in number of files (default: 100) */
    contentCacheMaxSize: parseInt(process.env.OBSIDIAN_CONTENT_CACHE_MAX_SIZE || '100', 10),
    
    // ==================== Search Cache Settings ====================
    
    /** Search result cache max size (default: 50) */
    searchCacheMaxSize: parseInt(process.env.OBSIDIAN_SEARCH_CACHE_MAX_SIZE || '50', 10),
    
    /** Search result cache TTL in milliseconds (default: 30000 = 30 seconds) */
    searchCacheTtl: parseInt(process.env.OBSIDIAN_SEARCH_CACHE_TTL || '30000', 10),
    
    /** Search batch size for parallel processing (default: 10) */
    searchBatchSize: parseInt(process.env.OBSIDIAN_SEARCH_BATCH_SIZE || '10', 10),
    
    // ==================== Inverted Index Settings ====================
    
    /** Enable in-memory inverted index for fast text search (default: true) */
    enableInvertedIndex: process.env.OBSIDIAN_ENABLE_INVERTED_INDEX !== 'false',
    
    /** Minimum word length to include in inverted index (default: 3) */
    invertedIndexMinWordLength: parseInt(process.env.OBSIDIAN_INDEX_MIN_WORD_LENGTH || '3', 10),
    
    /** Maximum words to index per file (default: 10000) */
    invertedIndexMaxWordsPerFile: parseInt(process.env.OBSIDIAN_INDEX_MAX_WORDS_PER_FILE || '10000', 10),
    
    // ==================== Path Trie Settings ====================
    
    /** Enable path trie for fast glob matching (default: true) */
    enablePathTrie: process.env.OBSIDIAN_ENABLE_PATH_TRIE !== 'false',
    
    // ==================== Compression Settings ====================
    
    /** Enable compression for large search results (default: false) */
    enableCompression: process.env.OBSIDIAN_COMPRESS_LARGE_RESULTS === 'true',
    
    /** Compression threshold in bytes (default: 100000 = 100KB) */
    compressionThreshold: parseInt(process.env.OBSIDIAN_COMPRESSION_THRESHOLD || '100000', 10),
    
    // ==================== Cache Warmup Settings ====================
    
    /** Enable cache warmup on startup (default: false) */
    enableCacheWarmup: process.env.OBSIDIAN_ENABLE_CACHE_WARMUP === 'true',
    
    /** Number of files to pre-load during warmup (default: 50) */
    warmupFileCount: parseInt(process.env.OBSIDIAN_WARMUP_FILE_COUNT || '50', 10),
};

/**
 * MCP server info
 */
export const SERVER_INFO = {
    name: 'obsidian-mcp-server',
    version: '2.4.0'
};
