import { describe, expect, it, vi } from 'vitest';
import { okEnvelope, errorEnvelope, emit } from '../src/output.js';

describe('okEnvelope', () => {
  it('builds an ok envelope', () => {
    expect(okEnvelope({ x: 1 })).toEqual({ ok: true, data: { x: 1 } });
  });
});

describe('errorEnvelope', () => {
  it('builds an error envelope without detail', () => {
    expect(errorEnvelope('oops')).toEqual({ ok: false, error: { message: 'oops' } });
  });
  it('builds an error envelope with detail', () => {
    expect(errorEnvelope('oops', { code: 'X' })).toEqual({
      ok: false,
      error: { message: 'oops', detail: { code: 'X' } },
    });
  });
});

describe('emit', () => {
  it('writes JSON to stdout when json mode is on', () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    emit({ json: true, writeStdout, writeStderr }, okEnvelope({ x: 1 }), () => 'human');
    expect(writeStdout).toHaveBeenCalledWith('{"ok":true,"data":{"x":1}}\n');
    expect(writeStderr).not.toHaveBeenCalled();
  });
  it('writes human output when json mode is off', () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    emit({ json: false, writeStdout, writeStderr }, okEnvelope({ x: 1 }), () => 'human-rendered');
    expect(writeStdout).toHaveBeenCalledWith('human-rendered\n');
  });
  it('writes errors to stderr when json mode is off', () => {
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();
    emit({ json: false, writeStdout, writeStderr }, errorEnvelope('oops'), () => 'should not be called');
    expect(writeStderr).toHaveBeenCalledWith('error: oops\n');
    expect(writeStdout).not.toHaveBeenCalled();
  });
});
