import { FileListCache } from '../../../../src/services/cache/FileListCache';
import { PersistentCache } from '../../../../src/services/cache/PersistentCache';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FileListCache', () => {
    let cache: FileListCache;

    beforeEach(() => {
        cache = new FileListCache();
    });

    describe('constructor', () => {
        it('should create cache with default TTL of 60000ms', () => {
            expect(cache.getTtl()).toBe(60000);
        });

        it('should create cache with custom TTL', () => {
            const customCache = new FileListCache(30000);
            expect(customCache.getTtl()).toBe(30000);
        });
    });

    describe('get/set', () => {
        it('should return null for empty cache', () => {
            expect(cache.get()).toBeNull();
            expect(cache.get('folder')).toBeNull();
        });

        it('should store and retrieve files for root folder', () => {
            const files = ['file1.md', 'file2.md'];
            cache.set('', files);
            expect(cache.get('')).toEqual(files);
        });

        it('should store and retrieve files for specific folder', () => {
            const files = ['folder/file1.md', 'folder/file2.md'];
            cache.set('folder', files);
            expect(cache.get('folder')).toEqual(files);
        });

        it('should return a copy of cached files (not reference)', () => {
            const files = ['file1.md', 'file2.md'];
            cache.set('', files);
            const retrieved = cache.get('');
            
            // Modify retrieved array
            retrieved?.push('file3.md');
            
            // Original cache should not be affected
            expect(cache.get('')).toEqual(['file1.md', 'file2.md']);
        });

        it('should store a copy of files (not reference)', () => {
            const files = ['file1.md', 'file2.md'];
            cache.set('', files);
            
            // Modify original array
            files.push('file3.md');
            
            // Cache should not be affected
            expect(cache.get('')).toEqual(['file1.md', 'file2.md']);
        });

        it('should handle different folders independently', () => {
            const rootFiles = ['root.md'];
            const folderFiles = ['folder/file.md'];
            
            cache.set('', rootFiles);
            cache.set('folder', folderFiles);
            
            expect(cache.get('')).toEqual(rootFiles);
            expect(cache.get('folder')).toEqual(folderFiles);
        });
    });

    describe('TTL expiration', () => {
        it('should return null for expired cache entries', async () => {
            const shortTtlCache = new FileListCache(50); // 50ms TTL
            shortTtlCache.set('', ['file.md']);
            
            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(shortTtlCache.get('')).toBeNull();
        });

        it('should return files for non-expired cache entries', () => {
            const files = ['file.md'];
            cache.set('', files);
            
            // Immediately retrieve (should not be expired)
            expect(cache.get('')).toEqual(files);
        });
    });

    describe('isValid', () => {
        it('should return false for empty cache', () => {
            expect(cache.isValid('')).toBe(false);
            expect(cache.isValid('folder')).toBe(false);
        });

        it('should return true for valid cache entry', () => {
            cache.set('', ['file.md']);
            expect(cache.isValid('')).toBe(true);
        });

        it('should return false for expired cache entry', async () => {
            const shortTtlCache = new FileListCache(50);
            shortTtlCache.set('', ['file.md']);
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(shortTtlCache.isValid('')).toBe(false);
        });
    });

    describe('invalidate', () => {
        it('should invalidate all cache entries when called without folder', () => {
            cache.set('', ['root.md']);
            cache.set('folder1', ['folder1/file.md']);
            cache.set('folder2', ['folder2/file.md']);
            
            cache.invalidate();
            
            expect(cache.get('')).toBeNull();
            expect(cache.get('folder1')).toBeNull();
            expect(cache.get('folder2')).toBeNull();
        });

        it('should invalidate specific folder when called with folder path', () => {
            cache.set('', ['root.md']);
            cache.set('folder', ['folder/file.md']);
            
            cache.invalidate('folder');
            
            // Root should also be invalidated (related folder)
            expect(cache.get('')).toBeNull();
            expect(cache.get('folder')).toBeNull();
        });

        it('should invalidate parent folders when child folder is invalidated', () => {
            cache.set('', ['root.md']);
            cache.set('parent', ['parent/file.md']);
            cache.set('parent/child', ['parent/child/file.md']);
            
            cache.invalidate('parent/child');
            
            expect(cache.get('parent/child')).toBeNull();
            expect(cache.get('parent')).toBeNull();
            expect(cache.get('')).toBeNull();
        });
    });

    describe('clear', () => {
        it('should clear all cache entries', () => {
            cache.set('', ['root.md']);
            cache.set('folder', ['folder/file.md']);
            
            cache.clear();
            
            expect(cache.get('')).toBeNull();
            expect(cache.get('folder')).toBeNull();
        });
    });

    describe('getStats', () => {
        it('should return empty stats for empty cache', () => {
            const stats = cache.getStats();
            expect(stats.entryCount).toBe(0);
            expect(stats.folders).toEqual([]);
        });

        it('should return correct stats for populated cache', () => {
            cache.set('', ['root.md']);
            cache.set('folder1', ['folder1/file.md']);
            cache.set('folder2', ['folder2/file.md']);
            
            const stats = cache.getStats();
            expect(stats.entryCount).toBe(3);
            expect(stats.folders).toContain('');
            expect(stats.folders).toContain('folder1');
            expect(stats.folders).toContain('folder2');
        });
    });

    describe('path normalization', () => {
        it('should normalize backslashes to forward slashes', () => {
            cache.set('folder\\subfolder', ['file.md']);
            expect(cache.get('folder/subfolder')).toEqual(['file.md']);
        });

        it('should remove trailing slashes', () => {
            cache.set('folder/', ['file.md']);
            expect(cache.get('folder')).toEqual(['file.md']);
        });

        it('should handle case-insensitive folder names', () => {
            cache.set('Folder', ['file.md']);
            expect(cache.get('folder')).toEqual(['file.md']);
        });
    });

    describe('with persistent backing', () => {
        let persistentCache: PersistentCache<{ files: string[]; timestamp: number }>;
        let testDbPath: string;
        let persistentFileListCache: FileListCache;

        beforeEach(() => {
            testDbPath = path.join(os.tmpdir(), `filelist-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            persistentCache = new PersistentCache({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            persistentFileListCache = new FileListCache(60000, persistentCache);
        });

        afterEach(async () => {
            persistentFileListCache.close();
            await PersistentCache.closeAll();
            if (fs.existsSync(testDbPath)) {
                fs.rmSync(testDbPath, { recursive: true, force: true });
            }
        });

        afterAll(async () => {
            await PersistentCache.closeAll();
        });

        it('should store in both memory and persistent cache', () => {
            persistentFileListCache.set('', ['file1.md', 'file2.md']);
            
            const stats = persistentFileListCache.getStats();
            expect(stats.persistentSize).toBeGreaterThan(0);
        });

        it('should retrieve from persistent cache on memory miss', async () => {
            persistentFileListCache.set('', ['file1.md', 'file2.md']);
            
            // Close and reopen
            persistentFileListCache.close();
            await PersistentCache.closeAll();
            
            const newPersistent = new PersistentCache<{ files: string[]; timestamp: number }>({
                dbPath: testDbPath,
                dbName: 'fileList',
            });
            const newCache = new FileListCache(60000, newPersistent);
            
            expect(newCache.get('')).toEqual(['file1.md', 'file2.md']);
            
            newCache.close();
        });

        it('should invalidate from both memory and persistent', () => {
            persistentFileListCache.set('', ['file1.md']);
            persistentFileListCache.set('folder', ['folder/file.md']);
            persistentFileListCache.invalidate();
            
            expect(persistentFileListCache.get('')).toBeNull();
            expect(persistentCache.size()).toBe(0);
        });

        it('should clear both memory and persistent', () => {
            persistentFileListCache.set('', ['file1.md']);
            persistentFileListCache.set('folder', ['folder/file.md']);
            persistentFileListCache.clear();
            
            expect(persistentFileListCache.get('')).toBeNull();
            expect(persistentCache.size()).toBe(0);
        });

        it('should report persistent enabled in stats', () => {
            const stats = persistentFileListCache.getStats();
            expect(stats.persistentEnabled).toBe(true);
        });
    });
});
