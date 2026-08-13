import { describe, expect, it } from 'vitest';
import {
  DECISION_TEMPLATES,
  DEFAULT_TEMPLATES,
  renderMessage,
  renderSmsText,
  renderTemplateText,
  speakerFirstName,
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

  it('have no duplicate keys', () => {
    const keys = DEFAULT_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * `C-2`. A waitlisted speaker used to be unreachable: the status existed, the review queue set it,
 * and `sendDecisionNotice` threw because no template carried it. Every status an organizer can
 * decide on has to have somewhere to land.
 */
describe('decision notices', () => {
  it('covers every decided status', () => {
    expect(Object.keys(DECISION_TEMPLATES).sort()).toEqual([
      'accepted',
      'declined',
      'waitlisted',
    ]);
  });

  it('names a template that actually ships', () => {
    const shipped = new Set(DEFAULT_TEMPLATES.map((t) => t.key));
    for (const [status, key] of Object.entries(DECISION_TEMPLATES)) {
      expect({ status, shipped: shipped.has(key) }).toEqual({ status, shipped: true });
    }
  });

  it('gives the waitlist its own copy rather than reusing a decline', () => {
    const waitlisted = DEFAULT_TEMPLATES.find((t) => t.key === 'submission.waitlisted');
    const declined = DEFAULT_TEMPLATES.find((t) => t.key === 'submission.declined');
    expect(waitlisted?.subject).not.toBe(declined?.subject);
    expect(waitlisted?.bodyMarkdown).toContain('{{submission.decisionNote}}');
    // Still under consideration, so the portal link has to be there to look at.
    expect(waitlisted?.bodyMarkdown).toContain('{{portal.link}}');
    expect(waitlisted?.attachIcs ?? false).toBe(false);
  });
});

describe('SMS body rendering', () => {
  it('renders merge fields against an explicit smsBody override', () => {
    expect(renderSmsText('Hi {{speaker.name}}, your talk is confirmed.', 'ignored', VARS)).toBe(
      'Hi Marcus Tullius, your talk is confirmed.',
    );
  });

  it('falls back to a stripped read of the markdown body when smsBody is unset', () => {
    const markdown = '# Hi {{speaker.name}}\n\nYour talk **{{event.name}}** is confirmed.';
    expect(renderSmsText(null, markdown, VARS)).toBe(
      'Hi Marcus Tullius Your talk Cicero Conf is confirmed.',
    );
  });

  it('falls back when smsBody is blank, not just missing', () => {
    expect(renderSmsText('   ', 'Hi {{speaker.name}}.', VARS)).toBe('Hi Marcus Tullius.');
  });

  it('truncates a rendered message past the SMS length cap', () => {
    const long = 'x'.repeat(400);
    const rendered = renderSmsText(long, 'ignored', VARS);
    expect(rendered).toHaveLength(300);
    expect(rendered.endsWith('…')).toBe(true);
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

/**
 * `F-6` gave `user` real `first_name` / `last_name` columns; this merge field kept taking the first
 * whitespace-separated token of the display name, which is not the given name of "Marcus Tullius
 * Cicero", of anyone with a two-word first name, or of anyone whose display name is their company.
 */
describe('speaker.firstName', () => {
  it('prefers the column the speaker filled in themselves', () => {
    expect(speakerFirstName('Marcus Tullius', 'Cicero of Arpinum')).toBe('Marcus Tullius');
  });

  it('ignores a column that is only whitespace', () => {
    expect(speakerFirstName('   ', 'Ada Lovelace')).toBe('Ada');
  });

  /**
   * An account imported before the split has no halves. The guess is `splitPersonName`'s, which is
   * the same one `getProfileName` shows that speaker on their own profile page — one derived value,
   * not two that disagree.
   */
  it('derives the same halves the portal shows an account with none', () => {
    expect(speakerFirstName(null, 'Marcus Tullius Cicero')).toBe('Marcus Tullius');
    expect(speakerFirstName(undefined, 'Ada Lovelace')).toBe('Ada');
  });

  it('falls back to the whole string when there is nothing to split', () => {
    expect(speakerFirstName(null, 'Cicero')).toBe('Cicero');
    expect(speakerFirstName(null, '')).toBe('');
  });
});
