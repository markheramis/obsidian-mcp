/**
 * Integration tests for cache persistence
 * 
 * Tests that cache data survives across service restarts and
 * properly handles stale data invalidation.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { FileListCache } from '../../../src/services/cache/FileListCache';
import { ContentCache } from '../../../src/services/cache/ContentCache';
import { SearchResultCache } from '../../../src/services/cache/SearchResultCache';
import { PersistentCache } from '../../../src/services/cache/PersistentCache';
import { SearchResult } from '../../../src/types/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Cache Persistence Integration', () => {
    let testDbPath: string;

    beforeEach(() => {
        testDbPath = path.join(os.tmpdir(), `cache-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    });

    afterEach(async () => {
        await PersistentCache.closeAll();
        if (fs.existsSync(testDbPath)) {
            fs.rmSync(testDbPath, { recursive: true, force: true });
        }
    });

    afterAll(async () => {
        await PersistentCache.closeAll();
    });

    describe('FileListCache persistence', () => {
        it('should persist file list across cache instances', async () => {
            const files = ['notes/file1.md', 'notes/file2.md', 'projects/readme.md'];

            // Create first cache instance and store data
            const persistent1 = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const cache1 = new FileListCache(60000, persistent1);
            cache1.set('', files);
            cache1.close();
            await PersistentCache.closeAll();

            // Create second cache instance and verify data persists
            const persistent2 = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const cache2 = new FileListCache(60000, persistent2);
            
            const retrieved = cache2.get('');
            expect(retrieved).toEqual(files);
            
            cache2.close();
        });

        it('should respect TTL for persisted entries', async () => {
            const files = ['file1.md'];

            // Create cache with short TTL
            const persistent1 = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const cache1 = new FileListCache(50, persistent1); // 50ms TTL
            cache1.set('', files);
            cache1.close();
            await PersistentCache.closeAll();

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 100));

            // Create second cache instance
            const persistent2 = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const cache2 = new FileListCache(50, persistent2);
            
            // Should return null due to TTL expiration
            expect(cache2.get('')).toBeNull();
            
            cache2.close();
        });
    });

    describe('ContentCache persistence', () => {
        it('should persist file content across cache instances', async () => {
            const content = '# My Note\n\nThis is the content of my note.';
            const mtime = Date.now();

            // Create first cache instance and store data
            const persistent1 = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const cache1 = new ContentCache(100, persistent1);
            cache1.set('notes/test.md', content, mtime);
            cache1.close();
            await PersistentCache.closeAll();

            // Create second cache instance and verify data persists
            const persistent2 = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const cache2 = new ContentCache(100, persistent2);
            
            const retrieved = cache2.get('notes/test.md', mtime);
            expect(retrieved).toBe(content);
            
            cache2.close();
        });

        it('should invalidate persisted content when mtime changes', async () => {
            const content = 'Original content';
            const originalMtime = Date.now();
            const newMtime = originalMtime + 1000;

            // Store with original mtime
            const persistent1 = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const cache1 = new ContentCache(100, persistent1);
            cache1.set('test.md', content, originalMtime);
            cache1.close();
            await PersistentCache.closeAll();

            // Try to retrieve with different mtime
            const persistent2 = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const cache2 = new ContentCache(100, persistent2);
            
            // Should return null due to mtime mismatch
            expect(cache2.get('test.md', newMtime)).toBeNull();
            
            cache2.close();
        });
    });

    describe('SearchResultCache persistence', () => {
        const mockResults: SearchResult[] = [
            {
                path: 'notes/meeting.md',
                score: 0.85,
                matches: [{ line: 5, context: 'context', snippet: 'snippet', column: 10 }]
            }
        ];

        it('should persist search results across cache instances', async () => {
            const searchOptions = { query: 'test query', limit: 10 };

            // Create first cache instance and store data
            const persistent1 = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });
            const cache1 = new SearchResultCache(50, 60000, persistent1);
            cache1.set(searchOptions, mockResults);
            cache1.close();
            await PersistentCache.closeAll();

            // Create second cache instance and verify data persists
            const persistent2 = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });
            const cache2 = new SearchResultCache(50, 60000, persistent2);
            
            const retrieved = cache2.get(searchOptions);
            expect(retrieved).toEqual(mockResults);
            
            cache2.close();
        });

        it('should respect TTL for persisted search results', async () => {
            const searchOptions = { query: 'test' };

            // Create cache with short TTL
            const persistent1 = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });
            const cache1 = new SearchResultCache(50, 50, persistent1); // 50ms TTL
            cache1.set(searchOptions, mockResults);
            cache1.close();
            await PersistentCache.closeAll();

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 100));

            // Create second cache instance
            const persistent2 = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });
            const cache2 = new SearchResultCache(50, 50, persistent2);
            
            // Should return null due to TTL expiration
            expect(cache2.get(searchOptions)).toBeNull();
            
            cache2.close();
        });
    });

    describe('multiple cache types sharing same database path', () => {
        it('should keep different cache types isolated', async () => {
            const fileList = ['file1.md', 'file2.md'];
            const content = 'Test content';
            const mtime = Date.now();
            const searchResults: SearchResult[] = [
                { path: 'test.md', score: 0.9, matches: [] }
            ];

            // Create all three cache types sharing the same dbPath
            const fileListPersistent = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const contentPersistent = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const searchPersistent = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });

            const fileListCache = new FileListCache(60000, fileListPersistent);
            const contentCache = new ContentCache(100, contentPersistent);
            const searchCache = new SearchResultCache(50, 60000, searchPersistent);

            // Store data in each cache
            fileListCache.set('', fileList);
            contentCache.set('test.md', content, mtime);
            searchCache.set({ query: 'test' }, searchResults);

            // Close all
            fileListCache.close();
            contentCache.close();
            searchCache.close();
            await PersistentCache.closeAll();

            // Reopen and verify isolation
            const newFileListPersistent = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const newContentPersistent = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const newSearchPersistent = new PersistentCache<{ results: SearchResult[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'search',
            });

            const newFileListCache = new FileListCache(60000, newFileListPersistent);
            const newContentCache = new ContentCache(100, newContentPersistent);
            const newSearchCache = new SearchResultCache(50, 60000, newSearchPersistent);

            expect(newFileListCache.get('')).toEqual(fileList);
            expect(newContentCache.get('test.md', mtime)).toBe(content);
            expect(newSearchCache.get({ query: 'test' })).toEqual(searchResults);

            newFileListCache.close();
            newContentCache.close();
            newSearchCache.close();
        });
    });

    describe('cache invalidation persistence', () => {
        it('should persist invalidation across instances', async () => {
            const files = ['file1.md', 'file2.md'];

            // Store and then invalidate
            const persistent1 = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const cache1 = new FileListCache(60000, persistent1);
            cache1.set('', files);
            cache1.invalidate();
            cache1.close();
            await PersistentCache.closeAll();

            // Verify invalidation persisted
            const persistent2 = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const cache2 = new FileListCache(60000, persistent2);
            
            expect(cache2.get('')).toBeNull();
            
            cache2.close();
        });
    });
});
