import { SearchScorer } from '../../../../src/services/search/SearchScorer';
import { Match } from '../../../../src/types/index';

describe('SearchScorer', () => {
    let scorer: SearchScorer;

    beforeEach(() => {
        scorer = new SearchScorer();
    });

    const createMatch = (line: number): Match => ({ line });
    const createMatches = (lines: number[]): Match[] => lines.map(createMatch);

    /**
     * Helper to count lines in content
     */
    const countLines = (content: string): number => content.split('\n').length;

    describe('constructor', () => {
        it('should create scorer with default weights', () => {
            const weights = scorer.getWeights();
            expect(weights.termFrequency).toBe(0.4);
            expect(weights.position).toBe(0.3);
            expect(weights.density).toBe(0.3);
        });

        it('should create scorer with custom weights', () => {
            const customScorer = new SearchScorer({
                termFrequency: 0.5,
                position: 0.25,
                density: 0.25,
            });
            const weights = customScorer.getWeights();
            expect(weights.termFrequency).toBe(0.5);
            expect(weights.position).toBe(0.25);
            expect(weights.density).toBe(0.25);
        });

        it('should use default values for missing custom weights', () => {
            const customScorer = new SearchScorer({ termFrequency: 0.5 });
            const weights = customScorer.getWeights();
            expect(weights.termFrequency).toBe(0.5);
            expect(weights.position).toBe(0.3);
            expect(weights.density).toBe(0.3);
        });
    });

    describe('calculateScore', () => {
        it('should return 0 for empty matches', () => {
            const score = scorer.calculateScore([], 'content', 'query');
            expect(score).toBe(0);
        });

        it('should return 0 for empty content', () => {
            const score = scorer.calculateScore(createMatches([1]), '', 'query');
            expect(score).toBe(0);
        });

        it('should return 0 for empty query', () => {
            const score = scorer.calculateScore(createMatches([1]), 'content', '');
            expect(score).toBe(0);
        });

        it('should return score between 0 and 1', () => {
            const content = 'This is a test query. The query appears multiple times. Query again.';
            const matches = createMatches([1, 2, 3]);
            const score = scorer.calculateScore(matches, content, 'query');
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        it('should give higher score for more matches', () => {
            const content = 'query query query query query\nmore content here\nand more';
            const fewMatches = createMatches([1]);
            const manyMatches = createMatches([1, 2, 3]);
            
            const scoreFew = scorer.calculateScore(fewMatches, content, 'query');
            const scoreMany = scorer.calculateScore(manyMatches, content, 'query');
            
            expect(scoreMany).toBeGreaterThan(scoreFew);
        });

        it('should give higher score for matches at beginning of file', () => {
            const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
            const earlyMatch = createMatches([1]);
            const lateMatch = createMatches([5]);
            
            const scoreEarly = scorer.calculateScore(earlyMatch, content, 'line');
            const scoreLate = scorer.calculateScore(lateMatch, content, 'line');
            
            expect(scoreEarly).toBeGreaterThan(scoreLate);
        });
    });

    describe('calculateTermFrequency', () => {
        it('should return 0 for empty content', () => {
            const tf = scorer.calculateTermFrequency('', 'query');
            expect(tf).toBe(0);
        });

        it('should return 0 for empty query', () => {
            const tf = scorer.calculateTermFrequency('content', '');
            expect(tf).toBe(0);
        });

        it('should return higher TF for more occurrences', () => {
            const contentFew = 'query is here';
            const contentMany = 'query query query query query';
            
            const tfFew = scorer.calculateTermFrequency(contentFew, 'query');
            const tfMany = scorer.calculateTermFrequency(contentMany, 'query');
            
            expect(tfMany).toBeGreaterThan(tfFew);
        });

        it('should be case-insensitive', () => {
            const content = 'Query QUERY query';
            const tf = scorer.calculateTermFrequency(content, 'query');
            expect(tf).toBeGreaterThan(0);
        });

        it('should return value between 0 and 1', () => {
            const content = 'query query query query query';
            const tf = scorer.calculateTermFrequency(content, 'query');
            expect(tf).toBeGreaterThanOrEqual(0);
            expect(tf).toBeLessThanOrEqual(1);
        });
    });

    describe('calculatePositionBonus', () => {
        it('should return 0 for empty matches', () => {
            const bonus = scorer.calculatePositionBonus([], 5);
            expect(bonus).toBe(0);
        });

        it('should return 0 for zero total lines', () => {
            const bonus = scorer.calculatePositionBonus(createMatches([1]), 0);
            expect(bonus).toBe(0);
        });

        it('should return higher bonus for matches at beginning', () => {
            const totalLines = 5;
            const earlyMatch = createMatches([1]);
            const lateMatch = createMatches([5]);
            
            const bonusEarly = scorer.calculatePositionBonus(earlyMatch, totalLines);
            const bonusLate = scorer.calculatePositionBonus(lateMatch, totalLines);
            
            expect(bonusEarly).toBeGreaterThan(bonusLate);
        });

        it('should use earliest match for calculation', () => {
            const totalLines = 5;
            const mixedMatches = createMatches([3, 1, 5]);
            
            const bonus = scorer.calculatePositionBonus(mixedMatches, totalLines);
            const earlyOnlyBonus = scorer.calculatePositionBonus(createMatches([1]), totalLines);
            
            // Should be same as if only line 1 matched
            expect(bonus).toBe(earlyOnlyBonus);
        });

        it('should return value between 0 and 1', () => {
            const totalLines = 3;
            const matches = createMatches([2]);
            const bonus = scorer.calculatePositionBonus(matches, totalLines);
            expect(bonus).toBeGreaterThanOrEqual(0);
            expect(bonus).toBeLessThanOrEqual(1);
        });
    });

    describe('calculateDensityBonus', () => {
        it('should return 0 for empty matches', () => {
            const bonus = scorer.calculateDensityBonus([], 5);
            expect(bonus).toBe(0);
        });

        it('should return 0 for zero total lines', () => {
            const bonus = scorer.calculateDensityBonus(createMatches([1]), 0);
            expect(bonus).toBe(0);
        });

        it('should return higher bonus for more matches in shorter content', () => {
            const shortTotalLines = 2;
            const longTotalLines = 10;
            const matches = createMatches([1, 2]);
            
            const bonusShort = scorer.calculateDensityBonus(matches, shortTotalLines);
            const bonusLong = scorer.calculateDensityBonus(matches, longTotalLines);
            
            expect(bonusShort).toBeGreaterThan(bonusLong);
        });

        it('should return value between 0 and 1', () => {
            const totalLines = 3;
            const matches = createMatches([1, 2]);
            const bonus = scorer.calculateDensityBonus(matches, totalLines);
            expect(bonus).toBeGreaterThanOrEqual(0);
            expect(bonus).toBeLessThanOrEqual(1);
        });
    });

    describe('edge cases', () => {
        it('should handle single-line content', () => {
            const content = 'single line with query';
            const matches = createMatches([1]);
            const score = scorer.calculateScore(matches, content, 'query');
            expect(score).toBeGreaterThan(0);
        });

        it('should handle very long content', () => {
            const lines = Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`);
            const content = lines.join('\n');
            const matches = createMatches([1, 500, 1000]);
            const score = scorer.calculateScore(matches, content, 'line');
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        it('should handle special characters in query', () => {
            const content = 'content with special chars: $100 and (test)';
            const matches = createMatches([1]);
            const score = scorer.calculateScore(matches, content, '$100');
            expect(score).toBeGreaterThanOrEqual(0);
        });

        it('should handle unicode content', () => {
            const content = '日本語のテスト\n中文测试\n한국어 테스트';
            const matches = createMatches([1]);
            const score = scorer.calculateScore(matches, content, 'テスト');
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });
});
