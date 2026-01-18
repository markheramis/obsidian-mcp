/**
 * SearchScorer - Calculates relevance scores for search results using TF-IDF-inspired algorithm
 * 
 * This service provides a sophisticated scoring algorithm that considers:
 * - Term Frequency (TF): How often the search term appears
 * - Position Bonus: Higher scores for matches near the beginning of the file
 * - Density Bonus: Higher scores for more matches in shorter files
 */

import { Match } from '../../types/index.js';

/** Configuration for scoring weights */
interface ScoringWeights {
    termFrequency: number;
    position: number;
    density: number;
}

/** Default scoring weights */
const DEFAULT_WEIGHTS: ScoringWeights = {
    termFrequency: 0.4,
    position: 0.3,
    density: 0.3,
};

export class SearchScorer {
    /** Weights for different scoring factors */
    private readonly weights: ScoringWeights;

    /**
     * Creates a new SearchScorer instance
     * @param weights Optional custom weights for scoring factors (must sum to 1.0)
     */
    constructor(weights?: Partial<ScoringWeights>) {
        this.weights = {
            termFrequency: weights?.termFrequency ?? DEFAULT_WEIGHTS.termFrequency,
            position: weights?.position ?? DEFAULT_WEIGHTS.position,
            density: weights?.density ?? DEFAULT_WEIGHTS.density,
        };
    }

    /**
     * Calculate relevance score for a search result
     * @param matches Array of matches found in the content
     * @param content Full content of the file
     * @param query Search query string
     * @returns Score between 0 and 1
     */
    calculateScore(matches: Match[], content: string, query: string): number {
        if (matches.length === 0 || !content || !query) {
            return 0;
        }

        // Calculate totalLines once and pass to dependent functions
        const totalLines = content.split('\n').length;

        const tfScore = this.calculateTermFrequency(content, query);
        const positionScore = this.calculatePositionBonus(matches, totalLines);
        const densityScore = this.calculateDensityBonus(matches, totalLines);

        // Combine scores using configured weights
        const combinedScore = 
            (tfScore * this.weights.termFrequency) +
            (positionScore * this.weights.position) +
            (densityScore * this.weights.density);

        // Ensure score is between 0 and 1
        return Math.min(1, Math.max(0, combinedScore));
    }

    /**
     * Calculate Term Frequency score
     * TF = (number of times term appears) / (total number of words)
     * @param content Full content of the file
     * @param query Search query string
     * @returns Normalized TF score between 0 and 1
     */
    calculateTermFrequency(content: string, query: string): number {
        if (!content || !query) {
            return 0;
        }

        const contentLower = content.toLowerCase();
        const queryLower = query.toLowerCase();
        
        // Count occurrences of the query in content
        const termCount = this.countOccurrences(contentLower, queryLower);
        
        // Count total words in content
        const totalWords = this.countWords(content);
        
        if (totalWords === 0) {
            return 0;
        }

        // Calculate raw TF
        const rawTf = termCount / totalWords;
        
        // Normalize TF to 0-1 range using logarithmic scaling
        // This prevents very long documents from having extremely low scores
        const normalizedTf = Math.min(1, Math.log1p(rawTf * 100) / Math.log1p(100));
        
        return normalizedTf;
    }

    /**
     * Calculate position bonus score
     * Higher scores for matches near the beginning of the file
     * @param matches Array of matches with line numbers
     * @param totalLines Total number of lines in the content
     * @returns Position bonus score between 0 and 1
     */
    calculatePositionBonus(matches: Match[], totalLines: number): number {
        if (matches.length === 0 || totalLines === 0) {
            return 0;
        }

        // Get the earliest match position
        const firstMatchLine = Math.min(...matches.map(m => m.line));
        
        // Calculate position ratio (0 = beginning, 1 = end)
        const positionRatio = (firstMatchLine - 1) / totalLines;
        
        // Invert so that earlier positions get higher scores
        // Use exponential decay for smoother scoring
        const positionBonus = Math.exp(-positionRatio * 3);
        
        return positionBonus;
    }

    /**
     * Calculate density bonus score
     * Higher scores for more matches in shorter files
     * @param matches Array of matches
     * @param totalLines Total number of lines in the content
     * @returns Density bonus score between 0 and 1
     */
    calculateDensityBonus(matches: Match[], totalLines: number): number {
        if (matches.length === 0 || totalLines === 0) {
            return 0;
        }

        // Calculate match density (matches per 100 lines)
        const density = (matches.length / totalLines) * 100;
        
        // Normalize density to 0-1 range using logarithmic scaling
        // Cap at a reasonable maximum to prevent extreme scores
        const normalizedDensity = Math.min(1, Math.log1p(density) / Math.log1p(50));
        
        return normalizedDensity;
    }

    /**
     * Count occurrences of a substring in a string
     * @param text Text to search in
     * @param searchTerm Term to search for
     * @returns Number of occurrences
     */
    private countOccurrences(text: string, searchTerm: string): number {
        if (!text || !searchTerm) {
            return 0;
        }

        let count = 0;
        let position = 0;
        
        while ((position = text.indexOf(searchTerm, position)) !== -1) {
            count++;
            position += searchTerm.length;
        }
        
        return count;
    }

    /**
     * Count words in a string
     * @param text Text to count words in
     * @returns Number of words
     */
    private countWords(text: string): number {
        if (!text) {
            return 0;
        }
        
        // Split by whitespace and filter out empty strings
        const words = text.split(/\s+/).filter(word => word.length > 0);
        return words.length;
    }

    /**
     * Get the current scoring weights
     * @returns Copy of the scoring weights
     */
    getWeights(): ScoringWeights {
        return { ...this.weights };
    }
}
