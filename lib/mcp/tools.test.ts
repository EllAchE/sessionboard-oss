import { describe, expect, it } from 'vitest';
import committedManifest from '@/docs/mcp-tools.json';
import { buildMcpToolManifest } from './tools';

describe('MCP tool manifest', () => {
  it('stays in sync with the generated MCP contracts', () => {
    expect(buildMcpToolManifest()).toEqual(committedManifest);
  });

  it('covers the event program spine and labels the only write tool', () => {
    const manifest = buildMcpToolManifest();
    expect(manifest.tools.map((tool) => tool.name)).toEqual([
      'cicero_event_get',
      'cicero_sessions_list',
      'cicero_speakers_list',
      'cicero_agenda_get',
      'cicero_submissions_list',
      'cicero_mail_templates_list',
      'cicero_mail_deliveries_list',
      'cicero_mail_preview',
      'cicero_mail_send',
      'cicero_program_reconcile',
    ]);
    expect(manifest.tools.filter((tool) => tool.access === 'write').map((tool) => tool.name)).toEqual([
      'cicero_mail_send',
      'cicero_program_reconcile',
    ]);
  });
});
