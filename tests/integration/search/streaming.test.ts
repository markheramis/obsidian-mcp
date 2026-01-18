/**
 * Integration tests for streaming search
 * 
 * These tests mock the config module to use a test vault path.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

// Create test vault path
const testVaultPath = path.join(os.tmpdir(), `streaming-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Mock the config module BEFORE importing anything else
jest.unstable_mockModule('../../../src/config/index.js', () => ({
    config: {
        vaultPath: testVaultPath,
        enableFileWatcher: false,
        fileWatcherDebounce: 100,
        enablePersistentCache: false,
        cachePath: './.obsidian-cache',
        fileListCacheTtl: 60000,
        contentCacheMaxSize: 100,
        searchCacheMaxSize: 50,
        searchCacheTtl: 30000,
        searchBatchSize: 10,
        enableInvertedIndex: false,
        invertedIndexMinWordLength: 3,
        invertedIndexMaxWordsPerFile: 10000,
        enablePathTrie: false,
        enableCompression: false,
        compressionThreshold: 100000,
        enableCacheWarmup: false,
        warmupFileCount: 50,
    },
    SERVER_INFO: {
        name: 'obsidian-mcp-server',
        version: '2.4.0'
    }
}));

// Now import the modules after mocking
const { FileSystemService } = await import('../../../src/services/fileSystem.js');
const { PersistentCache } = await import('../../../src/services/cache/PersistentCache.js');

describe('Streaming Search Integration', () => {
    let service: InstanceType<typeof FileSystemService>;

    beforeAll(() => {
        // Create test vault directory
        fs.mkdirSync(testVaultPath, { recursive: true });
        
        // Create test files
        fs.writeFileSync(path.join(testVaultPath, 'note1.md'), `---
tags: [javascript, programming]
---
# Note 1
This is about JavaScript programming.`);
        
        fs.writeFileSync(path.join(testVaultPath, 'note2.md'), `---
tags: [typescript, programming]
---
# Note 2
This is about TypeScript programming.`);
        
        fs.writeFileSync(path.join(testVaultPath, 'note3.md'), `---
tags: [python]
---
# Note 3
This is about Python scripting.`);
        
        fs.mkdirSync(path.join(testVaultPath, 'subfolder'), { recursive: true });
        fs.writeFileSync(path.join(testVaultPath, 'subfolder', 'nested.md'), `# Nested Note
This is a nested file about programming basics.`);
    });

    beforeEach(() => {
        service = new FileSystemService();
    });

    afterEach(async () => {
        if (service) {
            await service.close();
        }
        await PersistentCache.closeAll();
    });

    afterAll(async () => {
        await PersistentCache.closeAll();
        
        if (fs.existsSync(testVaultPath)) {
            fs.rmSync(testVaultPath, { recursive: true, force: true });
        }
    });

    describe('searchVaultStreaming', () => {
        it('should yield results incrementally', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ query: 'programming' })) {
                results.push(result);
            }
            
            expect(results.length).toBeGreaterThan(0);
        });

        it('should find files matching query', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ query: 'JavaScript' })) {
                results.push(result);
            }
            
            expect(results.length).toBe(1);
            expect(results[0].path).toBe('note1.md');
        });

        it('should respect limit', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ query: 'programming', limit: 2 })) {
                results.push(result);
            }
            
            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should filter by glob pattern', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ 
                query: 'programming',
                glob: 'subfolder/*.md'
            })) {
                results.push(result);
            }
            
            expect(results.length).toBe(1);
            expect(results[0].path).toContain('nested.md');
        });

        it('should filter by tags', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ 
                tags: ['programming']
            })) {
                results.push(result);
            }
            
            // Should find note1 (javascript, programming) and note2 (typescript, programming)
            expect(results.length).toBe(2);
        });

        it('should filter by frontmatter', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ 
                frontmatter: { tags: 'python' }
            })) {
                results.push(result);
            }
            
            expect(results.length).toBe(1);
            expect(results[0].path).toBe('note3.md');
        });

        it('should respect minScore', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ 
                query: 'programming',
                minScore: 0.5
            })) {
                results.push(result);
            }
            
            // All results should have score >= 0.5
            for (const result of results) {
                expect(result.score).toBeGreaterThanOrEqual(0.5);
            }
        });

        it('should handle no matches', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ query: 'nonexistent-xyz' })) {
                results.push(result);
            }
            
            expect(results.length).toBe(0);
        });

        it('should include match details', async () => {
            const results = [];
            
            for await (const result of service.searchVaultStreaming({ query: 'JavaScript' })) {
                results.push(result);
            }
            
            expect(results[0].matches.length).toBeGreaterThan(0);
            expect(results[0].matches[0].line).toBeGreaterThan(0);
        });
    });

    describe('comparison with regular search', () => {
        it('should return same results as regular search', async () => {
            const streamingResults = [];
            for await (const result of service.searchVaultStreaming({ query: 'programming' })) {
                streamingResults.push(result);
            }
            
            const regularResults = await service.searchVault('programming');
            
            // Same number of results
            expect(streamingResults.length).toBe(regularResults.length);
            
            // Same files (order may differ)
            const streamingPaths = streamingResults.map(r => r.path).sort();
            const regularPaths = regularResults.map(r => r.path).sort();
            expect(streamingPaths).toEqual(regularPaths);
        });
    });
});
