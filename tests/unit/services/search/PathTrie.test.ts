/**
 * Unit tests for PathTrie service
 */

import { PathTrie } from '../../../../src/services/search/PathTrie.js';

describe('PathTrie', () => {
    let trie: PathTrie;

    beforeEach(() => {
        trie = new PathTrie();
    });

    describe('insert', () => {
        it('should insert file paths', () => {
            trie.insert('notes/meeting.md');
            trie.insert('notes/ideas.md');
            
            expect(trie.size()).toBe(2);
        });

        it('should handle nested paths', () => {
            trie.insert('projects/2024/january/report.md');
            
            expect(trie.has('projects/2024/january/report.md')).toBe(true);
        });

        it('should handle duplicate inserts', () => {
            trie.insert('test.md');
            trie.insert('test.md');
            
            expect(trie.size()).toBe(1);
        });

        it('should normalize Windows paths', () => {
            trie.insert('notes\\meeting.md');
            
            expect(trie.has('notes/meeting.md')).toBe(true);
        });
    });

    describe('remove', () => {
        beforeEach(() => {
            trie.insert('notes/meeting.md');
            trie.insert('notes/ideas.md');
            trie.insert('projects/report.md');
        });

        it('should remove file path', () => {
            expect(trie.has('notes/meeting.md')).toBe(true);
            
            trie.remove('notes/meeting.md');
            
            expect(trie.has('notes/meeting.md')).toBe(false);
            expect(trie.size()).toBe(2);
        });

        it('should handle removing non-existent path', () => {
            trie.remove('nonexistent.md');
            
            expect(trie.size()).toBe(3);
        });
    });

    describe('has', () => {
        it('should return true for existing paths', () => {
            trie.insert('test.md');
            
            expect(trie.has('test.md')).toBe(true);
        });

        it('should return false for non-existing paths', () => {
            expect(trie.has('nonexistent.md')).toBe(false);
        });
    });

    describe('matchPrefix', () => {
        beforeEach(() => {
            trie.insert('notes/meeting.md');
            trie.insert('notes/ideas.md');
            trie.insert('notes/archive/old.md');
            trie.insert('projects/report.md');
        });

        it('should return all files under a prefix', () => {
            const matches = trie.matchPrefix('notes');
            
            expect(matches.length).toBe(3);
            expect(matches).toContain('notes/meeting.md');
            expect(matches).toContain('notes/ideas.md');
            expect(matches).toContain('notes/archive/old.md');
        });

        it('should return nested files', () => {
            const matches = trie.matchPrefix('notes/archive');
            
            expect(matches.length).toBe(1);
            expect(matches).toContain('notes/archive/old.md');
        });

        it('should return all files for empty prefix', () => {
            const matches = trie.matchPrefix('');
            
            expect(matches.length).toBe(4);
        });

        it('should return empty array for non-matching prefix', () => {
            const matches = trie.matchPrefix('nonexistent');
            
            expect(matches.length).toBe(0);
        });
    });

    describe('matchGlob', () => {
        beforeEach(() => {
            trie.insert('notes/meeting.md');
            trie.insert('notes/ideas.md');
            trie.insert('notes/archive/old.md');
            trie.insert('projects/report.md');
            trie.insert('readme.txt');
        });

        it('should match simple glob patterns', () => {
            const matches = trie.matchGlob('notes/*.md');
            
            expect(matches.length).toBe(2);
            expect(matches).toContain('notes/meeting.md');
            expect(matches).toContain('notes/ideas.md');
        });

        it('should match recursive glob patterns', () => {
            const matches = trie.matchGlob('**/*.md');
            
            expect(matches.length).toBe(4);
        });

        it('should match extension patterns', () => {
            const matches = trie.matchGlob('*.txt');
            
            expect(matches.length).toBe(1);
            expect(matches).toContain('readme.txt');
        });

        it('should return all files for empty pattern', () => {
            const matches = trie.matchGlob('');
            
            expect(matches.length).toBe(5);
        });
    });

    describe('getAllFiles', () => {
        it('should return all files', () => {
            trie.insert('a.md');
            trie.insert('b.md');
            trie.insert('c.md');
            
            const files = trie.getAllFiles();
            
            expect(files.length).toBe(3);
            expect(files).toContain('a.md');
            expect(files).toContain('b.md');
            expect(files).toContain('c.md');
        });

        it('should return empty array for empty trie', () => {
            const files = trie.getAllFiles();
            
            expect(files.length).toBe(0);
        });
    });

    describe('clear', () => {
        it('should remove all entries', () => {
            trie.insert('a.md');
            trie.insert('b.md');
            
            expect(trie.size()).toBe(2);
            
            trie.clear();
            
            expect(trie.size()).toBe(0);
            expect(trie.getAllFiles().length).toBe(0);
        });
    });

    describe('getStats', () => {
        it('should return accurate statistics', () => {
            trie.insert('a/b/c/d.md');
            trie.insert('a/b/e.md');
            
            const stats = trie.getStats();
            
            expect(stats.fileCount).toBe(2);
            expect(stats.nodeCount).toBeGreaterThan(0);
            expect(stats.maxDepth).toBeGreaterThanOrEqual(4);
            expect(stats.memoryEstimateBytes).toBeGreaterThan(0);
        });
    });

    describe('getDirectoriesAtDepth', () => {
        beforeEach(() => {
            trie.insert('notes/meeting.md');
            trie.insert('notes/ideas.md');
            trie.insert('projects/2024/report.md');
            trie.insert('archive/old.md');
        });

        it('should return directories at depth 0', () => {
            const dirs = trie.getDirectoriesAtDepth(0);
            
            expect(dirs.length).toBe(3);
            expect(dirs).toContain('notes');
            expect(dirs).toContain('projects');
            expect(dirs).toContain('archive');
        });

        it('should return directories at depth 1', () => {
            const dirs = trie.getDirectoriesAtDepth(1);
            
            expect(dirs).toContain('projects/2024');
        });
    });
});
