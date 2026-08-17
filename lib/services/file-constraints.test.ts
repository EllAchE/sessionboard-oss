import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_TYPE_PRESETS,
  acceptAttribute,
  acceptedTypesHint,
} from './file-format';
import { matchesAcceptedType, validateUpload, validateUploadBatch } from './files';

/**
 * `CNT-02`. A task whose instructions ask for a PDF used to expose only "Any file type", so the
 * request was prose and nothing enforced it. These cover the two halves that fix has to hold up:
 * the portal has to *say* what it takes, and the server has to *refuse* everything else.
 */

const spec = (acceptedTypes: string[]) => ({
  id: 'request-1',
  label: 'Slide deck',
  helpText: null,
  acceptedTypes,
  maxSizeMb: 25,
  allowMultiple: true,
});

const upload = (filename: string, contentType: string, sizeBytes = 1024) => ({
  filename,
  contentType,
  sizeBytes,
});

describe('what the portal tells a speaker', () => {
  it('names a single constraint in the words a speaker uses', () => {
    expect(acceptedTypesHint(spec(['application/pdf']))).toBe('PDF only');
  });

  it('reads a two-type constraint as a choice rather than a list of MIME types', () => {
    expect(acceptedTypesHint(spec(['application/pdf', 'application/vnd.apple.keynote']))).toBe(
      'PDF or Keynote only',
    );
  });

  it('collapses spellings of the same thing so "PDF or PDF only" cannot happen', () => {
    expect(acceptedTypesHint(spec(['application/pdf', '.pdf']))).toBe('PDF only');
  });

  it('still says "Any file type" when the organizer set no constraint', () => {
    expect(acceptedTypesHint(spec([]))).toBe('Any file type');
  });

  it('falls back to something readable for a type it has no word for', () => {
    expect(acceptedTypesHint(spec(['.csv']))).toBe('CSV only');
    expect(acceptedTypesHint(spec(['audio/*']))).toBe('audio files only');
  });

  it('gives the file picker a matching accept attribute', () => {
    expect(acceptAttribute(spec(['application/pdf']))).toBe('application/pdf');
    expect(acceptAttribute(spec([]))).toBeUndefined();
  });

  it('offers presets that every helper can read back', () => {
    for (const preset of ACCEPTED_TYPE_PRESETS) {
      expect(acceptedTypesHint({ acceptedTypes: preset.types })).toBeTruthy();
      expect(() => acceptAttribute({ acceptedTypes: preset.types })).not.toThrow();
    }
    expect(ACCEPTED_TYPE_PRESETS.find((entry) => entry.label === 'PDF only')?.types).toEqual([
      'application/pdf',
    ]);
  });
});

describe('what the server does with the file that arrives', () => {
  it('accepts the PDF the task asked for', () => {
    expect(() =>
      validateUpload(spec(['application/pdf']), upload('oration.pdf', 'application/pdf')),
    ).not.toThrow();
  });

  it('refuses a non-PDF and says what it wanted', () => {
    expect(() =>
      validateUpload(spec(['application/pdf']), upload('oration.docx', 'application/msword')),
    ).toThrow(/not an accepted file type/i);
  });

  /**
   * The `accept` attribute is a picker filter, not a gate: drag-and-drop, a renamed file and a
   * direct POST all walk straight past it. This is the assertion that the route does not rely on it.
   */
  it('refuses a file whose extension was renamed to look right', () => {
    expect(() =>
      validateUpload(spec(['application/pdf']), upload('oration.pdf', 'image/png')),
    ).toThrow(/not an accepted file type/i);
  });

  it('accepts any of the forms an organizer might have stored the rule in', () => {
    const candidate = upload('deck.pdf', 'application/pdf');
    for (const rule of ['application/pdf', '.pdf', 'pdf', 'application/*']) {
      expect(matchesAcceptedType(candidate, rule)).toBe(true);
    }
    expect(matchesAcceptedType(candidate, 'image/*')).toBe(false);
  });

  it('lets everything through only when the organizer chose no constraint', () => {
    expect(() => validateUpload(spec([]), upload('notes.txt', 'text/plain'))).not.toThrow();
  });

  it('rejects the whole batch when one file breaks the constraint', () => {
    expect(() =>
      validateUploadBatch(spec(['application/pdf']), [
        upload('good.pdf', 'application/pdf'),
        upload('bad.png', 'image/png'),
      ]),
    ).toThrow(/not an accepted file type/i);
  });
});
