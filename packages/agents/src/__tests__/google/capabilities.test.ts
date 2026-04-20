import { describe, expect, it } from 'vitest';
import { detectGeminiCapabilities } from '../../google/capabilities.ts';

describe('detectGeminiCapabilities', () => {
  it('returns thinking:true for gemini-3.x models', () => {
    const caps = detectGeminiCapabilities('gemini-3.1-pro-preview');
    expect(caps.thinking).toBe(true);
    expect(caps.family).toBe('google');
  });

  it('returns thinking:true for gemini-2.5 models', () => {
    const caps = detectGeminiCapabilities('gemini-2.5-flash');
    expect(caps.thinking).toBe(true);
  });

  it('returns thinking:false for older gemini-1.5 models', () => {
    const caps = detectGeminiCapabilities('gemini-1.5-pro');
    expect(caps.thinking).toBe(false);
  });

  it('strips pi/ prefix before detection', () => {
    const caps = detectGeminiCapabilities('pi/gemini-3.1-pro-preview');
    expect(caps.thinking).toBe(true);
  });

  it('has streaming and toolUse true', () => {
    const caps = detectGeminiCapabilities('gemini-3.1-pro-preview');
    expect(caps.streaming).toBe(true);
    expect(caps.toolUse).toBe(true);
  });
});
