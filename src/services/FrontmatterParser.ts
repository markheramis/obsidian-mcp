/**
 * FrontmatterParser - Parses YAML frontmatter from Obsidian notes
 * 
 * This service extracts frontmatter metadata including tags, custom fields,
 * and other YAML properties from markdown files.
 */

import matter from 'gray-matter';

/** Parsed frontmatter data structure */
export interface ParsedFrontmatter {
    /** Tags extracted from frontmatter (can be array or string) */
    tags: string[];
    /** All frontmatter data as key-value pairs */
    data: Record<string, unknown>;
    /** The content without frontmatter */
    content: string;
    /** Whether the file has frontmatter */
    hasFrontmatter: boolean;
}

export class FrontmatterParser {
    /**
     * Parse frontmatter from markdown content
     * @param content Raw markdown content
     * @returns Parsed frontmatter with tags, data, and content
     */
    parse(content: string): ParsedFrontmatter {
        if (!content || typeof content !== 'string') {
            return {
                tags: [],
                data: {},
                content: content || '',
                hasFrontmatter: false,
            };
        }

        try {
            const parsed = matter(content);
            const data = parsed.data as Record<string, unknown>;
            const tags = this.extractTags(data);

            return {
                tags,
                data,
                content: parsed.content,
                hasFrontmatter: Object.keys(data).length > 0,
            };
        } catch (error) {
            // If parsing fails, return the original content with no frontmatter
            console.warn('Failed to parse frontmatter:', error);
            return {
                tags: [],
                data: {},
                content,
                hasFrontmatter: false,
            };
        }
    }

    /**
     * Extract tags from frontmatter data
     * Handles various tag formats used in Obsidian
     * @param data Parsed frontmatter data
     * @returns Array of normalized tag strings
     */
    private extractTags(data: Record<string, unknown>): string[] {
        const tags: string[] = [];

        // Handle 'tags' field (most common)
        if (data.tags) {
            if (Array.isArray(data.tags)) {
                // tags: [tag1, tag2]
                tags.push(...data.tags.map(t => this.normalizeTag(String(t))));
            } else if (typeof data.tags === 'string') {
                // tags: "tag1, tag2" or tags: tag1
                const tagList = data.tags.split(/[,\s]+/).filter(t => t.length > 0);
                tags.push(...tagList.map(t => this.normalizeTag(t)));
            }
        }

        // Handle 'tag' field (singular)
        if (data.tag) {
            if (Array.isArray(data.tag)) {
                tags.push(...data.tag.map(t => this.normalizeTag(String(t))));
            } else if (typeof data.tag === 'string') {
                tags.push(this.normalizeTag(data.tag));
            }
        }

        // Remove duplicates
        return [...new Set(tags)];
    }

    /**
     * Normalize a tag string
     * @param tag Raw tag string
     * @returns Normalized tag without leading # and trimmed
     */
    private normalizeTag(tag: string): string {
        return tag.trim().replace(/^#/, '').toLowerCase();
    }

    /**
     * Check if content matches specific tags
     * @param content Markdown content
     * @param requiredTags Tags that must be present
     * @returns True if all required tags are present
     */
    matchesTags(content: string, requiredTags: string[]): boolean {
        if (!requiredTags || requiredTags.length === 0) {
            return true;
        }

        const parsed = this.parse(content);
        const normalizedRequired = requiredTags.map(t => t.toLowerCase().replace(/^#/, ''));
        
        return normalizedRequired.every(required => 
            parsed.tags.some(tag => tag === required || tag.startsWith(required + '/'))
        );
    }

    /**
     * Check if content matches frontmatter criteria
     * @param content Markdown content
     * @param criteria Key-value pairs that must match in frontmatter
     * @returns True if all criteria are matched
     */
    matchesFrontmatter(content: string, criteria: Record<string, unknown>): boolean {
        if (!criteria || Object.keys(criteria).length === 0) {
            return true;
        }

        const parsed = this.parse(content);
        
        return Object.entries(criteria).every(([key, value]) => {
            const frontmatterValue = parsed.data[key];
            
            // Handle array values (check if value is in array)
            if (Array.isArray(frontmatterValue)) {
                return frontmatterValue.includes(value);
            }
            
            // Handle string comparison (case-insensitive)
            if (typeof frontmatterValue === 'string' && typeof value === 'string') {
                return frontmatterValue.toLowerCase() === value.toLowerCase();
            }
            
            // Direct comparison for other types
            return frontmatterValue === value;
        });
    }

    /**
     * Extract inline tags from content (tags in the body, not frontmatter)
     * @param content Markdown content (without frontmatter)
     * @returns Array of inline tags
     */
    extractInlineTags(content: string): string[] {
        if (!content) {
            return [];
        }

        // Match #tag patterns (word characters and slashes for nested tags)
        const tagPattern = /#([\w/-]+)/g;
        const matches = content.match(tagPattern);
        
        if (!matches) {
            return [];
        }

        // Normalize and deduplicate
        const tags = matches.map(m => m.slice(1).toLowerCase());
        return [...new Set(tags)];
    }

    /**
     * Get all tags from content (frontmatter + inline)
     * @param content Markdown content
     * @returns Array of all tags (deduplicated)
     */
    getAllTags(content: string): string[] {
        const parsed = this.parse(content);
        const inlineTags = this.extractInlineTags(parsed.content);
        return [...new Set([...parsed.tags, ...inlineTags])];
    }
}
