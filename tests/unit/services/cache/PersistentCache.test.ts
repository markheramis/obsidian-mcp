/**
 * Unit tests for PersistentCache
 * 
 * Tests the LMDB-backed persistent cache implementation including:
 * - Basic get/set/delete operations
 * - TTL expiration
 * - Mtime validation
 * - Database persistence across instances
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { PersistentCache } from '../../../../src/services/cache/PersistentCache';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PersistentCache', () => {
    let testDbPath: string;
    let cache: PersistentCache<string>;

    beforeEach(() => {
        // Create a unique test directory for each test
        testDbPath = path.join(os.tmpdir(), `persistent-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    });

    afterEach(async () => {
        // Close cache and clean up
        if (cache) {
            cache.close();
        }
        await PersistentCache.closeAll();
        
        // Clean up test directory
        if (fs.existsSync(testDbPath)) {
            fs.rmSync(testDbPath, { recursive: true, force: true });
        }
    });

    afterAll(async () => {
        // Ensure all caches are closed
        await PersistentCache.closeAll();
    });

    describe('basic operations', () => {
        beforeEach(() => {
            cache = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'test',
            });
        });

        it('should store and retrieve a value', () => {
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');
        });

        it('should return null for non-existent key', () => {
            expect(cache.get('nonexistent')).toBeNull();
        });

        it('should delete a value', () => {
            cache.set('key1', 'value1');
            cache.delete('key1');
            expect(cache.get('key1')).toBeNull();
        });

        it('should check if key exists', () => {
            cache.set('key1', 'value1');
            expect(cache.has('key1')).toBe(true);
            expect(cache.has('nonexistent')).toBe(false);
        });

        it('should clear all entries', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.clear();
            expect(cache.get('key1')).toBeNull();
            expect(cache.get('key2')).toBeNull();
            expect(cache.size()).toBe(0);
        });

        it('should return all keys', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            const keys = cache.keys();
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
            expect(keys.length).toBe(2);
        });

        it('should return correct size', () => {
            expect(cache.size()).toBe(0);
            cache.set('key1', 'value1');
            expect(cache.size()).toBe(1);
            cache.set('key2', 'value2');
            expect(cache.size()).toBe(2);
        });

        it('should overwrite existing value', () => {
            cache.set('key1', 'value1');
            cache.set('key1', 'value2');
            expect(cache.get('key1')).toBe('value2');
            expect(cache.size()).toBe(1);
        });
    });

    describe('TTL operations', () => {
        beforeEach(() => {
            cache = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'ttl-test',
            });
        });

        it('should return value when TTL has not expired', () => {
            cache.set('key1', 'value1');
            // TTL of 1 hour
            expect(cache.getWithTtl('key1', 3600000)).toBe('value1');
        });

        it('should return null when TTL has expired', async () => {
            cache.set('key1', 'value1');
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 50));
            // TTL of 10ms (already expired)
            expect(cache.getWithTtl('key1', 10)).toBeNull();
        });

        it('should delete expired entries on access', async () => {
            cache.set('key1', 'value1');
            await new Promise(resolve => setTimeout(resolve, 50));
            cache.getWithTtl('key1', 10); // This should delete the entry
            expect(cache.has('key1')).toBe(false);
        });
    });

    describe('mtime operations', () => {
        beforeEach(() => {
            cache = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'mtime-test',
            });
        });

        it('should return value when mtime matches', () => {
            const mtime = Date.now();
            cache.set('key1', 'value1', mtime);
            expect(cache.getWithMtime('key1', mtime)).toBe('value1');
        });

        it('should return null when mtime does not match', () => {
            const mtime = Date.now();
            cache.set('key1', 'value1', mtime);
            expect(cache.getWithMtime('key1', mtime + 1000)).toBeNull();
        });

        it('should delete stale entries on access', () => {
            const mtime = Date.now();
            cache.set('key1', 'value1', mtime);
            cache.getWithMtime('key1', mtime + 1000); // This should delete the entry
            expect(cache.has('key1')).toBe(false);
        });
    });

    describe('combined TTL and mtime operations', () => {
        beforeEach(() => {
            cache = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'combined-test',
            });
        });

        it('should return value when both TTL and mtime are valid', () => {
            const mtime = Date.now();
            cache.set('key1', 'value1', mtime);
            expect(cache.getWithTtlAndMtime('key1', 3600000, mtime)).toBe('value1');
        });

        it('should return null when TTL is expired', async () => {
            const mtime = Date.now();
            cache.set('key1', 'value1', mtime);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(cache.getWithTtlAndMtime('key1', 10, mtime)).toBeNull();
        });

        it('should return null when mtime does not match', () => {
            const mtime = Date.now();
            cache.set('key1', 'value1', mtime);
            expect(cache.getWithTtlAndMtime('key1', 3600000, mtime + 1000)).toBeNull();
        });
    });

    describe('persistence across instances', () => {
        it('should persist data across cache instances', async () => {
            // Create first cache and store data
            const cache1 = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'persist-test',
            });
            cache1.set('key1', 'value1');
            cache1.close();
            await PersistentCache.closeAll();

            // Create second cache and verify data exists
            const cache2 = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'persist-test',
            });
            expect(cache2.get('key1')).toBe('value1');
            cache2.close();
        });
    });

    describe('complex data types', () => {
        it('should store and retrieve objects', () => {
            const objectCache = new PersistentCache<{ name: string; value: number }>({
                dbPath: testDbPath,
                dbName: 'object-test',
            });

            const obj = { name: 'test', value: 42 };
            objectCache.set('key1', obj);
            
            const retrieved = objectCache.get('key1');
            expect(retrieved).toEqual(obj);
            
            objectCache.close();
        });

        it('should store and retrieve arrays', () => {
            const arrayCache = new PersistentCache<string[]>({
                dbPath: testDbPath,
                dbName: 'array-test',
            });

            const arr = ['a', 'b', 'c'];
            arrayCache.set('key1', arr);
            
            const retrieved = arrayCache.get('key1');
            expect(retrieved).toEqual(arr);
            
            arrayCache.close();
        });
    });

    describe('statistics', () => {
        beforeEach(() => {
            cache = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'stats-test',
            });
        });

        it('should report correct stats', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');

            const stats = cache.getStats();
            expect(stats.enabled).toBe(true);
            expect(stats.dbName).toBe('stats-test');
            expect(stats.size).toBe(2);
        });

        it('should report enabled status', () => {
            expect(cache.isEnabled()).toBe(true);
        });
    });

    describe('environment stats', () => {
        beforeEach(() => {
            cache = new PersistentCache<string>({
                dbPath: testDbPath,
                dbName: 'env-test',
            });
        });

        it('should report environment statistics', () => {
            const envStats = PersistentCache.getEnvironmentStats();
            expect(envStats.isOpen).toBe(true);
            expect(envStats.databases).toContain('env-test');
        });
    });
});
