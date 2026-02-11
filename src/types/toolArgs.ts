/**
 * Typed argument interfaces for MCP tool handlers.
 * Matches the inputSchema of each tool.
 */

export interface ListNotesArgs {
    folder?: string;
}

export interface ReadNoteArgs {
    path: string;
}

export interface CreateNoteArgs {
    path: string;
    content: string;
}

export interface UpdateNoteArgs {
    path: string;
    content: string;
    createIfNotExists?: boolean;
}

export interface DeleteNoteArgs {
    path: string;
}

export interface SearchVaultArgs {
    query: string;
    glob?: string;
    regex?: string;
    limit?: number;
    offset?: number;
    minScore?: number;
    tags?: string[];
    frontmatter?: Record<string, unknown>;
}

export interface AdvancedSearchVaultArgs {
    query?: string;
    glob?: string;
    regex?: string;
    limit?: number;
    offset?: number;
    minScore?: number;
    tags?: string[];
    frontmatter?: Record<string, unknown>;
}

export interface ManageFolderArgs {
    operation: 'create' | 'rename' | 'move' | 'delete';
    path: string;
    newPath?: string;
}

export interface GetNoteMetadataArgs {
    path: string;
}

export interface GetCacheStatsArgs {
    extended?: boolean;
}

export interface SearchVaultStreamArgs {
    query?: string;
    glob?: string;
    regex?: string;
    limit?: number;
    minScore?: number;
    tags?: string[];
    frontmatter?: Record<string, unknown>;
}
