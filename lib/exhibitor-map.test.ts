import { describe, expect, it } from 'vitest';
import {
  exhibitorMapEmbedPath,
  exhibitorMapFilePath,
  hasPdfSignature,
} from './exhibitor-map';

describe('exhibitor map contract', () => {
  it('recognizes a PDF signature, including permitted leading bytes', () => {
    expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('\u0000\u0000%PDF-2.0\n'))).toBe(true);
  });

  it('does not trust an extension without PDF bytes', () => {
    expect(hasPdfSignature(new TextEncoder().encode('<html>not a map</html>'))).toBe(false);
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });

  it('builds stable, slug-safe embed and file paths', () => {
    expect(exhibitorMapEmbedPath('forum & expo')).toBe('/embed/forum%20%26%20expo/exhibitor-map');
    expect(exhibitorMapFilePath('forum & expo')).toBe(
      '/embed/forum%20%26%20expo/exhibitor-map/file',
    );
  });
});
