import { MatchExtractor } from '../../../../src/services/search/MatchExtractor';

describe('MatchExtractor', () => {
    let extractor: MatchExtractor;

    beforeEach(() => {
        extractor = new MatchExtractor();
    });

    describe('constructor', () => {
        it('should create extractor with default config', () => {
            const config = extractor.getConfig();
            expect(config.contextLines).toBe(2);
            expect(config.maxSnippetLength).toBe(200);
            expect(config.highlightStart).toBe('**');
            expect(config.highlightEnd).toBe('**');
        });

        it('should create extractor with custom config', () => {
            const customExtractor = new MatchExtractor({
                contextLines: 3,
                maxSnippetLength: 100,
                highlightStart: '<mark>',
                highlightEnd: '</mark>',
            });
            const config = customExtractor.getConfig();
            expect(config.contextLines).toBe(3);
            expect(config.maxSnippetLength).toBe(100);
            expect(config.highlightStart).toBe('<mark>');
            expect(config.highlightEnd).toBe('</mark>');
        });

        it('should use default values for missing custom config', () => {
            const customExtractor = new MatchExtractor({ contextLines: 5 });
            const config = customExtractor.getConfig();
            expect(config.contextLines).toBe(5);
            expect(config.maxSnippetLength).toBe(200);
        });
    });

    describe('extractMatches', () => {
        it('should return empty array for empty content', () => {
            const matches = extractor.extractMatches('', 'query');
            expect(matches).toHaveLength(0);
        });

        it('should return empty array for empty query', () => {
            const matches = extractor.extractMatches('content', '');
            expect(matches).toHaveLength(0);
        });

        it('should find matches with line numbers', () => {
            const content = 'line 1\nline with query\nline 3';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches).toHaveLength(1);
            expect(matches[0].line).toBe(2);
        });

        it('should include context around matches', () => {
            const content = 'line 1\nline 2\nline with query\nline 4\nline 5';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches[0].context).toContain('line 2');
            expect(matches[0].context).toContain('line with query');
            expect(matches[0].context).toContain('line 4');
        });

        it('should include highlighted snippet', () => {
            const content = 'line with query here';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches[0].snippet).toContain('**query**');
        });

        it('should include column position', () => {
            const content = 'prefix query suffix';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches[0].column).toBe(7); // 'prefix ' is 7 chars
        });

        it('should find multiple matches', () => {
            const content = 'query on line 1\nno match\nquery on line 3';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches).toHaveLength(2);
            expect(matches[0].line).toBe(1);
            expect(matches[1].line).toBe(3);
        });

        it('should be case-insensitive', () => {
            const content = 'QUERY here\nQuery there\nquery everywhere';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches).toHaveLength(3);
        });

        it('should only match once per line', () => {
            const content = 'query query query';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches).toHaveLength(1);
        });

        it('should respect custom context lines', () => {
            const content = 'line 1\nline 2\nline 3\nline with query\nline 5\nline 6\nline 7';
            const matches = extractor.extractMatches(content, 'query', 1);
            expect(matches[0].context).not.toContain('line 2');
            expect(matches[0].context).toContain('line 3');
            expect(matches[0].context).toContain('line with query');
            expect(matches[0].context).toContain('line 5');
            expect(matches[0].context).not.toContain('line 6');
        });
    });

    describe('extractContext', () => {
        const lines = ['line 0', 'line 1', 'line 2', 'line 3', 'line 4'];

        it('should return empty string for empty lines', () => {
            const context = extractor.extractContext([], 0, 2);
            expect(context).toBe('');
        });

        it('should return empty string for invalid index', () => {
            expect(extractor.extractContext(lines, -1, 2)).toBe('');
            expect(extractor.extractContext(lines, 10, 2)).toBe('');
        });

        it('should extract context around match', () => {
            const context = extractor.extractContext(lines, 2, 1);
            expect(context).toContain('line 1');
            expect(context).toContain('line 2');
            expect(context).toContain('line 3');
        });

        it('should mark the matching line', () => {
            const context = extractor.extractContext(lines, 2, 1);
            expect(context).toContain('> line 2');
        });

        it('should handle match at beginning of file', () => {
            const context = extractor.extractContext(lines, 0, 2);
            expect(context).toContain('> line 0');
            expect(context).toContain('line 1');
            expect(context).toContain('line 2');
            expect(context).not.toContain('line 3');
        });

        it('should handle match at end of file', () => {
            const context = extractor.extractContext(lines, 4, 2);
            expect(context).toContain('line 2');
            expect(context).toContain('line 3');
            expect(context).toContain('> line 4');
        });
    });

    describe('highlightMatch', () => {
        it('should return empty string for empty line', () => {
            const snippet = extractor.highlightMatch('', 'query');
            expect(snippet).toBe('');
        });

        it('should return original line for empty query', () => {
            const snippet = extractor.highlightMatch('some content', '');
            expect(snippet).toBe('some content');
        });

        it('should highlight the query', () => {
            const snippet = extractor.highlightMatch('text with query here', 'query');
            expect(snippet).toBe('text with **query** here');
        });

        it('should highlight all occurrences', () => {
            const snippet = extractor.highlightMatch('query and query', 'query');
            expect(snippet).toBe('**query** and **query**');
        });

        it('should be case-insensitive', () => {
            const snippet = extractor.highlightMatch('QUERY here', 'query');
            expect(snippet).toBe('**QUERY** here');
        });

        it('should truncate long snippets', () => {
            const longLine = 'a'.repeat(100) + 'query' + 'b'.repeat(100);
            const shortExtractor = new MatchExtractor({ maxSnippetLength: 50 });
            const snippet = shortExtractor.highlightMatch(longLine, 'query');
            expect(snippet.length).toBeLessThanOrEqual(60); // 50 + some buffer for markers and ellipsis
            expect(snippet).toContain('**query**');
        });

        it('should use custom highlight markers', () => {
            const customExtractor = new MatchExtractor({
                highlightStart: '<em>',
                highlightEnd: '</em>',
            });
            const snippet = customExtractor.highlightMatch('text with query', 'query');
            expect(snippet).toBe('text with <em>query</em>');
        });
    });

    describe('findColumnPosition', () => {
        it('should return -1 for empty line', () => {
            expect(extractor.findColumnPosition('', 'query')).toBe(-1);
        });

        it('should return -1 for empty query', () => {
            expect(extractor.findColumnPosition('content', '')).toBe(-1);
        });

        it('should return -1 when query not found', () => {
            expect(extractor.findColumnPosition('no match here', 'query')).toBe(-1);
        });

        it('should return correct column position', () => {
            expect(extractor.findColumnPosition('query at start', 'query')).toBe(0);
            expect(extractor.findColumnPosition('prefix query suffix', 'query')).toBe(7);
            expect(extractor.findColumnPosition('end with query', 'query')).toBe(9);
        });

        it('should be case-insensitive', () => {
            expect(extractor.findColumnPosition('QUERY here', 'query')).toBe(0);
        });
    });

    describe('edge cases', () => {
        it('should handle special regex characters in query', () => {
            const content = 'text with $100 here';
            const matches = extractor.extractMatches(content, '$100');
            expect(matches).toHaveLength(1);
            expect(matches[0].snippet).toContain('**$100**');
        });

        it('should handle unicode content', () => {
            const content = '日本語のテスト\n中文测试\n한국어 테스트';
            const matches = extractor.extractMatches(content, 'テスト');
            // テスト (Japanese katakana) only appears once - Korean 테스트 is different characters
            expect(matches).toHaveLength(1);
            expect(matches[0].line).toBe(1);
        });

        it('should handle single-line content', () => {
            const content = 'single line with query';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches).toHaveLength(1);
            expect(matches[0].context).toContain('single line with query');
        });

        it('should handle empty lines in content', () => {
            const content = 'line 1\n\nline with query\n\nline 5';
            const matches = extractor.extractMatches(content, 'query');
            expect(matches).toHaveLength(1);
            expect(matches[0].line).toBe(3);
        });

        it('should handle very long lines', () => {
            const longLine = 'a'.repeat(1000) + 'query' + 'b'.repeat(1000);
            const matches = extractor.extractMatches(longLine, 'query');
            expect(matches).toHaveLength(1);
            expect(matches[0].column).toBe(1000);
        });
    });
});
