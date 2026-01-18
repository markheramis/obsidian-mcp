/**
 * InvertedIndex - In-memory inverted index for fast text search
 * 
 * This service maintains a word-to-files mapping that enables O(1) lookup
 * of files containing specific terms. It's particularly useful for:
 * - Narrowing search candidates before full-text search
 * - Quick existence checks for terms across the vault
 * - Supporting boolean AND/OR queries
 * 
 * The index is optional and configurable for memory-sensitive deployments.
 */

/** Configuration options for the inverted index */
export interface InvertedIndexOptions {
    /** Minimum word length to index (default: 3) */
    minWordLength: number;
    /** Maximum number of unique words to index per file (default: 10000) */
    maxWordsPerFile: number;
    /** Words to exclude from indexing */
    stopWords: Set<string>;
}

/** Default stop words to exclude from indexing */
const DEFAULT_STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
    'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where',
    'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
]);

/** Default configuration */
const DEFAULT_OPTIONS: InvertedIndexOptions = {
    minWordLength: 3,
    maxWordsPerFile: 10000,
    stopWords: DEFAULT_STOP_WORDS,
};

export class InvertedIndex {
    /** Word to set of file paths */
    private wordToFiles: Map<string, Set<string>> = new Map();
    
    /** File path to set of indexed words (for efficient invalidation) */
    private fileToWords: Map<string, Set<string>> = new Map();
    
    /** Configuration options */
    private readonly options: InvertedIndexOptions;

    /** Whether the index is enabled */
    private enabled: boolean = true;

    /**
     * Creates a new InvertedIndex instance
     * @param options Configuration options
     */
    constructor(options?: Partial<InvertedIndexOptions>) {
        this.options = {
            minWordLength: options?.minWordLength ?? DEFAULT_OPTIONS.minWordLength,
            maxWordsPerFile: options?.maxWordsPerFile ?? DEFAULT_OPTIONS.maxWordsPerFile,
            stopWords: options?.stopWords ?? DEFAULT_OPTIONS.stopWords,
        };
    }

    /**
     * Enable or disable the index
     * @param enabled Whether to enable the index
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.clear();
        }
    }

    /**
     * Check if the index is enabled
     * @returns True if enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Index content for a file
     * @param filePath Path to the file
     * @param content File content to index
     */
    indexContent(filePath: string, content: string): void {
        if (!this.enabled || !content) return;

        const normalizedPath = this.normalizePath(filePath);
        
        // Remove existing index for this file first
        this.invalidate(filePath);

        // Extract and normalize words
        const words = this.extractWords(content);
        
        // Store the words for this file
        this.fileToWords.set(normalizedPath, words);

        // Update word-to-files mapping
        for (const word of words) {
            let files = this.wordToFiles.get(word);
            if (!files) {
                files = new Set();
                this.wordToFiles.set(word, files);
            }
            files.add(normalizedPath);
        }
    }

    /**
     * Search for files containing query terms
     * @param query Search query (space-separated terms)
     * @returns Set of file paths containing ALL query terms
     */
    search(query: string): Set<string> {
        if (!this.enabled || !query) return new Set();

        const queryWords = this.extractWords(query);
        if (queryWords.size === 0) return new Set();

        // Find files containing ALL query words (AND logic)
        let resultFiles: Set<string> | null = null;

        for (const word of queryWords) {
            const filesWithWord = this.wordToFiles.get(word);
            
            if (!filesWithWord || filesWithWord.size === 0) {
                // Word not found in any file, so no results
                return new Set();
            }

            if (resultFiles === null) {
                // First word - initialize result set
                resultFiles = new Set(filesWithWord);
            } else {
                // Intersect with existing results
                resultFiles = this.intersect(resultFiles, filesWithWord);
                if (resultFiles.size === 0) {
                    return new Set();
                }
            }
        }

        return resultFiles ?? new Set();
    }

