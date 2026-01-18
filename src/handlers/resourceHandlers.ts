import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
    ErrorCode,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { FileSystemService } from '../services/fileSystem.js';

/**
 * ResourceHandlers - Handles MCP resource requests for vault files
 */
export class ResourceHandlers {
    private fileSystemService: FileSystemService;

    /**
     * Constructor for ResourceHandlers
     * @param fileSystemService the filesystem service instance
     */
    constructor(fileSystemService: FileSystemService) {
        this.fileSystemService = fileSystemService;
    }

    /**
     * Setup handlers
     * @param server the server instance
     */
    setupHandlers(server: Server): void {
        server.setRequestHandler(ListResourcesRequestSchema, this.handleListResources.bind(this));
        server.setRequestHandler(ReadResourceRequestSchema, this.handleReadResource.bind(this));
    }

    /**
     * Handle list resources
     * @returns the list of resources
     */
    private async handleListResources() {
        try {
            const files = await this.fileSystemService.listVaultFiles();
            return { resources: files.map(this.mapFileToResource) };
        } catch (error) {
            this.logError('listing resources', error);
            throw this.createInternalError('list resources', error);
        }
    }

    /**
     * Map file to resource
     * @param file the file
     * @returns the resource
     */
    private mapFileToResource(file: string) {
        return {
            uri: `obsidian://${encodeURIComponent(file)}`,
            name: path.basename(file),
            mimeType: 'text/markdown',
            description: `Markdown note: ${file}`,
        };
    }

    /**
     * Handle read resource
     * @param request the request
     * @returns the content of the resource
     */
    private async handleReadResource(request: any) {
        try {
            const filePath = this.extractFilePathFromUri(request.params.uri);
            const content = await this.fileSystemService.readNote(filePath);
            return {
                contents: [
                    {
                        uri: request.params.uri,
                        mimeType: 'text/markdown',
                        text: content,
                    },
                ],
            };
        } catch (error) {
            this.logError('reading resource', error);
            throw this.createInternalError('read resource', error);
        }
    }

    /**
     * Extract file path from URI
     * @param uri the URI
     * @returns the file path
     */
    private extractFilePathFromUri(uri: string): string {
        const match = uri.match(/^obsidian:\/\/(.+)$/);
        if (!match) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                `Invalid URI format: ${uri}`
            );
        }
        return decodeURIComponent(match[1]);
    }

    /**
     * Log error
     * @param action the action
     * @param error the error
     */
    private logError(action: string, error: unknown): void {
        console.error(`Error ${action}:`, error);
    }

    /**
     * Create internal error
     * @param action the action
     * @param error the error
     * @returns the internal error
     */
    private createInternalError(action: string, error: unknown): McpError {
        return new McpError(
            ErrorCode.InternalError,
            `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
