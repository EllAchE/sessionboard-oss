import { describe, expect, it } from 'vitest';
import {
  DECISION_TEMPLATES,
  DEFAULT_TEMPLATES,
  SMS_MAX_LENGTH,
  renderMessage,
  renderSmsText,
  renderTemplateText,
  requestsPortalLink,
  speakerFirstName,
  templateVariablesUsed,
  uniqueSmsRecipientEmail,
  unknownVariables,
  wrapInBranding,
  type TemplateVars,
} from './comms';

describe('SMS recipient identity', () => {
  it('resolves exactly one account and fails closed on missing or duplicate phone matches', () => {
    expect(uniqueSmsRecipientEmail([])).toBeNull();
    expect(uniqueSmsRecipientEmail([{ email: 'speaker@example.com' }])).toBe(
      'speaker@example.com',
    );
    expect(
      uniqueSmsRecipientEmail([
        { email: 'first@example.com' },
        { email: 'second@example.com' },
      ]),
    ).toBeNull();
  });
});

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

/**
 * The GSM-7 basic character set (3GPP TS 23.038). The nine extension characters — `^{}\[~]|€` — are
 * deliberately excluded: they are encodable, but each one costs two of the 160 characters in a
 * segment, and none of the shipped copy needs them.
 */
const GSM7 = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);

function isGsm7(text: string): boolean {
  return [...text].every((char) => GSM7.has(char));
}

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

describe('one-click portal links', () => {
  it('mints a credential when any delivered channel asks for one', () => {
    expect(requestsPortalLink('No link', 'No link', 'Open {{portal.link}}')).toBe(true);
    expect(requestsPortalLink('Open {{ portal.link }}', 'No link', null)).toBe(true);
    expect(requestsPortalLink('No link', 'Open {{portal.url}}', null)).toBe(false);
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
          ...unknownVariables(template.smsBody ?? ''),
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
    expect(rendered).toHaveLength(SMS_MAX_LENGTH);
    // Three periods, not `…`: the ellipsis character alone would re-encode the message as UCS-2.
    expect(rendered.endsWith('...')).toBe(true);
    expect(isGsm7(rendered)).toBe(true);
  });
});

/**
 * The shipped SMS copy, checked the way it is actually delivered: rendered against one recipient's
 * variables, no subject line, no thread.
 *
 * Two of these assertions are cost guards rather than style preferences.
 *
 * Twilio segments at 160 GSM-7 characters, or 153 each once a message is concatenated. A single
 * character outside GSM-7 - a curly quote, an en dash, an ellipsis - re-encodes the whole message
 * as UCS-2, where a segment holds 67 characters. A 300-character message is two segments in GSM-7
 * and five in UCS-2, so one pasted character costs 2.5x on every send from then on. The template
 * editor makes it easy to reintroduce, which is why the default copy is pinned here.
 *
 * The length ceiling is the same constraint from the other side: `SMS_MAX_LENGTH` is exactly two
 * GSM-7 segments, and copy that renders near it truncates as soon as an event has a long name.
 */
