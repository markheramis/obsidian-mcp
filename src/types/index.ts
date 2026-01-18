/**
 * Match - Represents a single match found in a file
 */
export interface Match {
    /** Line number where the match was found (1-indexed) */
    line: number;
    /** Surrounding lines for context (optional) */
    context?: string;
    /** Highlighted match snippet (optional) */
    snippet?: string;
    /** Column position of the match (0-indexed, optional) */
    column?: number;
}

/**
 * SearchResult - Represents a search result for a file
 */
export interface SearchResult {
    /** Path to the file */
    path: string;
    /** Relevance score (0 to 1) */
    score: number;
    /** Array of matches found in the file */
    matches: Match[];
}

/**
 * SearchOptions - Options for vault search operations
 */
export interface SearchOptions {
    /** Search query text */
    query?: string;
    /** Glob pattern to filter files */
    glob?: string;
    /** Regular expression pattern to filter files */
    regex?: string;
    /** Maximum number of results to return */
    limit?: number;
    /** Number of results to skip (for pagination) */
    offset?: number;
    /** Minimum score threshold (0 to 1) */
    minScore?: number;
    /** Filter by tags (all tags must be present) */
    tags?: string[];
    /** Filter by frontmatter key-value pairs */
    frontmatter?: Record<string, unknown>;
}

/**
 * CacheStats - Statistics for monitoring cache performance
 */
export interface CacheStats {
    /** File list cache statistics */
    fileListCache: {
        entryCount: number;
        folders: string[];
        ttl: number;
        persistentSize: number;
        persistentEnabled: boolean;
    };
    /** Content cache statistics */
    contentCache: {
        size: number;
        maxSize: number;
        files: string[];
        persistentSize: number;
        persistentEnabled: boolean;
    };
    /** Search result cache statistics */
    searchCache: {
        size: number;
        maxSize: number;
        ttl: number;
        persistentSize: number;
        persistentEnabled: boolean;
    };
    /** File watcher statistics */
    fileWatcher: {
        isActive: boolean;
        vaultPath: string;
        watchedCount: number;
        debounceDelay?: number;
        pendingChanges?: number;
        changesProcessed?: number;
    };
    /** Persistent cache (LMDB) statistics */
    persistentCache: {
        enabled: boolean;
        dbPath: string;
        databases: string[];
    };
}

/**
 * FolderOperation - Represents a folder operation
 */
export interface FolderOperation {
    operation: 'create' | 'rename' | 'move' | 'delete';
    path: string;
    newPath?: string;
}

/**
 * ToolResponse - Standard response format for MCP tools
 */
export interface ToolResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}
