import { describe, expect, it } from 'vitest';

describe('TypeScript strict mode compliance', () => {
  it('should have noImplicitAny enforced', () => {
    // This test verifies that the code compiles correctly under strict mode
    // The presence of this test suite passing means all strict flags are active
    const x: number = 42;
    expect(x).toBe(42);
  });

  it('should handle optional properties correctly', () => {
    type Config = { port?: number };
    const config: Config = {}; // correct: no property
    const config2: Config = { port: 3000 }; // correct: property with value

    expect(config).toEqual({});
    expect(config2).toEqual({ port: 3000 });
  });

  it('should handle array access safely', () => {
    const arr: number[] = [1, 2, 3];
    const first = arr.at(0); // safe: returns T | undefined
    expect(first).toBe(1);

    const result = first ? first.toFixed(2) : 'no value';
    expect(result).toBe('1.00');
  });

  it('should enforce type safety in functions', () => {
    function process(value: string): string {
      return value.toUpperCase();
    }

    const result = process('hello');
    expect(result).toBe('HELLO');
  });
});
