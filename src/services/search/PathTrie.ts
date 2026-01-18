/**
 * PathTrie - Trie-based path index for fast glob and prefix matching
 * 
 * This service maintains a trie (prefix tree) structure of file paths
 * for efficient operations:
 * - O(m) prefix matching where m is prefix length
 * - Fast glob pattern matching without scanning all files
 * - Efficient path existence checks
 * 
 * The trie is built from file paths split by '/' separators.
 */

import { minimatch } from 'minimatch';

/** Trie node representing a path segment */
interface TrieNode {
    /** Child nodes keyed by path segment */
    children: Map<string, TrieNode>;
    /** File paths that end at this node */
    files: Set<string>;
    /** Whether this node represents a directory (has files underneath) */
    isDirectory: boolean;
}

export class PathTrie {
    /** Root node of the trie */
    private root: TrieNode;
    
    /** Total number of files in the trie */
    private fileCount: number = 0;

    /** All file paths for fallback operations */
    private allFiles: Set<string> = new Set();

    /**
     * Creates a new PathTrie instance
     */
    constructor() {
        this.root = this.createNode();
    }

    /**
     * Create a new trie node
     * @returns Empty trie node
     */
    private createNode(): TrieNode {
        return {
            children: new Map(),
            files: new Set(),
            isDirectory: false,
        };
    }

    /**
     * Insert a file path into the trie
     * @param filePath File path to insert
     */
    insert(filePath: string): void {
        if (!filePath) return;

        const normalizedPath = this.normalizePath(filePath);
        if (this.allFiles.has(normalizedPath)) return;

        this.allFiles.add(normalizedPath);
        this.fileCount++;

        const segments = normalizedPath.split('/');
        let node = this.root;

        // Traverse/create path segments
        for (let i = 0; i < segments.length - 1; i++) {
            const segment = segments[i];
            if (!segment) continue;

            if (!node.children.has(segment)) {
                node.children.set(segment, this.createNode());
            }
            node = node.children.get(segment)!;
            node.isDirectory = true;
        }

        // Add file to the final node
        const fileName = segments[segments.length - 1];
        if (fileName) {
            if (!node.children.has(fileName)) {
                node.children.set(fileName, this.createNode());
            }
            const fileNode = node.children.get(fileName)!;
            fileNode.files.add(normalizedPath);
        }
    }

    /**
     * Remove a file path from the trie
     * @param filePath File path to remove
     */
    remove(filePath: string): void {
        const normalizedPath = this.normalizePath(filePath);
        if (!this.allFiles.has(normalizedPath)) return;

        this.allFiles.delete(normalizedPath);
        this.fileCount--;

        const segments = normalizedPath.split('/');
        const nodePath: TrieNode[] = [this.root];
        let node = this.root;

        // Traverse to the file's node
        for (const segment of segments) {
            if (!segment) continue;
            const childNode = node.children.get(segment);
            if (!childNode) return;
            nodePath.push(childNode);
            node = childNode;
        }

        // Remove file from the node
        node.files.delete(normalizedPath);

        // Clean up empty nodes from leaf to root
        for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i];
            if (!segment) continue;

            const parentNode = nodePath[i];
            const childNode = parentNode.children.get(segment);

