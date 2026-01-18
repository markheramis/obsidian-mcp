/**
 * Integration tests for search-related tool handlers
 * Tests both search_vault and advanced_search_vault endpoints
 * 
 * These tests verify the handler logic including:
 * - Parameter validation
 * - Delegation from search_vault to advanced_search_vault
 * - Error handling
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ToolHandlers } from '../../../src/handlers/toolHandlers';
import { FileSystemService } from '../../../src/services/fileSystem';
import { SearchResult } from '../../../src/types/index';

/**
 * Mock FileSystemService for testing handler logic in isolation
 */
class MockFileSystemService {
    public searchVaultWithOptionsCalls: any[] = [];
    public mockResults: SearchResult[] = [];
    public shouldThrow: Error | null = null;

    async searchVaultWithOptions(options: any): Promise<SearchResult[]> {
        this.searchVaultWithOptionsCalls.push(options);
        if (this.shouldThrow) {
            throw this.shouldThrow;
        }
        return this.mockResults;
    }

    // Stub methods to satisfy FileSystemService interface
    async listVaultFiles(): Promise<string[]> { return []; }
    async readNote(): Promise<string> { return ''; }
    async createNote(): Promise<void> {}
    async updateNote(): Promise<void> {}
    async deleteNote(): Promise<void> {}
    async searchVault(): Promise<SearchResult[]> { return []; }
    async createFolder(): Promise<void> {}
    async renameFolder(): Promise<void> {}
    async moveFolder(): Promise<void> {}
    async deleteFolder(): Promise<void> {}
    invalidateCache(): void {}
    async getNoteTags(): Promise<string[]> { return []; }
    async getNoteFrontmatter(): Promise<Record<string, unknown>> { return {}; }
    getCacheStats(): any { return {}; }
    async stopFileWatcher(): Promise<void> {}
}

