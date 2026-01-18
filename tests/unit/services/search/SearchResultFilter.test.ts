import { SearchResultFilter } from '../../../../src/services/search/SearchResultFilter';
import { SearchResult } from '../../../../src/types/index';

describe('SearchResultFilter', () => {
    let filter: SearchResultFilter;

    beforeEach(() => {
        filter = new SearchResultFilter();
    });

    const createResult = (path: string, score: number): SearchResult => ({
        path,
        score,
        matches: [{ line: 1 }],
    });

    const createResults = (count: number, scoreMultiplier: number = 0.1): SearchResult[] => {
        return Array.from({ length: count }, (_, i) => 
            createResult(`file${i}.md`, (i + 1) * scoreMultiplier)
        );
    };

    describe('constructor', () => {
        it('should create filter with default high-quality threshold of 0.7', () => {
            expect(filter.getHighQualityThreshold()).toBe(0.7);
        });

        it('should create filter with custom high-quality threshold', () => {
            const customFilter = new SearchResultFilter(0.8);
            expect(customFilter.getHighQualityThreshold()).toBe(0.8);
        });
    });

    describe('filterByMinScore', () => {
        it('should return all results when minScore is 0', () => {
            const results = createResults(5);
            const filtered = filter.filterByMinScore(results, 0);
            expect(filtered).toHaveLength(5);
        });

        it('should return all results when minScore is negative', () => {
            const results = createResults(5);
            const filtered = filter.filterByMinScore(results, -1);
            expect(filtered).toHaveLength(5);
        });

        it('should return empty array when minScore is greater than 1', () => {
            const results = createResults(5);
            const filtered = filter.filterByMinScore(results, 1.5);
            expect(filtered).toHaveLength(0);
        });

        it('should filter results below minScore', () => {
            const results = [
                createResult('low.md', 0.2),
                createResult('medium.md', 0.5),
                createResult('high.md', 0.8),
            ];
            const filtered = filter.filterByMinScore(results, 0.5);
            expect(filtered).toHaveLength(2);
            expect(filtered.map(r => r.path)).toEqual(['medium.md', 'high.md']);
        });

        it('should include results with exactly minScore', () => {
            const results = [createResult('exact.md', 0.5)];
            const filtered = filter.filterByMinScore(results, 0.5);
            expect(filtered).toHaveLength(1);
        });
    });

    describe('applyLimit', () => {
        it('should return empty array when limit is 0', () => {
            const results = createResults(5);
            const limited = filter.applyLimit(results, 0);
            expect(limited).toHaveLength(0);
        });

        it('should return empty array when limit is negative', () => {
            const results = createResults(5);
            const limited = filter.applyLimit(results, -1);
            expect(limited).toHaveLength(0);
        });

        it('should return first N results when limit is less than total', () => {
            const results = createResults(10);
            const limited = filter.applyLimit(results, 5);
            expect(limited).toHaveLength(5);
            expect(limited[0].path).toBe('file0.md');
            expect(limited[4].path).toBe('file4.md');
        });

        it('should return all results when limit exceeds total', () => {
            const results = createResults(3);
            const limited = filter.applyLimit(results, 10);
            expect(limited).toHaveLength(3);
        });
    });

    describe('applyPagination', () => {
        it('should return correct page with offset and limit', () => {
            const results = createResults(10);
            const paginated = filter.applyPagination(results, 3, 3);
            expect(paginated).toHaveLength(3);
            expect(paginated[0].path).toBe('file3.md');
            expect(paginated[2].path).toBe('file5.md');
        });

        it('should return empty array when offset exceeds total', () => {
            const results = createResults(5);
            const paginated = filter.applyPagination(results, 3, 10);
            expect(paginated).toHaveLength(0);
        });

        it('should handle negative offset as 0', () => {
            const results = createResults(5);
            const paginated = filter.applyPagination(results, 3, -5);
            expect(paginated).toHaveLength(3);
            expect(paginated[0].path).toBe('file0.md');
        });

        it('should return remaining results when offset + limit exceeds total', () => {
            const results = createResults(5);
            const paginated = filter.applyPagination(results, 3, 3);
            expect(paginated).toHaveLength(2);
            expect(paginated[0].path).toBe('file3.md');
            expect(paginated[1].path).toBe('file4.md');
        });

        it('should default offset to 0 when not provided', () => {
            const results = createResults(5);
            const paginated = filter.applyPagination(results, 3);
            expect(paginated).toHaveLength(3);
            expect(paginated[0].path).toBe('file0.md');
        });
    });

    describe('shouldStopEarly', () => {
        it('should return false when limit is 0', () => {
            const results = createResults(10, 0.1);
            expect(filter.shouldStopEarly(results, 0)).toBe(false);
        });

        it('should return false when limit is negative', () => {
            const results = createResults(10, 0.1);
            expect(filter.shouldStopEarly(results, -1)).toBe(false);
        });

        it('should return false when not enough high-quality results', () => {
            const results = [
                createResult('low1.md', 0.3),
                createResult('low2.md', 0.4),
                createResult('high1.md', 0.8),
            ];
            expect(filter.shouldStopEarly(results, 2)).toBe(false);
        });

        it('should return false when not enough total results', () => {
            const results = [
                createResult('high1.md', 0.8),
                createResult('high2.md', 0.9),
            ];
            expect(filter.shouldStopEarly(results, 2)).toBe(false);
        });

        it('should return true when enough high-quality and total results', () => {
            const results = [
                createResult('high1.md', 0.8),
                createResult('high2.md', 0.9),
                createResult('low1.md', 0.3),
                createResult('low2.md', 0.4),
            ];
            expect(filter.shouldStopEarly(results, 2)).toBe(true);
        });

        it('should use custom threshold when provided', () => {
            const results = [
                createResult('medium1.md', 0.5),
                createResult('medium2.md', 0.6),
                createResult('low1.md', 0.3),
                createResult('low2.md', 0.4),
            ];
            // With default threshold (0.7), should return false
            expect(filter.shouldStopEarly(results, 2)).toBe(false);
            // With custom threshold (0.5), should return true
            expect(filter.shouldStopEarly(results, 2, 0.5)).toBe(true);
        });
    });

    describe('countHighQualityResults', () => {
        it('should count results with score >= threshold', () => {
            const results = [
                createResult('low.md', 0.3),
                createResult('medium.md', 0.5),
                createResult('high1.md', 0.7),
                createResult('high2.md', 0.9),
            ];
            expect(filter.countHighQualityResults(results)).toBe(2);
        });

        it('should use custom threshold when provided', () => {
            const results = [
                createResult('low.md', 0.3),
                createResult('medium.md', 0.5),
                createResult('high.md', 0.8),
            ];
            expect(filter.countHighQualityResults(results, 0.5)).toBe(2);
        });

        it('should return 0 for empty results', () => {
            expect(filter.countHighQualityResults([])).toBe(0);
        });
    });

    describe('sortByScore', () => {
        it('should sort results by score in descending order', () => {
            const results = [
                createResult('low.md', 0.3),
                createResult('high.md', 0.9),
                createResult('medium.md', 0.5),
            ];
            const sorted = filter.sortByScore(results);
            expect(sorted[0].path).toBe('high.md');
            expect(sorted[1].path).toBe('medium.md');
            expect(sorted[2].path).toBe('low.md');
        });

        it('should not mutate original array', () => {
            const results = [
                createResult('low.md', 0.3),
                createResult('high.md', 0.9),
            ];
            filter.sortByScore(results);
            expect(results[0].path).toBe('low.md');
        });

        it('should handle empty array', () => {
            const sorted = filter.sortByScore([]);
            expect(sorted).toHaveLength(0);
        });
    });

    describe('processResults', () => {
        it('should apply all filters in correct order', () => {
            const results = [
                createResult('low.md', 0.2),
                createResult('medium1.md', 0.5),
                createResult('medium2.md', 0.6),
                createResult('high1.md', 0.8),
                createResult('high2.md', 0.9),
            ];
            
            const processed = filter.processResults(results, {
                minScore: 0.5,
                limit: 2,
                offset: 1,
            });
            
            // After minScore filter: medium1, medium2, high1, high2
            // After sort: high2, high1, medium2, medium1
            // After pagination (offset=1, limit=2): high1, medium2
            expect(processed).toHaveLength(2);
            expect(processed[0].path).toBe('high1.md');
            expect(processed[1].path).toBe('medium2.md');
        });

        it('should handle empty options', () => {
            const results = [
                createResult('low.md', 0.3),
                createResult('high.md', 0.9),
            ];
            const processed = filter.processResults(results, {});
            expect(processed).toHaveLength(2);
            expect(processed[0].path).toBe('high.md'); // Should still sort
        });

        it('should handle undefined minScore', () => {
            const results = createResults(5);
            const processed = filter.processResults(results, { limit: 3 });
            expect(processed).toHaveLength(3);
        });

        it('should handle undefined limit', () => {
            const results = createResults(5);
            const processed = filter.processResults(results, { minScore: 0.1 });
            expect(processed).toHaveLength(5);
        });
    });
});
