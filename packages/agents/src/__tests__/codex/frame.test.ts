import { describe, expect, it } from 'vitest';
import { jsonLineDecoder, jsonLineEncoder, LineBuffer } from '../../codex/app-server/frame.ts';

describe('jsonLineEncoder', () => {
  it('appends newline and serializes request', () => {
    const encoded = jsonLineEncoder.encode({
      type: 'cancel',
      requestId: 'r-1',
    });
    expect(encoded.endsWith('\n')).toBe(true);
    expect(JSON.parse(encoded.trim())).toEqual({ type: 'cancel', requestId: 'r-1' });
  });
});

describe('jsonLineDecoder', () => {
  it('parses valid event lines', () => {
    const evt = jsonLineDecoder.decode(JSON.stringify({ type: 'ack', requestId: 'r-1' }));
    expect(evt).toEqual({ type: 'ack', requestId: 'r-1' });
  });

  it('returns undefined for blank lines', () => {
    expect(jsonLineDecoder.decode('')).toBeUndefined();
    expect(jsonLineDecoder.decode('   ')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(jsonLineDecoder.decode('{not:json')).toBeUndefined();
  });

  it('rejects unknown event types', () => {
    const evt = jsonLineDecoder.decode(JSON.stringify({ type: 'mystery', requestId: 'r-1' }));
    expect(evt).toBeUndefined();
  });

  it('rejects events missing requestId', () => {
    const evt = jsonLineDecoder.decode(JSON.stringify({ type: 'ack' }));
    expect(evt).toBeUndefined();
  });
});

describe('LineBuffer', () => {
  it('splits buffered chunks at newlines', () => {
    const buf = new LineBuffer();
    expect(buf.push('{"type":"ack",')).toEqual([]);
    expect(buf.push('"requestId":"r-1"}\n{"type":"ack","requestId":"r-2"}\n')).toEqual([
      '{"type":"ack","requestId":"r-1"}',
      '{"type":"ack","requestId":"r-2"}',
    ]);
  });

  it('flush() returns incomplete tail and clears buffer', () => {
    const buf = new LineBuffer();
    buf.push('partial');
    expect(buf.flush()).toBe('partial');
    expect(buf.flush()).toBeUndefined();
  });
});
