import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { parseModelJson, responseText } from './review';

/**
 * `V-9`. These cover the seam between the model's answer and our parsing of it, which is where an
 * exhausted token budget used to disappear.
 *
 * `max_tokens` bounds reasoning and visible text together, so a ceiling sized for the JSON body
 * alone is spent thinking and the body arrives half-written. What made that worth a guard is that
 * the truncation does not announce itself downstream: `parseModelJson` fails on the fragment exactly
 * as it fails on prose, and the organizer is told the model returned something unusable — sending
 * whoever investigates after the model's judgement rather than after the budget.
 */

function message(overrides: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    content: [],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    ...overrides,
  } as Anthropic.Message;
}

function text(value: string): Anthropic.TextBlock {
  return { type: 'text', text: value, citations: null } as Anthropic.TextBlock;
}

describe('responseText', () => {
  it('joins the text blocks of a complete answer', () => {
    const response = message({ content: [text('{"scores": []'), text(', "rationale": "ok"}')] });
    expect(responseText(response)).toBe('{"scores": []\n, "rationale": "ok"}');
  });

  it('ignores blocks that are not text, so reasoning never reaches the JSON parser', () => {
    const response = message({
      content: [
        { type: 'thinking', thinking: 'Weighing the abstract…', signature: 'sig' } as Anthropic.ContentBlock,
        text('{"rationale": "ok"}'),
      ],
    });
    expect(responseText(response)).toBe('{"rationale": "ok"}');
  });

  it('reports a truncated answer as its own failure rather than as a bad one', () => {
    const response = message({
      stop_reason: 'max_tokens',
      content: [text('{"scores": [{"criterionId": "clarity", "value": 4, "note": "The abstract')],
    });

    let thrown: unknown;
    try {
      responseText(response);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('unavailable');
    expect((thrown as AppError).message).toMatch(/ran out of room/);
  });

  it('does not lean on the fragment being unparseable, because that is not what tells us', () => {
    // The guard reads `stop_reason`, not the shape of the text: a budget can run out on the very
    // token after a syntactically complete object, and that answer is still missing criteria.
    const response = message({
      stop_reason: 'max_tokens',
      content: [text('{"scores": [], "rationale": "ok"}')],
    });
    expect(() => responseText(response)).toThrowError(AppError);
  });
});

describe('parseModelJson on a truncated body', () => {
  it('returns null, which is indistinguishable from the model answering in prose', () => {
    const cut = '{"scores": [{"criterionId": "clarity", "value": 4, "note": "The abstract is';
    expect(parseModelJson(cut)).toBeNull();
    expect(parseModelJson('Sorry, I cannot score this.')).toBeNull();
  });

  it('still reads a whole body, fenced or bare', () => {
    expect(parseModelJson('{"rationale": "bare"}')).toEqual({ rationale: 'bare' });
    expect(parseModelJson('```json\n{"rationale": "fenced"}\n```')).toEqual({ rationale: 'fenced' });
  });
});
