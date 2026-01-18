/**
 * Unit tests for InvertedIndex service
 */

import { InvertedIndex } from '../../../../src/services/search/InvertedIndex.js';

describe('InvertedIndex', () => {
    let index: InvertedIndex;

    beforeEach(() => {
        index = new InvertedIndex();
    });

    describe('indexContent', () => {
        it('should index words from content', () => {
            index.indexContent('test.md', 'Hello world this is a test document');
            
            const stats = index.getStats();
            expect(stats.indexedFiles).toBe(1);
            expect(stats.uniqueWords).toBeGreaterThan(0);
        });

        it('should skip short words based on minWordLength', () => {
            index = new InvertedIndex({ minWordLength: 4 });
            index.indexContent('test.md', 'the cat sat on mat');
            
            // "the", "cat", "sat", "mat" are 3 chars, should be skipped
            // Only words >= 4 chars should be indexed
            expect(index.hasWord('the')).toBe(false);
            expect(index.hasWord('cat')).toBe(false);
        });

        it('should skip stop words', () => {
            index.indexContent('test.md', 'the quick brown fox and the lazy dog');
            
            expect(index.hasWord('the')).toBe(false);
            expect(index.hasWord('and')).toBe(false);
            expect(index.hasWord('quick')).toBe(true);
            expect(index.hasWord('brown')).toBe(true);
        });

        it('should handle empty content', () => {
            index.indexContent('test.md', '');
            
            const stats = index.getStats();
            expect(stats.indexedFiles).toBe(0);
        });
    });

    describe('search', () => {
        beforeEach(() => {
            index.indexContent('doc1.md', 'JavaScript programming language');
            index.indexContent('doc2.md', 'TypeScript programming language');
            index.indexContent('doc3.md', 'Python scripting language');
        });

        it('should find files containing all query terms (AND logic)', () => {
            const results = index.search('programming language');
            
            expect(results.size).toBe(2);
            expect(results.has('doc1.md')).toBe(true);
            expect(results.has('doc2.md')).toBe(true);
            expect(results.has('doc3.md')).toBe(false);
        });

        it('should return empty set when no matches', () => {
            const results = index.search('rust');
            
            expect(results.size).toBe(0);
        });

        it('should handle single word queries', () => {
            const results = index.search('language');
            
            expect(results.size).toBe(3);
        });
    });

    describe('searchAny', () => {
        beforeEach(() => {
            index.indexContent('doc1.md', 'JavaScript programming');
            index.indexContent('doc2.md', 'TypeScript scripting');
            index.indexContent('doc3.md', 'Python coding');
        });

        it('should find files containing ANY query terms (OR logic)', () => {
            const results = index.searchAny('programming scripting');
            
            expect(results.size).toBe(2);
            expect(results.has('doc1.md')).toBe(true);
            expect(results.has('doc2.md')).toBe(true);
        });
    });

    describe('invalidate', () => {
        it('should remove file from index', () => {
            index.indexContent('doc1.md', 'JavaScript programming');
            index.indexContent('doc2.md', 'TypeScript programming');
            
            expect(index.isFileIndexed('doc1.md')).toBe(true);
            
            index.invalidate('doc1.md');
            
            expect(index.isFileIndexed('doc1.md')).toBe(false);
            expect(index.isFileIndexed('doc2.md')).toBe(true);
        });

        it('should update search results after invalidation', () => {
            index.indexContent('doc1.md', 'unique word specialterm');
            
            let results = index.search('specialterm');
            expect(results.size).toBe(1);
            
            index.invalidate('doc1.md');
            
            results = index.search('specialterm');
            expect(results.size).toBe(0);
        });
    });

    describe('clear', () => {
        it('should remove all entries from index', () => {
            index.indexContent('doc1.md', 'JavaScript');
            index.indexContent('doc2.md', 'TypeScript');
            
            expect(index.getStats().indexedFiles).toBe(2);
            
            index.clear();
            
            expect(index.getStats().indexedFiles).toBe(0);
            expect(index.getStats().uniqueWords).toBe(0);
        });
    });

    describe('setEnabled', () => {
        it('should not index when disabled', () => {
            index.setEnabled(false);
            index.indexContent('test.md', 'Hello world');
            
            expect(index.getStats().indexedFiles).toBe(0);
        });

        it('should clear index when disabled', () => {
            index.indexContent('test.md', 'Hello world');
            expect(index.getStats().indexedFiles).toBe(1);
            
            index.setEnabled(false);
            
            expect(index.getStats().indexedFiles).toBe(0);
        });

        it('should allow indexing after re-enabling', () => {
            index.setEnabled(false);
            index.setEnabled(true);
            index.indexContent('test.md', 'Hello world');
            
            expect(index.getStats().indexedFiles).toBe(1);
        });
    });

    describe('getStats', () => {
        it('should return accurate statistics', () => {
            index.indexContent('doc1.md', 'word1 word2 word3');
            index.indexContent('doc2.md', 'word1 word4');
            
            const stats = index.getStats();
            
            expect(stats.enabled).toBe(true);
            expect(stats.indexedFiles).toBe(2);
            expect(stats.uniqueWords).toBe(4);
            expect(stats.totalMappings).toBe(5); // word1 -> 2 files, word2-4 -> 1 file each
            expect(stats.memoryEstimateBytes).toBeGreaterThan(0);
        });
    });
});