            if (childNode && 
                childNode.children.size === 0 && 
                childNode.files.size === 0) {
                parentNode.children.delete(segment);
            }
        }
    }

    /**
     * Check if a file path exists in the trie
     * @param filePath File path to check
     * @returns True if the path exists
     */
    has(filePath: string): boolean {
        return this.allFiles.has(this.normalizePath(filePath));
    }

    /**
     * Get all files under a directory prefix
     * @param prefix Directory prefix (e.g., "notes/2024")
     * @returns Array of file paths under the prefix
     */
    matchPrefix(prefix: string): string[] {
        if (!prefix) return this.getAllFiles();

        const normalizedPrefix = this.normalizePath(prefix);
        const segments = normalizedPrefix.split('/').filter(s => s.length > 0);
        
        // Navigate to the prefix node
        let node = this.root;
        for (const segment of segments) {
            const childNode = node.children.get(segment);
            if (!childNode) return [];
            node = childNode;
        }

        // Collect all files under this node
        return this.collectFiles(node);
    }

    /**
     * Match files against a glob pattern
     * @param pattern Glob pattern (e.g., "notes/*.md", "**\/*.md")
     * @returns Array of matching file paths
     */
    matchGlob(pattern: string): string[] {
        if (!pattern) return this.getAllFiles();

        // For simple prefix patterns, use trie traversal
        const simplePrefix = this.extractSimplePrefix(pattern);
        const candidates = simplePrefix 
            ? this.matchPrefix(simplePrefix)
            : this.getAllFiles();

        // Apply full glob matching on candidates
        return candidates.filter(file => minimatch(file, pattern));
    }

    /**
     * Get all files in the trie
     * @returns Array of all file paths
     */
    getAllFiles(): string[] {
        return Array.from(this.allFiles);
    }

    /**
     * Get the number of files in the trie
     * @returns File count
     */
    size(): number {
        return this.fileCount;
    }

    /**
     * Clear the trie
     */
    clear(): void {
        this.root = this.createNode();
        this.allFiles.clear();
        this.fileCount = 0;
    }

    /**
     * Get trie statistics
     * @returns Statistics about the trie
     */
    getStats(): { 
        fileCount: number; 
        nodeCount: number;
        maxDepth: number;
        memoryEstimateBytes: number;
    } {
        const stats = { nodeCount: 0, maxDepth: 0 };
        this.traverseForStats(this.root, 0, stats);

        // Rough memory estimate: ~200 bytes per node + ~100 bytes per file
        const memoryEstimate = (stats.nodeCount * 200) + (this.fileCount * 100);

        return {
            fileCount: this.fileCount,
            nodeCount: stats.nodeCount,
            maxDepth: stats.maxDepth,
            memoryEstimateBytes: memoryEstimate,
        };
    }

    /**
     * Get directories at a specific depth
     * @param depth Depth level (0 = root children)
     * @returns Array of directory names at that depth
     */
    getDirectoriesAtDepth(depth: number): string[] {
        const directories: string[] = [];
        this.collectDirectoriesAtDepth(this.root, '', depth, 0, directories);
        return directories;
    }

    /**
     * Collect files from a node and all its descendants
     * @param node Starting node
     * @returns Array of file paths
     */
    private collectFiles(node: TrieNode): string[] {
        const files: string[] = [];
        
        const queue: TrieNode[] = [node];
        while (queue.length > 0) {
            const current = queue.shift()!;
            
            for (const file of current.files) {
                files.push(file);
            }
            
            for (const child of current.children.values()) {
                queue.push(child);
            }
        }

        return files;
    }

    /**
     * Extract simple prefix from a glob pattern
     * Returns the fixed prefix before any wildcards
     * @param pattern Glob pattern
     * @returns Simple prefix or empty string
     */
    private extractSimplePrefix(pattern: string): string {
        // Find the first segment with a wildcard
        const segments = pattern.split('/');
        const prefixSegments: string[] = [];

        for (const segment of segments) {
            if (segment.includes('*') || segment.includes('?') || segment.includes('[')) {
                break;
            }
            prefixSegments.push(segment);
        }

        return prefixSegments.join('/');
    }

    /**
     * Traverse trie and collect statistics
     * @param node Current node
     * @param depth Current depth
     * @param stats Stats object to update
     */
    private traverseForStats(
        node: TrieNode, 
        depth: number, 
        stats: { nodeCount: number; maxDepth: number }
    ): void {
        stats.nodeCount++;
        stats.maxDepth = Math.max(stats.maxDepth, depth);

        for (const child of node.children.values()) {
            this.traverseForStats(child, depth + 1, stats);
        }
    }

    /**
     * Collect directory names at a specific depth
     * @param node Current node
     * @param path Current path
     * @param targetDepth Target depth
     * @param currentDepth Current depth
     * @param result Result array
     */
    private collectDirectoriesAtDepth(
        node: TrieNode,
        path: string,
        targetDepth: number,
        currentDepth: number,
        result: string[]
    ): void {
        if (currentDepth === targetDepth) {
            for (const [name, child] of node.children) {
                if (child.isDirectory) {
                    result.push(path ? `${path}/${name}` : name);
                }
            }
            return;
        }

        for (const [name, child] of node.children) {
            const newPath = path ? `${path}/${name}` : name;
            this.collectDirectoriesAtDepth(child, newPath, targetDepth, currentDepth + 1, result);
        }
    }

    /**
     * Normalize file path
     * @param filePath Path to normalize
     * @returns Normalized path with forward slashes
     */
    private normalizePath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }
}
