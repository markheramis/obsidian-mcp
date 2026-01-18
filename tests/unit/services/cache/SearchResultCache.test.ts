/**
 * Unit tests for SearchResultCache
 * 
 * Tests the LRU search result cache with optional persistent backing
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { SearchResultCache } from '../../../../src/services/cache/SearchResultCache';
import { PersistentCache } from '../../../../src/services/cache/PersistentCache';
import { SearchResult, SearchOptions } from '../../../../src/types/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SearchResultCache', () => {
    const mockResults: SearchResult[] = [
        {
            path: 'notes/test.md',
            score: 0.85,
            matches: [{ line: 5, context: 'context', snippet: 'snippet', column: 10 }]
        },
        {
            path: 'notes/another.md',
            score: 0.65,
            matches: [{ line: 10, context: 'context2', snippet: 'snippet2', column: 15 }]
        }
    ];

    describe('in-memory only', () => {
        let cache: SearchResultCache;

        beforeEach(() => {
            cache = new SearchResultCache(3, 60000); // Small size, 1 minute TTL
        });

        it('should store and retrieve results', () => {
            const options: SearchOptions = { query: 'test' };
            cache.set(options, mockResults);
            
            const retrieved = cache.get(options);
            expect(retrieved).toEqual(mockResults);
        });

        it('should return null for non-cached query', () => {
            const options: SearchOptions = { query: 'nonexistent' };
            expect(cache.get(options)).toBeNull();
        });

        it('should return deep copy to prevent mutation', () => {
            const options: SearchOptions = { query: 'test' };
            cache.set(options, mockResults);
            
            const retrieved = cache.get(options);
            retrieved![0].score = 0.99;
            
            const retrievedAgain = cache.get(options);
            expect(retrievedAgain![0].score).toBe(0.85); // Original unchanged
        });

        it('should return null when TTL expired', async () => {
            const shortTtlCache = new SearchResultCache(10, 50); // 50ms TTL
            const options: SearchOptions = { query: 'test' };
            shortTtlCache.set(options, mockResults);
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(shortTtlCache.get(options)).toBeNull();
        });

        it('should generate unique keys for different options', () => {
            const options1: SearchOptions = { query: 'test' };
            const options2: SearchOptions = { query: 'test', limit: 10 };
            const options3: SearchOptions = { query: 'test', glob: '*.md' };
            
            cache.set(options1, mockResults);
            cache.set(options2, [mockResults[0]]);
            cache.set(options3, [mockResults[1]]);
            
            expect(cache.get(options1)).toHaveLength(2);
            expect(cache.get(options2)).toHaveLength(1);
            expect(cache.get(options3)).toHaveLength(1);
        });

        it('should include all options in key generation', () => {
            const fullOptions: SearchOptions = {
                query: 'test',
                glob: '*.md',
                regex: '.*test.*',
                limit: 10,
                offset: 5,
                minScore: 0.5,
                tags: ['tag1', 'tag2'],
                frontmatter: { status: 'published' }
            };
            
            cache.set(fullOptions, mockResults);
            expect(cache.get(fullOptions)).toEqual(mockResults);
            
            // Different options should not match
            const differentOptions: SearchOptions = {
                ...fullOptions,
                tags: ['tag1'] // Different tags
            };
            expect(cache.get(differentOptions)).toBeNull();
        });

        it('should evict oldest entries when at capacity', () => {
            const options1: SearchOptions = { query: 'test1' };
            const options2: SearchOptions = { query: 'test2' };
            const options3: SearchOptions = { query: 'test3' };
            const options4: SearchOptions = { query: 'test4' };
            
            cache.set(options1, mockResults);
            cache.set(options2, mockResults);
            cache.set(options3, mockResults);
            cache.set(options4, mockResults); // Should evict options1
            
            expect(cache.get(options1)).toBeNull();
            expect(cache.get(options4)).toEqual(mockResults);
        });

        it('should move accessed entries to end of LRU list', () => {
            const options1: SearchOptions = { query: 'test1' };
            const options2: SearchOptions = { query: 'test2' };
            const options3: SearchOptions = { query: 'test3' };
            
            cache.set(options1, mockResults);
            cache.set(options2, mockResults);
            cache.set(options3, mockResults);
            
            // Access options1 to make it recently used
            cache.get(options1);
            
            // Add options4, should evict options2
            const options4: SearchOptions = { query: 'test4' };
            cache.set(options4, mockResults);
            
            expect(cache.get(options1)).toEqual(mockResults);
            expect(cache.get(options2)).toBeNull();
        });

        it('should invalidate all entries', () => {
            cache.set({ query: 'test1' }, mockResults);
            cache.set({ query: 'test2' }, mockResults);
            cache.invalidate();
            
            expect(cache.get({ query: 'test1' })).toBeNull();
            expect(cache.get({ query: 'test2' })).toBeNull();
        });

        it('should report correct stats', () => {
            cache.set({ query: 'test' }, mockResults);
            
            const stats = cache.getStats();
            expect(stats.size).toBe(1);
            expect(stats.maxSize).toBe(3);
            expect(stats.ttl).toBe(60000);
            expect(stats.persistentEnabled).toBe(false);
        });
    });

    describe('with persistent backing', () => {
        let cache: SearchResultCache;
        let persistentCache: PersistentCache<{ results: SearchResult[]; timestamp: number }>;
        let testDbPath: string;

        beforeEach(() => {
            testDbPath = path.join(os.tmpdir(), `search-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            persistentCache = new PersistentCache({
                dbPath: testDbPath,
                dbName: 'search',
            });
            cache = new SearchResultCache(3, 60000, persistentCache);
        });

        afterEach(async () => {
            cache.close();
            await PersistentCache.closeAll();
            if (fs.existsSync(testDbPath)) {
                fs.rmSync(testDbPath, { recursive: true, force: true });
            }
        });

        afterAll(async () => {
            await PersistentCache.closeAll();
        });

        it('should store in both memory and persistent cache', () => {
            const options: SearchOptions = { query: 'test' };
            cache.set(options, mockResults);
            
            const stats = cache.getStats();
            expect(stats.persistentSize).toBeGreaterThan(0);
        });

        it('should retrieve from persistent cache on memory miss', async () => {
            const options: SearchOptions = { query: 'test' };
            cache.set(options, mockResults);
            
            // Close and reopen
            cache.close();
            await PersistentCache.closeAll();
            
            const newPersistent = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });
            const newCache = new SearchResultCache(3, 60000, newPersistent);
            
            expect(newCache.get(options)).toEqual(mockResults);
            
            newCache.close();
        });

        it('should invalidate from both memory and persistent', () => {
            cache.set({ query: 'test1' }, mockResults);
            cache.set({ query: 'test2' }, mockResults);
            cache.invalidate();
            
            expect(cache.get({ query: 'test1' })).toBeNull();
            expect(persistentCache.size()).toBe(0);
        });

        it('should report persistent enabled in stats', () => {
            const stats = cache.getStats();
            expect(stats.persistentEnabled).toBe(true);
        });
    });
});
