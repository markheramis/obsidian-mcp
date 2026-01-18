/**
 * MatchExtractor - Extracts matches from content with context and snippets
 * 
 * This service provides methods to find matches in content and extract
 * surrounding context, highlighted snippets, and column positions.
 */

import { Match } from '../../types/index.js';

/** Configuration for match extraction */
interface MatchExtractorConfig {
    /** Number of lines to include before and after each match (default: 2) */
    contextLines: number;
    /** Maximum length of snippet (default: 200) */
    maxSnippetLength: number;
    /** Highlight markers for snippets */
    highlightStart: string;
    highlightEnd: string;
}

/** Default configuration */
const DEFAULT_CONFIG: MatchExtractorConfig = {
    contextLines: 2,
    maxSnippetLength: 200,
    highlightStart: '**',
    highlightEnd: '**',
};

export class MatchExtractor {
    /** Configuration for match extraction */
    private readonly config: MatchExtractorConfig;

    /**
     * Creates a new MatchExtractor instance
     * @param config Optional configuration overrides
     */
    constructor(config?: Partial<MatchExtractorConfig>) {
        this.config = {
            contextLines: config?.contextLines ?? DEFAULT_CONFIG.contextLines,
            maxSnippetLength: config?.maxSnippetLength ?? DEFAULT_CONFIG.maxSnippetLength,
            highlightStart: config?.highlightStart ?? DEFAULT_CONFIG.highlightStart,
            highlightEnd: config?.highlightEnd ?? DEFAULT_CONFIG.highlightEnd,
        };
    }

    /**
     * Extract matches from content with context and snippets
     * @param content Full content to search in
     * @param query Search query string
     * @param contextLines Optional override for number of context lines
     * @returns Array of matches with context, snippets, and column positions
     */
    extractMatches(content: string, query: string, contextLines?: number): Match[] {
        if (!content || !query) {
            return [];
        }

        const effectiveContextLines = contextLines ?? this.config.contextLines;
        const lines = content.split('\n');
        const matches: Match[] = [];
        const seenLines = new Set<number>();
        
        // Compile regex once and reuse for all operations
        const queryRegex = this.createSearchRegex(query);

        lines.forEach((line, index) => {
            // Reset regex lastIndex for global regex
            queryRegex.lastIndex = 0;
            const match = queryRegex.exec(line);
            
            if (match && !seenLines.has(index)) {
                const lineNumber = index + 1; // 1-indexed
                const column = match.index;
                const context = this.extractContext(lines, index, effectiveContextLines);
                // Pass pre-compiled regex to avoid recreating it
                const snippet = this.highlightMatchWithRegex(line, queryRegex);

                matches.push({
                    line: lineNumber,
                    context,
                    snippet,
                    column,
                });
                seenLines.add(index);
            }
        });

        return matches;
    }

    /**
     * Extract surrounding context lines
     * @param lines Array of all lines
     * @param matchIndex Index of the matching line (0-indexed)
     * @param contextLines Number of lines to include before and after
     * @returns Context string with surrounding lines
     */
    extractContext(lines: string[], matchIndex: number, contextLines: number): string {
        if (lines.length === 0 || matchIndex < 0 || matchIndex >= lines.length) {
            return '';
        }

        const start = Math.max(0, matchIndex - contextLines);
        const end = Math.min(lines.length - 1, matchIndex + contextLines);
        
        const contextArray: string[] = [];
        for (let i = start; i <= end; i++) {
            const prefix = i === matchIndex ? '> ' : '  ';
            contextArray.push(`${prefix}${lines[i]}`);
        }

        return contextArray.join('\n');
    }

    /**
     * Create a snippet with the query highlighted using pre-compiled regex
     * @param line The line containing the match
     * @param queryRegex Pre-compiled regex for the search query
     * @returns Snippet with highlighted query
     */
    highlightMatchWithRegex(line: string, queryRegex: RegExp): string {
        if (!line) {
            return '';
        }

        // Reset lastIndex for global regex
        queryRegex.lastIndex = 0;
        
        const highlighted = line.replace(
            queryRegex,
            `${this.config.highlightStart}$&${this.config.highlightEnd}`
        );

        return this.truncateSnippet(highlighted);
    }

    /**
     * Create a snippet with the query highlighted (creates regex internally)
     * @param line The line containing the match
     * @param query The search query to highlight
     * @returns Snippet with highlighted query
     */
    highlightMatch(line: string, query: string): string {
        if (!line || !query) {
            return line || '';
        }

        const queryRegex = this.createSearchRegex(query);
        return this.highlightMatchWithRegex(line, queryRegex);
    }

    /**
     * Truncate snippet if too long, centering around the highlight
     * @param highlighted The highlighted string to truncate
     * @returns Truncated snippet
     */
    private truncateSnippet(highlighted: string): string {
        if (highlighted.length <= this.config.maxSnippetLength) {
            return highlighted;
        }

        // Find the first highlight position
        const highlightPos = highlighted.indexOf(this.config.highlightStart);
        if (highlightPos > 0) {
            // Center the snippet around the highlight
            const halfLength = Math.floor(this.config.maxSnippetLength / 2);
            const start = Math.max(0, highlightPos - halfLength);
            const end = Math.min(highlighted.length, start + this.config.maxSnippetLength);
            
            let truncated = highlighted.slice(start, end);
            if (start > 0) {
                truncated = '...' + truncated;
            }
            if (end < highlighted.length) {
                truncated = truncated + '...';
            }
            return truncated;
        }
        
        return highlighted.slice(0, this.config.maxSnippetLength) + '...';
    }

    /**
     * Find the column position of the first match in a line
     * @param line The line to search
     * @param query The search query
     * @returns Column position (0-indexed) or -1 if not found
     */
    findColumnPosition(line: string, query: string): number {
        if (!line || !query) {
            return -1;
        }

        const queryRegex = this.createSearchRegex(query);
        const match = queryRegex.exec(line);
        return match ? match.index : -1;
    }

    /**
     * Create a case-insensitive regex for the query
     * @param query Search query
     * @returns RegExp for matching
     */
    private createSearchRegex(query: string): RegExp {
        // Escape special regex characters
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, 'gi');
    }

    /**
     * Get the current configuration
     * @returns Copy of the configuration
     */
    getConfig(): MatchExtractorConfig {
        return { ...this.config };
    }
}