    /**
     * Search for files containing ANY of the query terms
     * @param query Search query (space-separated terms)
     * @returns Set of file paths containing at least one query term
     */
    searchAny(query: string): Set<string> {
        if (!this.enabled || !query) return new Set();

        const queryWords = this.extractWords(query);
        if (queryWords.size === 0) return new Set();

        const resultFiles = new Set<string>();

        for (const word of queryWords) {
            const filesWithWord = this.wordToFiles.get(word);
            if (filesWithWord) {
                for (const file of filesWithWord) {
                    resultFiles.add(file);
                }
            }
        }

        return resultFiles;
    }

    /**
     * Check if a word exists in the index
     * @param word Word to check
     * @returns True if the word is indexed
     */
    hasWord(word: string): boolean {
        if (!this.enabled) return false;
        const normalized = word.toLowerCase().trim();
        return this.wordToFiles.has(normalized);
    }

    /**
     * Get files containing a specific word
     * @param word Word to search for
     * @returns Set of file paths or empty set
     */
    getFilesWithWord(word: string): Set<string> {
        if (!this.enabled) return new Set();
        const normalized = word.toLowerCase().trim();
        return new Set(this.wordToFiles.get(normalized) ?? []);
    }

    /**
     * Invalidate index for a specific file
     * @param filePath Path to the file
     */
    invalidate(filePath: string): void {
        const normalizedPath = this.normalizePath(filePath);
        
        // Get words indexed for this file
        const words = this.fileToWords.get(normalizedPath);
        if (!words) return;

        // Remove file from each word's file set
        for (const word of words) {
            const files = this.wordToFiles.get(word);
            if (files) {
                files.delete(normalizedPath);
                // Clean up empty entries
                if (files.size === 0) {
                    this.wordToFiles.delete(word);
                }
            }
        }

        // Remove file's word set
        this.fileToWords.delete(normalizedPath);
    }

    /**
     * Clear the entire index
     */
    clear(): void {
        this.wordToFiles.clear();
        this.fileToWords.clear();
    }

    /**
     * Get index statistics
     * @returns Statistics about the index
     */
    getStats(): { 
        enabled: boolean;
        uniqueWords: number; 
        indexedFiles: number; 
        totalMappings: number;
        memoryEstimateBytes: number;
    } {
        let totalMappings = 0;
        for (const files of this.wordToFiles.values()) {
            totalMappings += files.size;
        }

        // Rough memory estimate: ~100 bytes per word entry + ~50 bytes per file reference
        const memoryEstimate = (this.wordToFiles.size * 100) + (totalMappings * 50);

        return {
            enabled: this.enabled,
            uniqueWords: this.wordToFiles.size,
            indexedFiles: this.fileToWords.size,
            totalMappings,
            memoryEstimateBytes: memoryEstimate,
        };
    }

    /**
     * Check if a file is indexed
     * @param filePath Path to check
     * @returns True if the file is in the index
     */
    isFileIndexed(filePath: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        return this.fileToWords.has(normalizedPath);
    }

    /**
     * Extract and normalize words from content
     * @param content Text content
     * @returns Set of normalized words
     */
    private extractWords(content: string): Set<string> {
        const words = new Set<string>();
        
        // Split on non-word characters
        const rawWords = content.toLowerCase().split(/[\s\W]+/);
        
        let count = 0;
        for (const word of rawWords) {
            // Skip short words and stop words
            if (word.length < this.options.minWordLength) continue;
            if (this.options.stopWords.has(word)) continue;
            
            words.add(word);
            count++;
            
            // Limit words per file
            if (count >= this.options.maxWordsPerFile) break;
        }

        return words;
    }

    /**
     * Compute intersection of two sets
     * @param setA First set
     * @param setB Second set
     * @returns New set containing elements in both
     */
    private intersect<T>(setA: Set<T>, setB: Set<T>): Set<T> {
        const result = new Set<T>();
        // Iterate over smaller set for efficiency
        const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
        for (const item of smaller) {
            if (larger.has(item)) {
                result.add(item);
            }
        }
        return result;
    }

    /**
     * Normalize file path for consistent keys
     * @param filePath File path to normalize
     * @returns Normalized path
     */
    private normalizePath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }
}
