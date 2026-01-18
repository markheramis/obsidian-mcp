import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_INFO } from './config/index.js';
import { FileSystemService } from './services/fileSystem.js';
import { ResourceHandlers } from './handlers/resourceHandlers.js';
import { ToolHandlers } from './handlers/toolHandlers.js';

/**
 * ObsidianMcpServer - Main MCP server class for Obsidian vault operations
 */
export class ObsidianMcpServer {
    private server: Server;
    private fileSystemService: FileSystemService;
    private resourceHandlers: ResourceHandlers;
    private toolHandlers: ToolHandlers;

    constructor() {
        this.server = new Server(
            SERVER_INFO,
            {
                capabilities: {
                    resources: {},
                    tools: {},
                },
            }
        );

        this.fileSystemService = new FileSystemService();
        this.resourceHandlers = new ResourceHandlers(this.fileSystemService);
        this.toolHandlers = new ToolHandlers(this.fileSystemService);

        this.setupHandlers();
        this.setupErrorHandling();
    }

    /**
     * Setup request handlers for resources and tools
     */
    private setupHandlers(): void {
        this.resourceHandlers.setupHandlers(this.server);
        this.toolHandlers.setupHandlers(this.server);
    }

    /**
     * Setup error handling and graceful shutdown
     */
    private setupErrorHandling(): void {
        this.server.onerror = (error) => console.error('[MCP Error]', error);

        const shutdown = async (): Promise<void> => {
            console.error('Shutting down Obsidian MCP server...');
            
            // Close file system service (stops file watcher and closes persistent cache)
            await this.fileSystemService.close();
            
            await this.server.close();
            process.exit(0);
        };

        // Handle both SIGINT and SIGTERM for graceful shutdown
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }

    /**
     * Start the MCP server
     */
    async run(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Obsidian MCP server running on stdio');
    }
}
