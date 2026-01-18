/**
 * Unit tests for ContentCache
 * 
 * Tests the LRU content cache with optional persistent backing
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { ContentCache } from '../../../../src/services/cache/ContentCache';
import { PersistentCache } from '../../../../src/services/cache/PersistentCache';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ContentCache', () => {
    describe('in-memory only', () => {
        let cache: ContentCache;

        beforeEach(() => {
            cache = new ContentCache(3); // Small size for testing LRU
        });

        it('should store and retrieve content', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            expect(cache.get('file1.md', mtime)).toBe('content1');
        });

        it('should return null for non-existent file', () => {
            expect(cache.get('nonexistent.md', Date.now())).toBeNull();
        });

        it('should return null when mtime does not match', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            expect(cache.get('file1.md', mtime + 1000)).toBeNull();
        });

        it('should invalidate stale entries on get', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.get('file1.md', mtime + 1000); // Should invalidate
            expect(cache.has('file1.md')).toBe(false);
        });

        it('should invalidate a specific file', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.invalidate('file1.md');
            expect(cache.get('file1.md', mtime)).toBeNull();
        });

        it('should clear all entries', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.set('file2.md', 'content2', mtime);
            cache.clear();
            expect(cache.get('file1.md', mtime)).toBeNull();
            expect(cache.get('file2.md', mtime)).toBeNull();
        });

        it('should evict oldest entries when at capacity', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.set('file2.md', 'content2', mtime);
            cache.set('file3.md', 'content3', mtime);
            cache.set('file4.md', 'content4', mtime); // Should evict file1
            
            expect(cache.get('file1.md', mtime)).toBeNull();
            expect(cache.get('file4.md', mtime)).toBe('content4');
        });

        it('should move accessed entries to end of LRU list', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.set('file2.md', 'content2', mtime);
            cache.set('file3.md', 'content3', mtime);
            
            // Access file1 to make it recently used
            cache.get('file1.md', mtime);
            
            // Add file4, which should evict file2 (oldest now)
            cache.set('file4.md', 'content4', mtime);
            
            expect(cache.get('file1.md', mtime)).toBe('content1'); // Still exists
            expect(cache.get('file2.md', mtime)).toBeNull(); // Evicted
        });

        it('should normalize paths', () => {
            const mtime = Date.now();
            cache.set('folder\\file.md', 'content', mtime);
            expect(cache.get('folder/file.md', mtime)).toBe('content');
        });

        it('should report correct stats', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            
            const stats = cache.getStats();
            expect(stats.size).toBe(1);
            expect(stats.maxSize).toBe(3);
            expect(stats.files).toContain('file1.md');
            expect(stats.persistentEnabled).toBe(false);
        });
    });

    describe('with persistent backing', () => {
        let cache: ContentCache;
        let persistentCache: PersistentCache<{ content: string; mtime: number }>;
        let testDbPath: string;

        beforeEach(() => {
            testDbPath = path.join(os.tmpdir(), `content-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            persistentCache = new PersistentCache({
                dbPath: testDbPath,
                dbName: 'content',
            });
            cache = new ContentCache(3, persistentCache);
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
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            
            // Check memory
            expect(cache.get('file1.md', mtime)).toBe('content1');
            
            // Check persistent (via stats)
            const stats = cache.getStats();
            expect(stats.persistentSize).toBeGreaterThan(0);
        });

        it('should retrieve from persistent cache on memory miss', async () => {
            const mtime = Date.now();
            
            // Store in cache
            cache.set('file1.md', 'content1', mtime);
            
            // Clear memory but not persistent
            cache.close();
            await PersistentCache.closeAll();
            
            // Create new cache with same persistent backing
            const newPersistent = new PersistentCache<{ content: string; mtime: number }>({
                dbPath: testDbPath,
                dbName: 'content',
            });
            const newCache = new ContentCache(3, newPersistent);
            
            // Should retrieve from persistent
            expect(newCache.get('file1.md', mtime)).toBe('content1');
            
            newCache.close();
        });

        it('should invalidate from both memory and persistent', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.invalidate('file1.md');
            
            expect(cache.get('file1.md', mtime)).toBeNull();
            expect(persistentCache.has('file1.md')).toBe(false);
        });

        it('should clear both memory and persistent', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'content1', mtime);
            cache.set('file2.md', 'content2', mtime);
            cache.clear();
            
            expect(cache.get('file1.md', mtime)).toBeNull();
            expect(persistentCache.size()).toBe(0);
        });

        it('should report persistent enabled in stats', () => {
            const stats = cache.getStats();
            expect(stats.persistentEnabled).toBe(true);
        });
    });

    describe('metadata features', () => {
        let cache: ContentCache;

        beforeEach(() => {
            cache = new ContentCache(10);
        });

        it('should compute and store word count', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'Hello world this is a test', mtime);
            
            const entry = cache.getEntry('file1.md', mtime);
            expect(entry?.wordCount).toBe(6);
        });

        it('should compute and store line count', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'Line 1\nLine 2\nLine 3', mtime);
            
            const entry = cache.getEntry('file1.md', mtime);
            expect(entry?.lineCount).toBe(3);
        });

        it('should extract inline tags', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'Content with #tag1 and #tag2/nested', mtime);
            
            const entry = cache.getEntry('file1.md', mtime);
            expect(entry?.inlineTags).toContain('tag1');
            expect(entry?.inlineTags).toContain('tag2/nested');
        });

        it('should handle setWithMetadata', () => {
            const mtime = Date.now();
            const frontmatter = {
                tags: ['frontmatter-tag'],
                data: { title: 'Test' },
                hasFrontmatter: true,
            };
            
            cache.setWithMetadata('file1.md', 'Content here', mtime, frontmatter);
            
            const entry = cache.getEntry('file1.md', mtime);
            expect(entry?.parsedFrontmatter?.tags).toContain('frontmatter-tag');
            expect(entry?.parsedFrontmatter?.data.title).toBe('Test');
        });

        it('should return metadata via getMetadata', () => {
            const mtime = Date.now();
            const frontmatter = {
                tags: ['fm-tag'],
                data: { status: 'draft' },
                hasFrontmatter: true,
            };
            
            cache.setWithMetadata('file1.md', 'Content with #inline-tag', mtime, frontmatter);
            
            const metadata = cache.getMetadata('file1.md', mtime);
            expect(metadata?.frontmatter?.tags).toContain('fm-tag');
            expect(metadata?.inlineTags).toContain('inline-tag');
            expect(metadata?.allTags).toContain('fm-tag');
            expect(metadata?.allTags).toContain('inline-tag');
        });

        it('should update frontmatter for existing entry', () => {
            const mtime = Date.now();
            cache.set('file1.md', 'Content', mtime);
            
            const frontmatter = {
                tags: ['new-tag'],
                data: { added: true },
                hasFrontmatter: true,
            };
            
            cache.updateFrontmatter('file1.md', frontmatter);
            
            const entry = cache.getEntry('file1.md', mtime);
            expect(entry?.parsedFrontmatter?.tags).toContain('new-tag');
        });

        it('should handle empty content', () => {
            const mtime = Date.now();
            cache.set('file1.md', '', mtime);
            
            const entry = cache.getEntry('file1.md', mtime);
            expect(entry?.wordCount).toBe(0);
            expect(entry?.lineCount).toBe(0);
            expect(entry?.inlineTags).toEqual([]);
        });
    });
});
