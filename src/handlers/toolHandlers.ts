import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ErrorCode,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { FileSystemService } from '../services/fileSystem.js';

const tools = {
    tools: [
        {
            name: 'list_notes',
            description: 'List all notes in the Obsidian vault',
            inputSchema: {
                type: 'object',
                properties: {
                    folder: {
                        type: 'string',
                        description: 'Folder path within the vault (optional)',
                    },
                },
                required: [],
            },
        },
        {
            name: 'delete_note',
            description: 'Delete a note from the Obsidian vault',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the note within the vault',
                    },
                },
                required: ['path'],
            },
        },
        {
            name: 'read_note',
            description: 'Read the content of a note in the Obsidian vault',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the note within the vault',
                    },
                },
                required: ['path'],
            },
        },
        {
            name: 'create_note',
            description: 'Create a new note in the Obsidian vault. This operation will FAIL if the file already exists. Missing directories will be created automatically.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path where the note should be created. Can include nested directories (e.g., "folder/subfolder/note.md"). Missing directories will be created automatically.',
                    },
                    content: {
                        type: 'string',
                        description: 'Content of the note',
                    },
                },
                required: ['path', 'content'],
            },
        },
        {
            name: 'update_note',
            description: 'Update an existing note in the Obsidian vault. If createIfNotExists is true, missing directories will be created automatically. If createIfNotExists is false and the file does not exist, the operation will FAIL.',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the note within the vault. Can include nested directories (e.g., "folder/subfolder/note.md"). If createIfNotExists is true, missing directories will be created automatically.',
                    },
                    content: {
                        type: 'string',
                        description: 'New content of the note',
                    },
                    createIfNotExists: {
                        type: 'boolean',
                        description: 'If true, creates the note and any missing directories if the file does not exist. If false (default), the operation fails if the file does not exist.',
                    },
                },
                required: ['path', 'content'],
            },
        },
        {
            name: 'search_vault',
            description: 'Search for content in the Obsidian vault (simplified interface). Requires a query parameter. Supports glob patterns, regex, pagination (limit/offset), score filtering (minScore), and tag/frontmatter filtering. Internally uses advanced_search_vault.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query (text to search for)',
                    },
                    glob: {
                        type: 'string',
                        description: 'Glob pattern to filter files (e.g., "*.md", "**/notes/*.md")',
                    },
                    regex: {
                        type: 'string',
                        description: 'Regular expression pattern to filter files',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 100)',
                    },
                    offset: {
                        type: 'number',
                        description: 'Number of results to skip for pagination (default: 0)',
                    },
                    minScore: {
                        type: 'number',
                        description: 'Minimum relevance score threshold (0 to 1)',
                    },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Filter by tags (all tags must be present in frontmatter or inline)',
                    },
                    frontmatter: {
                        type: 'object',
                        description: 'Filter by frontmatter key-value pairs (e.g., {"status": "published"})',
                    },
                },
                required: ['query'],
            },
        },
        {
            name: 'advanced_search_vault',
            description: 'Advanced search with support for glob patterns, regex, tags, frontmatter filtering, and complex filtering. At least one of query, glob, regex, tags, or frontmatter must be provided.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query (text to search for)',
                    },
                    glob: {
                        type: 'string',
                        description: 'Glob pattern to filter files (e.g., "*.md", "**/notes/*.md")',
                    },
                    regex: {
                        type: 'string',
                        description: 'Regular expression pattern to filter files',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 100)',
                    },
                    offset: {
                        type: 'number',
                        description: 'Number of results to skip for pagination (default: 0)',
                    },
                    minScore: {
                        type: 'number',
                        description: 'Minimum relevance score threshold (0 to 1)',
                    },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Filter by tags (all tags must be present in frontmatter or inline)',
                    },
                    frontmatter: {
                        type: 'object',
                        description: 'Filter by frontmatter key-value pairs (e.g., {"status": "published", "author": "John"})',
                    },
                },
                required: [],
            },
        },
        {
            name: 'manage_folder',
            description: 'Create, rename, move, or delete a folder in the Obsidian vault',
            inputSchema: {
                type: 'object',
                properties: {
                    operation: {
                        type: 'string',
                        description: 'The operation to perform: create, rename, move, or delete',
                        enum: ['create', 'rename', 'move', 'delete']
                    },
                    path: {
                        type: 'string',
                        description: 'Path to the folder within the vault'
                    },
                    newPath: {
                        type: 'string',
                        description: 'New path for the folder (required for rename and move operations)'
                    }
                },
                required: ['operation', 'path'],
            },
        },
        {
            name: 'get_note_metadata',
            description: 'Get the frontmatter metadata and tags from a note',
            inputSchema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Path to the note within the vault',
                    },
                },
                required: ['path'],
            },
        },
        {
            name: 'get_cache_stats',
            description: 'Get cache statistics for monitoring and debugging. Returns information about file list cache, content cache, search result cache, file watcher status, inverted index, and path trie.',
            inputSchema: {
                type: 'object',
                properties: {
                    extended: {
                        type: 'boolean',
                        description: 'If true, includes inverted index and path trie statistics (default: false)',
                    },
                },
                required: [],
            },
        },
        {
            name: 'search_vault_stream',
            description: 'Streaming search that yields results incrementally. Useful for large vaults where you want to see results as they are found. Returns results in batches.',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query (text to search for)',
                    },
                    glob: {
                        type: 'string',
                        description: 'Glob pattern to filter files (e.g., "*.md", "**/notes/*.md")',
                    },
                    regex: {
                        type: 'string',
                        description: 'Regular expression pattern to filter files',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 100)',
                    },
                    minScore: {
                        type: 'number',
                        description: 'Minimum relevance score threshold (0 to 1)',
                    },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Filter by tags (all tags must be present)',
                    },
                    frontmatter: {
                        type: 'object',
                        description: 'Filter by frontmatter key-value pairs',
                    },
                },
                required: [],
            },
        },
    ],
}