describe('shipped SMS bodies', () => {
  /**
   * What each template's send path actually populates. `form.deadline` is the one that matters:
   * `runDraftDeadlineReminders` builds its own `vars` map rather than going through `buildVars`, so
   * a body that reaches for `{{submission.title}}` or `{{portal.link}}` would deliver a hole.
   */
  const EVENT_FIELDS = [
    'event.name',
    'event.dates',
    'event.timezone',
    'event.venue',
    'event.website',
    'event.url',
    'event.supportEmail',
  ];
  const SPEAKER_FIELDS = [
    'speaker.name',
    'speaker.firstName',
    'speaker.email',
    'speaker.company',
    'speaker.jobTitle',
    'speaker.pronouns',
  ];
  const PORTAL_FIELDS = ['portal.url', 'portal.link'];
  const SUBMISSION_FIELDS = [
    'submission.title',
    'submission.ref',
    'submission.status',
    'submission.decisionNote',
  ];
  const SESSION_FIELDS = [
    'session.title',
    'session.ref',
    'session.track',
    'session.room',
    'session.format',
    'session.startsAt',
    'session.endsAt',
    'session.calendarUrl',
  ];
  const TASK_FIELDS = ['tasks.count', 'tasks.list', 'tasks.next', 'task.name', 'task.dueAt'];

  const AVAILABLE: Record<string, string[]> = {
    'submission.confirmation': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...SUBMISSION_FIELDS, ...PORTAL_FIELDS],
    'submission.accepted': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...SUBMISSION_FIELDS, ...TASK_FIELDS, ...PORTAL_FIELDS],
    'submission.waitlisted': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...SUBMISSION_FIELDS, ...PORTAL_FIELDS],
    'submission.declined': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...SUBMISSION_FIELDS, ...PORTAL_FIELDS],
    'session.invite': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...SESSION_FIELDS, ...PORTAL_FIELDS],
    'session.cancelled': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...SESSION_FIELDS, ...PORTAL_FIELDS],
    'task.reminder': [...EVENT_FIELDS, ...SPEAKER_FIELDS, ...TASK_FIELDS, ...PORTAL_FIELDS],
    // The narrow one: `runDraftDeadlineReminders` supplies exactly these and nothing else.
    'form.deadline': [
      'event.name',
      'event.url',
      'speaker.name',
      'speaker.firstName',
      'speaker.email',
      'form.name',
      'form.closesAt',
      'form.url',
    ],
  };

  /**
   * Deliberately unkind: a 51-character event name, a 63-character title, a full 43-byte signed
   * portal token and a real-length form URL. If the copy fits here it fits anywhere.
   */
  const LONG_VARS: TemplateVars = {
    'event.name': 'International Conference on Distributed Systems 2026',
    'event.url': 'https://speakers.distsys-conf.example.org/e/distsys-2026',
    'event.supportEmail': 'programme-committee@distsys-conf.example.org',
    'speaker.name': 'Maximiliana Featherstonehaugh',
    'speaker.firstName': 'Maximiliana',
    'speaker.email': 'maximiliana@a-rather-long-company-name.example.com',
    'submission.title': 'Rebuilding the Control Plane Without Taking the Data Plane Down',
    'submission.ref': 'ABS-1284',
    'submission.status': 'accepted',
    'session.title': 'Rebuilding the Control Plane Without Taking the Data Plane Down',
    'session.ref': 'SESS-1284',
    'session.room': 'Auditorium 2 (Lower Concourse)',
    'session.track': 'Platform Engineering',
    'session.startsAt': 'Wednesday 16 September 2026 at 14:30',
    'session.endsAt': 'Wednesday 16 September 2026 at 15:15',
    'session.calendarUrl':
      'https://speakers.distsys-conf.example.org/api/calendar/6f1c4a8e-2b3d-4f5a-9c7e-8d0a1b2c3d4e',
    'portal.url': 'https://speakers.distsys-conf.example.org/portal',
    'portal.link': `https://speakers.distsys-conf.example.org/auth/verify?token=${'A'.repeat(43)}`,
    'task.name': 'Upload your final slide deck and speaker bio',
    'task.dueAt': ' and due 12 September 2026',
    'tasks.count': '4',
    'tasks.next': 'Upload your final slide deck and speaker bio',
    'form.name': 'Call for Proposals: Main Track',
    'form.closesAt': 'Friday 4 September 2026',
    'form.url':
      'https://speakers.distsys-conf.example.org/submit/distsys-2026/call-for-proposals-main-track',
  };

  it('ships a purpose-written body for every template', () => {
    for (const template of DEFAULT_TEMPLATES) {
      expect({ key: template.key, hasSms: Boolean(template.smsBody?.trim()) }).toEqual({
        key: template.key,
        hasSms: true,
      });
    }
  });

  it('only uses merge fields that template is actually given', () => {
    for (const template of DEFAULT_TEMPLATES) {
      const allowed = new Set(AVAILABLE[template.key] ?? []);
      const used = templateVariablesUsed(template.smsBody ?? '');
      expect({ key: template.key, unavailable: used.filter((path) => !allowed.has(path)) }).toEqual({
        key: template.key,
        unavailable: [],
      });
    }
  });

  it('renders inside the length cap with room to spare, and expands every field', () => {
    for (const template of DEFAULT_TEMPLATES) {
      const rendered = renderSmsText(template.smsBody, template.bodyMarkdown, LONG_VARS);
      expect({ key: template.key, over: rendered.length > SMS_MAX_LENGTH - 15 }).toEqual({
        key: template.key,
        over: false,
      });
      expect({ key: template.key, tail: rendered.slice(-3) }).not.toEqual({
        key: template.key,
        tail: '...',
      });
      expect({ key: template.key, leftover: /\{\{|\}\}/.test(rendered) }).toEqual({
        key: template.key,
        leftover: false,
      });
    }
  });

  it('names the event and reads as a message rather than a clipped email', () => {
    for (const template of DEFAULT_TEMPLATES) {
      const rendered = renderSmsText(template.smsBody, template.bodyMarkdown, LONG_VARS);
      expect({ key: template.key, names: rendered.includes(LONG_VARS['event.name']) }).toEqual({
        key: template.key,
        names: true,
      });
      // Markdown is delivered literally over SMS: an override is not stripped the way the fallback is.
      expect({ key: template.key, markdown: /[*_#`]|\]\(/.test(rendered) }).toEqual({
        key: template.key,
        markdown: false,
      });
    }
  });

  it('stays inside GSM-7 so a message never doubles its segment count', () => {
    for (const template of DEFAULT_TEMPLATES) {
      const rendered = renderSmsText(template.smsBody, template.bodyMarkdown, LONG_VARS);
      const offenders = [...rendered].filter((char) => !GSM7.has(char));
      expect({ key: template.key, offenders }).toEqual({ key: template.key, offenders: [] });
    }
  });

  it('points somewhere exactly where its email does', () => {
    const linked = DEFAULT_TEMPLATES.filter((t) => /\{\{[^}]*(link|Url|url)/.test(t.smsBody ?? ''))
      .map((t) => t.key)
      .sort();
    expect(linked).toEqual([
      'form.deadline',
      'session.invite',
      'submission.accepted',
      'submission.confirmation',
      'submission.waitlisted',
      'task.reminder',
    ]);
    // The two with nothing to click: a decline asks nothing of the speaker, and a cancellation
    // names the support address rather than a page.
    for (const key of ['submission.declined', 'session.cancelled']) {
      const template = DEFAULT_TEMPLATES.find((t) => t.key === key);
      expect({ key, linked: /\{\{[^}]*(link|Url|url)/.test(template?.smsBody ?? '') }).toEqual({
        key,
        linked: false,
      });
    }
  });

  /**
   * The one deliberate divergence from the email copy, and a security boundary rather than a style
   * choice. Custom SMS copy may request the guarded `{{portal.link}}`, but the defaults keep the
   * archive credential-free by using `{{portal.url}}` instead.
   */
  it('never puts a sign-in credential in a body that lands in sms_log', () => {
    for (const template of DEFAULT_TEMPLATES) {
      const body = template.smsBody ?? '';
      expect({ key: template.key, credential: body.includes('{{portal.link}}') }).toEqual({
        key: template.key,
        credential: false,
      });
      expect({ key: template.key, verify: body.includes('/auth/verify') }).toEqual({
        key: template.key,
        verify: false,
      });
    }

    // Where the email offers one-click sign-in, the text offers the portal address.
    for (const key of [
      'submission.confirmation',
      'submission.accepted',
      'submission.waitlisted',
      'task.reminder',
    ]) {
      const template = DEFAULT_TEMPLATES.find((t) => t.key === key);
      expect({ key, email: template?.bodyMarkdown.includes('{{portal.link}}') }).toEqual({
        key,
        email: true,
      });
      expect({ key, sms: template?.smsBody?.includes('{{portal.url}}') }).toEqual({ key, sms: true });
    }
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
