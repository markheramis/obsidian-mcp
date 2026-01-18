/**
 * SearchResultFilter - Handles filtering, limiting, and pagination of search results
 * 
 * This service provides methods to filter search results by score,
 * apply limits, handle pagination, and determine when to stop searching early.
 */

import { SearchResult } from '../../types/index.js';

export class SearchResultFilter {
    /** Default high-quality score threshold for early termination */
    private readonly highQualityThreshold: number;

    /**
     * Creates a new SearchResultFilter instance
     * @param highQualityThreshold Score threshold for high-quality results (default: 0.7)
     */
    constructor(highQualityThreshold: number = 0.7) {
        this.highQualityThreshold = highQualityThreshold;
    }

    /**
     * Filter results by minimum score
     * @param results Array of search results
     * @param minScore Minimum score threshold (0 to 1)
     * @returns Filtered array containing only results with score >= minScore
     */
    filterByMinScore(results: SearchResult[], minScore: number): SearchResult[] {
        if (minScore <= 0) {
            return results;
        }

        if (minScore > 1) {
            return []; // No result can have score > 1
        }

        return results.filter(result => result.score >= minScore);
    }

    /**
     * Apply limit to results (returns first N results)
     * @param results Array of search results
     * @param limit Maximum number of results to return
     * @returns Array containing at most 'limit' results
     */
    applyLimit(results: SearchResult[], limit: number): SearchResult[] {
        if (limit <= 0) {
            return [];
        }

        return results.slice(0, limit);
    }

    /**
     * Apply pagination to results
     * @param results Array of search results
     * @param limit Maximum number of results per page
     * @param offset Number of results to skip
     * @returns Paginated array of results
     */
    applyPagination(results: SearchResult[], limit: number, offset: number = 0): SearchResult[] {
        if (limit <= 0) {
            return [];
        }

        if (offset < 0) {
            offset = 0;
        }

        return results.slice(offset, offset + limit);
    }

    /**
     * Determine if search should stop early based on current results
     * 
     * Early termination conditions:
     * - At least 'limit' high-quality results (score >= threshold) found
     * - Total results collected >= limit * 2 (buffer for sorting)
     * 
     * @param results Current array of search results
     * @param limit Target number of results
     * @param customThreshold Optional custom high-quality threshold (overrides instance default)
     * @returns True if search should stop early
     */
    shouldStopEarly(
        results: SearchResult[],
        limit: number,
        customThreshold?: number
    ): boolean {
        if (limit <= 0) {
            return false; // No limit means don't stop early
        }

        const threshold = customThreshold ?? this.highQualityThreshold;
        const highQualityCount = this.countHighQualityResults(results, threshold);
        const totalCount = results.length;

        // Stop if we have enough high-quality results AND sufficient total results
        return highQualityCount >= limit && totalCount >= limit * 2;
    }

    /**
     * Count results with score >= threshold
     * @param results Array of search results
     * @param threshold Score threshold (default: instance's highQualityThreshold)
     * @returns Number of high-quality results
     */
    countHighQualityResults(results: SearchResult[], threshold?: number): number {
        const effectiveThreshold = threshold ?? this.highQualityThreshold;
        return results.filter(result => result.score >= effectiveThreshold).length;
    }

    /**
     * Sort results by score in descending order
     * @param results Array of search results
     * @returns New sorted array (does not mutate original)
     */
    sortByScore(results: SearchResult[]): SearchResult[] {
        return [...results].sort((a, b) => b.score - a.score);
    }

    /**
     * Apply all filters and return processed results
     * 
     * Processing order:
     * 1. Filter by minimum score
     * 2. Sort by score (descending)
     * 3. Apply pagination (offset + limit)
     * 
     * @param results Array of search results
     * @param options Filtering options
     * @returns Processed array of search results
     */
    processResults(
        results: SearchResult[],
        options: {
            minScore?: number;
            limit?: number;
            offset?: number;
        }
    ): SearchResult[] {
        let processed = results;

        // Step 1: Filter by minimum score
        if (options.minScore !== undefined && options.minScore > 0) {
            processed = this.filterByMinScore(processed, options.minScore);
        }

        // Step 2: Sort by score
        processed = this.sortByScore(processed);

        // Step 3: Apply pagination
        if (options.limit !== undefined && options.limit > 0) {
            const offset = options.offset ?? 0;
            processed = this.applyPagination(processed, options.limit, offset);
        }

        return processed;
    }

    /**
     * Get the high-quality threshold value
     * @returns High-quality score threshold
     */
    getHighQualityThreshold(): number {
        return this.highQualityThreshold;
    }
}
