import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  renderMessage,
  renderTemplateText,
  templateVariablesUsed,
  unknownVariables,
  wrapInBranding,
} from './comms';

/**
 * The merge-field syntax is documented in `tasks/W5-notes.md` and is the contract the template
 * editor's palette advertises. A silent change to the pattern would render every organizer's
 * existing template as blanks, which is exactly the failure this covers.
 */

const VARS = {
  'speaker.name': 'Marcus Tullius',
  'speaker.company': '',
  'event.name': 'Cicero Conf',
};

describe('merge fields', () => {
  it('substitutes a dotted path', () => {
    expect(renderTemplateText('Hi {{speaker.name}},', VARS)).toBe('Hi Marcus Tullius,');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderTemplateText('{{  event.name  }}', VARS)).toBe('Cicero Conf');
  });

  /** An empty value takes the fallback, not just a missing one — a blank company is the real case. */
  it('falls back on empty as well as missing', () => {
    expect(renderTemplateText('{{speaker.company|their company}}', VARS)).toBe('their company');
    expect(renderTemplateText('{{speaker.pronouns|they/them}}', VARS)).toBe('they/them');
  });

  it('renders an unknown field with no fallback as nothing', () => {
    expect(renderTemplateText('a{{nope.here}}b', VARS)).toBe('ab');
  });

  it('lists the fields a body uses', () => {
    expect(templateVariablesUsed('{{a.b}} {{c.d|x}} {{a.b}}').sort()).toEqual(['a.b', 'c.d']);
  });

  it('flags a typo against the documented catalog', () => {
    expect(unknownVariables('{{speaker.nmae}} {{speaker.name}}')).toEqual(['speaker.nmae']);
  });
});

describe('message rendering', () => {
  it('keeps speaker-controlled merge values inert in markdown bodies', () => {
    const message = renderMessage(
      {
        eventName: 'Cicero Conf',
        accent: '#123456',
        supportEmail: null,
        eventUrl: 'https://cicero.test/event',
      },
      'Hello {{speaker.name}}',
      'Hello {{speaker.name}}',
      { 'speaker.name': '[click](https://evil.test) ![pixel](https://evil.test/pixel)' },
    );

    expect(message.subject).toContain('[click](https://evil.test)');
    expect(message.text).toContain('[click](https://evil.test)');
    expect(message.html).not.toContain('href="https://evil.test"');
    expect(message.html).not.toContain('src="https://evil.test/pixel"');
  });
});

describe('shipped templates', () => {
  it('use only documented merge fields', () => {
    for (const template of DEFAULT_TEMPLATES) {
      expect({
        key: template.key,
        unknown: [
          ...unknownVariables(template.subject),
          ...unknownVariables(template.bodyMarkdown),
        ],
      }).toEqual({ key: template.key, unknown: [] });
    }
  });

  it('attach the calendar only where an invite makes sense', () => {
    const attaching = DEFAULT_TEMPLATES.filter((t) => t.attachIcs).map((t) => t.key);
    expect(attaching.sort()).toEqual(['session.cancelled', 'session.invite']);
  });
});

describe('branded layout', () => {
  const branding = {
    eventName: 'Cicero Conf',
    accent: '#2F7361',
    supportEmail: 'programme@example.org',
    eventUrl: 'https://example.org/e/cicero',
  };

  it('applies the event accent', () => {
    expect(wrapInBranding(branding, '<p>hi</p>')).toContain('#2F7361');
  });

  it('escapes an event name that contains markup', () => {
    const html = wrapInBranding({ ...branding, eventName: 'A <b>bold</b> event' }, '<p>hi</p>');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; event');
  });

  it('keeps the caller-rendered content verbatim', () => {
    expect(wrapInBranding(branding, '<p>hello</p>')).toContain('<p>hello</p>');
  });
});
