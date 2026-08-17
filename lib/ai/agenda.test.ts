import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { extractJson, proposalText } from './agenda';

/**
 * `A-8`. These cover the seam between the model's answer and our reading of it, which is where a
 * spent token budget used to vanish without a trace.
 *
 * `max_tokens` bounds reasoning and visible text together, so a ceiling sized for the placements
 * alone is spent thinking and the JSON arrives cut off. What made that worth a guard is the shape of
 * the failure downstream: `extractJson` returns no placements from a fragment, exactly as it does
 * from prose, and the organizer is shown an empty proposal — the planner appearing to have nothing
 * to suggest, rather than having run out of room mid-sentence.
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

describe('proposalText', () => {
  it('joins the text blocks of a finished draft', () => {
    const response = message({ content: [text('{"placements": []'), text(', "notes": null}')] });
    expect(proposalText(response)).toBe('{"placements": []\n, "notes": null}');
  });

  it('ignores blocks that are not text, so reasoning never reaches the JSON reader', () => {
    const response = message({
      content: [
        { type: 'thinking', thinking: 'Room 2 is free after lunch…', signature: 'sig' } as Anthropic.ContentBlock,
        text('{"placements": []}'),
      ],
    });
    expect(proposalText(response)).toBe('{"placements": []}');
  });

  it('withholds a draft that ran out of room instead of passing on the fragment', () => {
    const response = message({
      stop_reason: 'max_tokens',
      content: [text('{"placements": [{"itemId": "sub_1", "dayKey": "2026-09-15", "roomId": "room')],
    });
    expect(proposalText(response)).toBeNull();
  });

  it('reads `stop_reason`, not the shape of the text', () => {
    // A budget can run out on the token after a syntactically complete object, and that draft is
    // still missing placements. Nothing about the text itself would give that away.
    const response = message({
      stop_reason: 'max_tokens',
      content: [text('{"placements": [], "notes": "ran long"}')],
    });
    expect(proposalText(response)).toBeNull();
  });
});

describe('extractJson on a truncated draft', () => {
  it('yields no placements, which is why truncation cannot be detected here', () => {
    const cut = '{"placements": [{"itemId": "sub_1", "dayKey": "2026-09-15", "roomId": "room_a"';
    expect(extractJson(cut)).toEqual({ placements: [], notes: null });
    // Indistinguishable from the model declining to answer in JSON at all.
    expect(extractJson('I could not find a conflict-free arrangement.')).toEqual({
      placements: [],
      notes: null,
    });
  });

  it('still reads a whole draft', () => {
    const whole = '{"placements": [{"itemId": "sub_1"}], "notes": "Workshops kept after lunch."}';
    expect(extractJson(whole)).toEqual({
      placements: [{ itemId: 'sub_1' }],
      notes: 'Workshops kept after lunch.',
    });
  });
});