describe('ToolHandlers - Search Endpoints', () => {
    let toolHandlers: ToolHandlers;
    let mockService: MockFileSystemService;

    const mockSearchResults: SearchResult[] = [
        {
            path: 'notes/test.md',
            score: 0.85,
            matches: [
                { line: 5, context: '  Line 4\n> Line 5 with **query**\n  Line 6', snippet: 'Line 5 with **query**', column: 10 }
            ]
        },
        {
            path: 'notes/another.md',
            score: 0.65,
            matches: [
                { line: 10, context: '  Line 9\n> Line 10 with **query**\n  Line 11', snippet: 'Line 10 with **query**', column: 15 }
            ]
        }
    ];

    beforeEach(() => {
        mockService = new MockFileSystemService();
        mockService.mockResults = mockSearchResults;
        // Cast to FileSystemService to satisfy TypeScript
        toolHandlers = new ToolHandlers(mockService as unknown as FileSystemService);
    });

    /**
     * Helper to call handleSearchVault via reflection
     */
    const callHandleSearchVault = async (args: any) => {
        return (toolHandlers as any).handleSearchVault(args);
    };

    /**
     * Helper to call handleAdvancedSearchVault via reflection
     */
    const callHandleAdvancedSearchVault = async (args: any) => {
        return (toolHandlers as any).handleAdvancedSearchVault(args);
    };

    describe('search_vault', () => {
        describe('parameter validation', () => {
            it('should require query parameter', async () => {
                await expect(callHandleSearchVault({}))
                    .rejects.toThrow('Search query is required');
            });

            it('should require query parameter when null', async () => {
                await expect(callHandleSearchVault({ query: null }))
                    .rejects.toThrow('Search query is required');
            });

            it('should require query parameter when undefined', async () => {
                await expect(callHandleSearchVault({ query: undefined }))
                    .rejects.toThrow('Search query is required');
            });

            it('should require query parameter when empty string', async () => {
                await expect(callHandleSearchVault({ query: '' }))
                    .rejects.toThrow('Search query is required');
            });

            it('should validate query is a string', async () => {
                await expect(callHandleSearchVault({ query: 123 }))
                    .rejects.toThrow('query must be a string');
            });

            it('should validate query is a string when array', async () => {
                await expect(callHandleSearchVault({ query: ['test'] }))
                    .rejects.toThrow('query must be a string');
            });
        });

        describe('successful searches', () => {
            it('should return results when query is provided', async () => {
                const result = await callHandleSearchVault({ query: 'test query' });
                
                expect(result).toHaveProperty('content');
                expect(result.content).toHaveLength(1);
                expect(result.content[0].type).toBe('text');
                
                const parsedResults = JSON.parse(result.content[0].text);
                expect(parsedResults).toEqual(mockSearchResults);
            });

            it('should pass all parameters to search', async () => {
                const args = {
                    query: 'test query',
                    glob: '**/*.md',
                    regex: '.*test.*',
                    limit: 10,
                    offset: 5,
                    minScore: 0.5
                };
                
                await callHandleSearchVault(args);
                
                // Verify searchVaultWithOptions was called with correct options
                expect(mockService.searchVaultWithOptionsCalls).toHaveLength(1);
                expect(mockService.searchVaultWithOptionsCalls[0]).toEqual({
                    query: 'test query',
                    glob: '**/*.md',
                    regex: '.*test.*',
                    limit: 10,
                    offset: 5,
                    minScore: 0.5,
                    tags: undefined,
                    frontmatter: undefined
                });
            });

            it('should support glob parameter', async () => {
                await callHandleSearchVault({ query: 'test', glob: '**/notes/*.md' });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ glob: '**/notes/*.md' });
            });

            it('should support regex parameter', async () => {
                await callHandleSearchVault({ query: 'test', regex: '.*\\.md$' });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ regex: '.*\\.md$' });
            });

            it('should support limit parameter', async () => {
                await callHandleSearchVault({ query: 'test', limit: 20 });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ limit: 20 });
            });

            it('should support offset parameter', async () => {
                await callHandleSearchVault({ query: 'test', offset: 10 });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ offset: 10 });
            });

            it('should support minScore parameter', async () => {
                await callHandleSearchVault({ query: 'test', minScore: 0.7 });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ minScore: 0.7 });
            });
        });

        describe('error handling', () => {
            it('should propagate service errors', async () => {
                mockService.shouldThrow = new Error('Service error');
                
                await expect(callHandleSearchVault({ query: 'test' }))
                    .rejects.toThrow('Service error');
            });
        });
    });

    describe('advanced_search_vault', () => {
        describe('parameter validation', () => {
            it('should require at least one search parameter', async () => {
                await expect(callHandleAdvancedSearchVault({}))
                    .rejects.toThrow('At least one of query, glob, regex, tags, or frontmatter must be provided');
            });

            it('should validate query is a string if provided', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 123 }))
                    .rejects.toThrow('query must be a string');
            });

            it('should validate glob is a string if provided', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', glob: 123 }))
                    .rejects.toThrow('glob must be a string');
            });

            it('should validate regex is a string if provided', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', regex: 123 }))
                    .rejects.toThrow('regex must be a string');
            });

            it('should validate limit is a positive number', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', limit: 0 }))
                    .rejects.toThrow('limit must be a positive number');
            });

            it('should validate limit is a positive number when negative', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', limit: -5 }))
                    .rejects.toThrow('limit must be a positive number');
            });

            it('should validate limit is a number', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', limit: 'ten' }))
                    .rejects.toThrow('limit must be a positive number');
            });

            it('should validate offset is a non-negative number', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', offset: -1 }))
                    .rejects.toThrow('offset must be a non-negative number');
            });

            it('should validate offset is a number', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', offset: 'five' }))
                    .rejects.toThrow('offset must be a non-negative number');
            });

            it('should validate minScore is between 0 and 1', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', minScore: 1.5 }))
                    .rejects.toThrow('minScore must be a number between 0 and 1');
            });

            it('should validate minScore is not negative', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', minScore: -0.5 }))
                    .rejects.toThrow('minScore must be a number between 0 and 1');
            });

            it('should validate minScore is a number', async () => {
                await expect(callHandleAdvancedSearchVault({ query: 'test', minScore: 'high' }))
                    .rejects.toThrow('minScore must be a number between 0 and 1');
            });
        });

        describe('successful searches', () => {
            it('should work with query only', async () => {
                const result = await callHandleAdvancedSearchVault({ query: 'test query' });
                
                expect(result).toHaveProperty('content');
                expect(result.content).toHaveLength(1);
                
                const parsedResults = JSON.parse(result.content[0].text);
                expect(parsedResults).toEqual(mockSearchResults);
            });

            it('should work with glob only', async () => {
                await callHandleAdvancedSearchVault({ glob: '**/*.md' });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ glob: '**/*.md' });
            });

            it('should work with regex only', async () => {
                await callHandleAdvancedSearchVault({ regex: '.*test.*' });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ regex: '.*test.*' });
            });

            it('should pass all parameters correctly', async () => {
                const args = {
                    query: 'test',
                    glob: '**/*.md',
                    regex: '.*test.*',
                    limit: 25,
                    offset: 10,
                    minScore: 0.6
                };
                
                await callHandleAdvancedSearchVault(args);
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toEqual({
                    query: 'test',
                    glob: '**/*.md',
                    regex: '.*test.*',
                    limit: 25,
                    offset: 10,
                    minScore: 0.6,
                    tags: undefined,
                    frontmatter: undefined
                });
            });

            it('should accept offset of 0', async () => {
                await callHandleAdvancedSearchVault({ query: 'test', offset: 0 });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ offset: 0 });
            });

            it('should accept minScore of 0', async () => {
                await callHandleAdvancedSearchVault({ query: 'test', minScore: 0 });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ minScore: 0 });
            });

            it('should accept minScore of 1', async () => {
                await callHandleAdvancedSearchVault({ query: 'test', minScore: 1 });
                
                expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ minScore: 1 });
            });
        });

        describe('error handling', () => {
            it('should propagate service errors', async () => {
                mockService.shouldThrow = new Error('Service error');
                
                await expect(callHandleAdvancedSearchVault({ query: 'test' }))
                    .rejects.toThrow('Service error');
            });
        });
    });

    describe('search_vault delegation to advanced_search_vault', () => {
        it('should call searchVaultWithOptions', async () => {
            await callHandleSearchVault({ query: 'test' });
            
            // Verify searchVaultWithOptions is called
            expect(mockService.searchVaultWithOptionsCalls).toHaveLength(1);
        });

        it('should produce identical results for same inputs', async () => {
            const args = { query: 'test query', limit: 10 };
            
            // Reset calls between tests
            mockService.searchVaultWithOptionsCalls = [];
            const searchVaultResult = await callHandleSearchVault(args);
            
            mockService.searchVaultWithOptionsCalls = [];
            const advancedSearchResult = await callHandleAdvancedSearchVault(args);
            
            expect(searchVaultResult).toEqual(advancedSearchResult);
        });

        it('should produce identical results with all parameters', async () => {
            const args = {
                query: 'test',
                glob: '**/*.md',
                regex: '.*test.*',
                limit: 15,
                offset: 5,
                minScore: 0.5
            };
            
            mockService.searchVaultWithOptionsCalls = [];
            const searchVaultResult = await callHandleSearchVault(args);
            
            mockService.searchVaultWithOptionsCalls = [];
            const advancedSearchResult = await callHandleAdvancedSearchVault(args);
            
            expect(searchVaultResult).toEqual(advancedSearchResult);
        });

        it('should pass parameters through correctly to search', async () => {
            const args = {
                query: 'delegation test',
                glob: '**/notes/*.md',
                limit: 50
            };
            
            await callHandleSearchVault(args);
            
            // Verify the exact call made to searchVaultWithOptions
            expect(mockService.searchVaultWithOptionsCalls[0]).toEqual({
                query: 'delegation test',
                glob: '**/notes/*.md',
                regex: undefined,
                limit: 50,
                offset: undefined,
                minScore: undefined,
                tags: undefined,
                frontmatter: undefined
            });
        });
    });

    describe('tag and frontmatter filtering', () => {
        it('should support tags parameter in search_vault', async () => {
            await callHandleSearchVault({ query: 'test', tags: ['project', 'work'] });
            
            expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ 
                tags: ['project', 'work'] 
            });
        });

        it('should support frontmatter parameter in search_vault', async () => {
            await callHandleSearchVault({ query: 'test', frontmatter: { status: 'published' } });
            
            expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ 
                frontmatter: { status: 'published' } 
            });
        });

        it('should support tags parameter in advanced_search_vault', async () => {
            await callHandleAdvancedSearchVault({ tags: ['project'] });
            
            expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ 
                tags: ['project'] 
            });
        });

        it('should support frontmatter parameter in advanced_search_vault', async () => {
            await callHandleAdvancedSearchVault({ frontmatter: { author: 'John' } });
            
            expect(mockService.searchVaultWithOptionsCalls[0]).toMatchObject({ 
                frontmatter: { author: 'John' } 
            });
        });

        it('should validate tags is an array', async () => {
            await expect(callHandleAdvancedSearchVault({ tags: 'not-an-array' }))
                .rejects.toThrow('tags must be an array of strings');
        });

        it('should validate tags contains only strings', async () => {
            await expect(callHandleAdvancedSearchVault({ tags: ['valid', 123] }))
                .rejects.toThrow('tags must be an array of strings');
        });

        it('should validate frontmatter is an object', async () => {
            await expect(callHandleAdvancedSearchVault({ frontmatter: 'not-an-object' }))
                .rejects.toThrow('frontmatter must be an object');
        });

        it('should validate frontmatter is not an array', async () => {
            await expect(callHandleAdvancedSearchVault({ frontmatter: ['not', 'an', 'object'] }))
                .rejects.toThrow('frontmatter must be an object');
        });

        it('should validate frontmatter is not null', async () => {
            // Include query so the "at least one parameter" check passes first
            await expect(callHandleAdvancedSearchVault({ query: 'test', frontmatter: null }))
                .rejects.toThrow('frontmatter must be an object');
        });
    });

    describe('both endpoints handle errors consistently', () => {
        beforeEach(() => {
            mockService.shouldThrow = new Error('Test error');
        });

        it('search_vault propagates errors', async () => {
            await expect(callHandleSearchVault({ query: 'test' }))
                .rejects.toThrow('Test error');
        });

        it('advanced_search_vault propagates errors', async () => {
            await expect(callHandleAdvancedSearchVault({ query: 'test' }))
                .rejects.toThrow('Test error');
        });
    });
});