/**
 * ToolHandlers - Handles MCP tool requests for vault operations
 */
export class ToolHandlers {
    private fileSystemService: FileSystemService;

    /**
     * Constructor for ToolHandlers
     * @param fileSystemService the filesystem service instance
     */
    constructor(fileSystemService: FileSystemService) {
        this.fileSystemService = fileSystemService;
    }

    /**
     * Setup handlers for the server
     * @param server the server instance
     */
    setupHandlers(server: Server): void {
        // List tools
        server.setRequestHandler(ListToolsRequestSchema, async () => (tools));
        // Call tool
        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                switch (request.params.name) {
                    case 'list_notes':
                        return await this.handleListNotes(request.params.arguments);
                    case 'read_note':
                        return await this.handleReadNote(request.params.arguments);
                    case 'create_note':
                        return await this.handleCreateNote(request.params.arguments);
                    case 'update_note':
                        return await this.handleUpdateNote(request.params.arguments);
                    case 'search_vault':
                        return await this.handleSearchVault(request.params.arguments);
                    case 'advanced_search_vault':
                        return await this.handleAdvancedSearchVault(request.params.arguments);
                    case 'delete_note':
                        return await this.handleDeleteNote(request.params.arguments);
                    case 'manage_folder':
                        return await this.handleManageFolder(request.params.arguments);
                    case 'get_note_metadata':
                        return await this.handleGetNoteMetadata(request.params.arguments);
                    case 'get_cache_stats':
                        return await this.handleGetCacheStats(request.params.arguments);
                    case 'search_vault_stream':
                        return await this.handleSearchVaultStream(request.params.arguments);
                    default:
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            `Unknown tool: ${request.params.name}`
                        );
                }
            } catch (error) {
                console.error(`Error executing tool ${request.params.name}:`, error);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    /**
     * Handle list notes
     * @param args the arguments
     * @returns the list of notes
     */
    private async handleListNotes(args: any) {
        const folder = args?.folder || '';
        const files = await this.fileSystemService.listVaultFiles(folder);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(files, null, 2),
                },
            ],
        };
    }

    /**
     * Handle read note
     * @param args the arguments
     * @returns the content of the note
     */
    private async handleReadNote(args: any) {
        if (!args?.path) {
            throw new Error('Path is required');
        }
        const content = await this.fileSystemService.readNote(args.path);
        return {
            content: [
                {
                    type: 'text',
                    text: content,
                },
            ],
        };
    }

    /**
     * Handle create note
     * @param args the arguments
     * @returns the content of the note
     */
    private async handleCreateNote(args: any) {
        if (!args?.path || !args?.content) {
            throw new Error('Path and content are required');
        }
        await this.fileSystemService.createNote(args.path, args.content);
        return {
            content: [
                {
                    type: 'text',
                    text: `Note created successfully at ${args.path}. Any missing directories were created automatically.`,
                },
            ],
        };
    }

    /**
     * Handle update note
     * @param args the arguments
     * @returns the content of the note
     */
    private async handleUpdateNote(args: any) {
        if (!args?.path || !args?.content) {
            throw new Error('Path and content are required');
        }
        const createIfNotExists = args?.createIfNotExists || false;
        await this.fileSystemService.updateNote(args.path, args.content, createIfNotExists);
        return {
            content: [
                {
                    type: 'text',
                    text: `Note ${createIfNotExists ? 'created/updated' : 'updated'} successfully at ${args.path}${createIfNotExists ? '. Any missing directories were created automatically.' : ''}`,
                },
            ],
        };
    }

    /**
     * Handle search vault - delegates to handleAdvancedSearchVault
     * This is a simplified interface that requires a query parameter
     * @param args the arguments
     * @returns the search results
     */
    private async handleSearchVault(args: any) {
        // Validate that query is required (maintains current API contract)
        if (!args?.query) {
            throw new Error('Search query is required');
        }
        
        // Validate query is a string
        if (typeof args.query !== 'string') {
            throw new Error('query must be a string');
        }
        
        // Delegate to advanced search (which has all the validation)
        // This ensures both endpoints use the same implementation
        return await this.handleAdvancedSearchVault(args);
    }

    /**
     * Handle advanced search vault
     * @param args the arguments
     * @returns the search results
     */
    private async handleAdvancedSearchVault(args: any) {
        const query = args?.query;
        const glob = args?.glob;
        const regex = args?.regex;
        const limit = args?.limit;
        const offset = args?.offset;
        const minScore = args?.minScore;
        const tags = args?.tags;
        const frontmatter = args?.frontmatter;

        // Validate that at least one search parameter is provided
        if (!query && !glob && !regex && !tags && !frontmatter) {
            throw new Error('At least one of query, glob, regex, tags, or frontmatter must be provided');
        }

        // Validate query is a string if provided
        if (query && typeof query !== 'string') {
            throw new Error('query must be a string');
        }

        // Validate glob is a string if provided
        if (glob && typeof glob !== 'string') {
            throw new Error('glob must be a string');
        }

        // Validate regex is a string if provided
        if (regex && typeof regex !== 'string') {
            throw new Error('regex must be a string');
        }

        // Validate limit is a positive number if provided
        if (limit !== undefined) {
            if (typeof limit !== 'number' || limit <= 0) {
                throw new Error('limit must be a positive number');
            }
        }

        // Validate offset is a non-negative number if provided
        if (offset !== undefined) {
            if (typeof offset !== 'number' || offset < 0) {
                throw new Error('offset must be a non-negative number');
            }
        }

        // Validate minScore is between 0 and 1 if provided
        if (minScore !== undefined) {
            if (typeof minScore !== 'number' || minScore < 0 || minScore > 1) {
                throw new Error('minScore must be a number between 0 and 1');
            }
        }

        // Validate tags is an array of strings if provided
        if (tags !== undefined) {
            if (!Array.isArray(tags)) {
                throw new Error('tags must be an array of strings');
            }
            if (!tags.every((t: unknown) => typeof t === 'string')) {
                throw new Error('tags must be an array of strings');
            }
        }

        // Validate frontmatter is an object if provided
        if (frontmatter !== undefined) {
            if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
                throw new Error('frontmatter must be an object');
            }
        }

        const searchOptions = {
            query: query,
            glob: glob,
            regex: regex,
            limit: limit,
            offset: offset,
            minScore: minScore,
            tags: tags,
            frontmatter: frontmatter,
        };

        const results = await this.fileSystemService.searchVaultWithOptions(searchOptions);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(results, null, 2),
                },
            ],
        };
    }

    /**
     * Handle delete note
     * @param args the arguments
     * @returns the content of the note
     */
    private async handleDeleteNote(args: any) {
        if (!args?.path) {
            throw new Error('Path is required');
        }
        await this.fileSystemService.deleteNote(args.path);
        return {
            content: [
                {
                    type: 'text',
                    text: `Note deleted successfully: ${args.path}`,
                },
            ],
        };
    }

    /**
     * Handle manage folder
     * @param args the arguments
     * @returns the content of the folder
     */
    private async handleManageFolder(args: any) {
        if (!args?.operation || !args?.path) {
            throw new Error('Operation and path are required');
        }

        const operation = args.operation;

        switch (operation) {
            case 'create':
                return await this.handleCreateFolder(args);
            case 'rename':
                return await this.handleRenameFolder(args);
            case 'move':
                return await this.handleMoveFolder(args);
            case 'delete':
                return await this.handleDeleteFolder(args);
            default:
                throw new Error(`Unknown folder operation: ${operation}`);
        }
    }

    /**
     * Handle create folder
     * @param args the arguments
     * @returns the content of the folder
     */
    private async handleCreateFolder(args: any) {
        if (!args?.path) {
            throw new Error('Path is required');
        }
        await this.fileSystemService.createFolder(args.path);
        return {
            content: [
                {
                    type: 'text',
                    text: `Folder created successfully at ${args.path}`,
                },
            ],
        };
    }

    /**
     * Handle rename folder
     * @param args the arguments
     * @returns the content of the folder
     */
    private async handleRenameFolder(args: any) {
        if (!args?.path || !args?.newPath) {
            throw new Error('Path and new path are required');
        }
        await this.fileSystemService.renameFolder(args.path, args.newPath);
        return {
            content: [
                {
                    type: 'text',
                    text: `Folder renamed from ${args.path} to ${args.newPath}`,
                },
            ],
        };
    }

    /**
     * Handle move folder
     * @param args the arguments
     * @returns the content of the folder
     */
    private async handleMoveFolder(args: any) {
        if (!args?.path || !args?.newPath) {
            throw new Error('Path and new path are required');
        }
        await this.fileSystemService.moveFolder(args.path, args.newPath);
        return {
            content: [
                {
                    type: 'text',
                    text: `Folder moved from ${args.path} to ${args.newPath}`,
                },
            ],
        };
    }

    /**
     * Handle delete folder
     * @param args the arguments
     * @returns the content of the folder
     */
    private async handleDeleteFolder(args: any) {
        if (!args?.path) {
            throw new Error('Path is required');
        }
        await this.fileSystemService.deleteFolder(args.path);
        return {
            content: [
                {
                    type: 'text',
                    text: `Folder deleted successfully: ${args.path}`,
                },
            ],
        };
    }

    /**
     * Handle get note metadata
     * @param args the arguments
     * @returns the frontmatter and tags
     */
    private async handleGetNoteMetadata(args: any) {
        if (!args?.path) {
            throw new Error('Path is required');
        }

        const { frontmatter, tags } = await this.fileSystemService.getNoteMetadata(args.path);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ frontmatter, tags }, null, 2),
                },
            ],
        };
    }

    /**
     * Handle get cache stats
     * @param args the arguments
     * @returns cache statistics
     */
    private async handleGetCacheStats(args: any) {
        const extended = args?.extended === true;
        
        if (extended) {
            const stats = this.fileSystemService.getExtendedStats();
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(stats, null, 2),
                    },
                ],
            };
        }
        
        const stats = this.fileSystemService.getCacheStats();
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(stats, null, 2),
                },
            ],
        };
    }

    /**
     * Handle streaming search vault
     * Collects all streaming results and returns them
     * @param args the arguments
     * @returns the search results
     */
    private async handleSearchVaultStream(args: any) {
        const query = args?.query;
        const glob = args?.glob;
        const regex = args?.regex;
        const limit = args?.limit;
        const minScore = args?.minScore;
        const tags = args?.tags;
        const frontmatter = args?.frontmatter;

        // Validate that at least one search parameter is provided
        if (!query && !glob && !regex && !tags && !frontmatter) {
            throw new Error('At least one of query, glob, regex, tags, or frontmatter must be provided');
        }

        const searchOptions = {
            query,
            glob,
            regex,
            limit,
            minScore,
            tags,
            frontmatter,
        };

        // Collect streaming results
        const results = [];
        for await (const result of this.fileSystemService.searchVaultStreaming(searchOptions)) {
            results.push(result);
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(results, null, 2),
                },
            ],
        };
    }
}
