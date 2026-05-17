import { describe, it, expect } from 'vitest';
import { validateStatus } from '../lib/db.js';

describe('validateStatus', () => {
    it('accepts Pants', () => {
        expect(() => validateStatus('Pants')).not.toThrow();
    });

    it('accepts Shorts', () => {
        expect(() => validateStatus('Shorts')).not.toThrow();
    });

    it('throws on invalid string', () => {
        expect(() => validateStatus('neither')).toThrow();
    });

    it('throws on null', () => {
        expect(() => validateStatus(null)).toThrow();
    });

    it('throws on undefined', () => {
        expect(() => validateStatus(undefined)).toThrow();
    });
});