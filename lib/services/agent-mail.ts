import { invalid, notFound } from '../errors';
import { hashToken, timingSafeEqual } from '../ids';
import {
  DEFAULT_TEMPLATES,
  getTemplate,
  listMail,
  listTemplates,
  previewParticipantEmail,
  sendParticipantEmail,
  templateVariablesUsed,
  unknownVariables,
} from './comms';

export const AGENT_MAIL_CONFIRMATION_PREFIX = 'SEND EMAIL TO ';

export type AgentMailTemplate = {
  key: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  enabled: boolean;
  attachIcs: boolean;
  source: 'event' | 'default';
  updatedAt: string | null;
  agentSendable: boolean;
  agentSendBlockedReason: string | null;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

const FLOW_OWNED_VARIABLES = new Set([
  'task.name',
  'task.dueAt',
  'task.sessions',
  'form.name',
  'form.closesAt',
  'form.url',
]);

function sendBlockedReason(template: {
  enabled: boolean;
  attachIcs: boolean;
  subject: string;
  bodyMarkdown: string;
}): string | null {
  if (!template.enabled) return 'Template is disabled for this event';
  if (template.attachIcs) return 'Calendar-invite templates must use the schedule-owned send flow';
  const unknown = [
    ...unknownVariables(template.subject),
    ...unknownVariables(template.bodyMarkdown),
  ].filter((path, index, all) => all.indexOf(path) === index);
  if (unknown.length > 0) return `Template contains unknown merge fields: ${unknown.join(', ')}`;
  const flowOwned = [
    ...templateVariablesUsed(template.subject),
    ...templateVariablesUsed(template.bodyMarkdown),
  ].filter((path, index, all) => FLOW_OWNED_VARIABLES.has(path) && all.indexOf(path) === index);
  if (flowOwned.length > 0) {
    return `Template requires context owned by its automatic flow: ${flowOwned.join(', ')}`;
  }
  return null;
}

export async function listAgentMailTemplates(eventId: string): Promise<AgentMailTemplate[]> {
  const stored = await listTemplates(eventId);
  const storedByKey = new Map(stored.map((template) => [template.key, template]));
  const keys = new Set([...DEFAULT_TEMPLATES.map((template) => template.key), ...storedByKey.keys()]);

  return [...keys]
    .map((key): AgentMailTemplate => {
      const eventTemplate = storedByKey.get(key);
      const fallback = DEFAULT_TEMPLATES.find((template) => template.key === key);
      if (!eventTemplate && !fallback) throw new Error(`Template ${key} disappeared while listing`);
      const attachIcs = eventTemplate?.attachIcs ?? fallback?.attachIcs ?? false;
      const enabled = eventTemplate?.enabled ?? true;
      const subject = eventTemplate?.subject ?? fallback!.subject;
      const bodyMarkdown = eventTemplate?.bodyMarkdown ?? fallback!.bodyMarkdown;
      const agentSendBlockedReason = sendBlockedReason({
        enabled,
        attachIcs,
        subject,
        bodyMarkdown,
      });
      return {
        key,
        name: eventTemplate?.name ?? fallback!.name,
        subject,
        bodyMarkdown,
        enabled,
        attachIcs,
        source: eventTemplate ? 'event' : 'default',
        updatedAt: toIso(eventTemplate?.updatedAt),
        agentSendable: agentSendBlockedReason === null,
        agentSendBlockedReason,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

async function requireAgentMailTemplate(eventId: string, key: string): Promise<AgentMailTemplate> {
  const eventTemplate = await getTemplate(eventId, key);
  const fallback = DEFAULT_TEMPLATES.find((template) => template.key === key);
  if (!eventTemplate && !fallback) throw notFound('Template');
  const attachIcs = eventTemplate?.attachIcs ?? fallback?.attachIcs ?? false;
  const enabled = eventTemplate?.enabled ?? true;
  const subject = eventTemplate?.subject ?? fallback!.subject;
  const bodyMarkdown = eventTemplate?.bodyMarkdown ?? fallback!.bodyMarkdown;
  const blockedReason = sendBlockedReason({ enabled, attachIcs, subject, bodyMarkdown });
  if (blockedReason) throw invalid(blockedReason);
  return {
    key,
    name: eventTemplate?.name ?? fallback!.name,
    subject,
    bodyMarkdown,
    enabled: true,
    attachIcs: false,
    source: eventTemplate ? 'event' : 'default',
    updatedAt: toIso(eventTemplate?.updatedAt),
    agentSendable: true,
    agentSendBlockedReason: null,
  };
}

export type AgentMailPreview = {
  channel: 'email';
  recipient: {
    participantId: string;
    name: string;
    email: string;
    notifyEmail: true;
  };
  template: AgentMailTemplate;
  rendered: {
    subject: string;
    bodyText: string;
    missingVariables: string[];
    unknownVariables: string[];
    dynamicFields: string[];
  };
  confirmation: {
    literal: string;
    digest: string;
    sendArguments: {
      participantId: string;
      recipientEmail: string;
      templateKey: string;
      subject: string;
      bodyMarkdown: string;
      renderedSubject: string;
      renderedBodyText: string;
      confirmation: string;
      confirmationDigest: string;
    };
  };
};

function confirmationLiteral(name: string, email: string): string {
  return `${AGENT_MAIL_CONFIRMATION_PREFIX}${name} <${email}>`;
}

function digestPayload(
  eventId: string,
  template: AgentMailTemplate,
  preview: Awaited<ReturnType<typeof previewParticipantEmail>>,
): string {
  // Fixed key order is intentional. This is a content fingerprint, not a serialized API payload.
  return JSON.stringify({
    version: 1,
    eventId,
    channel: 'email',
    participantId: preview.recipient.participantId,
    userId: preview.recipient.userId,
    recipientName: preview.recipient.name,
    recipientEmail: preview.recipient.email,
    notifyEmail: preview.recipient.notifyEmail,
    templateKey: template.key,
    templateSource: template.source,
    templateUpdatedAt: template.updatedAt,
    subjectSource: template.subject,
    bodyMarkdownSource: template.bodyMarkdown,
    renderedSubject: preview.message.subject,
    renderedBodyText: preview.message.text,
    missingVariables: preview.message.missing,
    unknownVariables: preview.unknown,
    dynamicFields: preview.dynamicFields,
  });
}

export async function previewAgentMail(input: {
  eventId: string;
  participantId: string;
  templateKey: string;
}): Promise<AgentMailPreview> {
  const template = await requireAgentMailTemplate(input.eventId, input.templateKey);
  const preview = await previewParticipantEmail({
    eventId: input.eventId,
    participantId: input.participantId,
    subject: template.subject,
    bodyMarkdown: template.bodyMarkdown,
  });
  const literal = confirmationLiteral(preview.recipient.name, preview.recipient.email);
  const digest = await hashToken(digestPayload(input.eventId, template, preview));
  return {
    channel: 'email',
    recipient: {
      participantId: preview.recipient.participantId,
      name: preview.recipient.name,
      email: preview.recipient.email,
      notifyEmail: true,
    },
    template,
    rendered: {
      subject: preview.message.subject,
      bodyText: preview.message.text,
      missingVariables: preview.message.missing,
      unknownVariables: preview.unknown,
      dynamicFields: preview.dynamicFields,
    },
    confirmation: {
      literal,
      digest,
      sendArguments: {
        participantId: preview.recipient.participantId,
        recipientEmail: preview.recipient.email,
        templateKey: template.key,
        subject: template.subject,
        bodyMarkdown: template.bodyMarkdown,
        renderedSubject: preview.message.subject,
        renderedBodyText: preview.message.text,
        confirmation: literal,
        confirmationDigest: digest,
      },
    },
  };
}

export async function sendConfirmedAgentMail(input: {
  eventId: string;
  participantId: string;
  recipientEmail: string;
  templateKey: string;
  subject: string;
  bodyMarkdown: string;
  renderedSubject: string;
  renderedBodyText: string;
  confirmation: string;
  confirmationDigest: string;
}) {
  // Rebuild the entire preview immediately before dispatch. A template edit, recipient reassignment,
  // address change, preference change, or copy change invalidates the earlier confirmation.
  const current = await previewAgentMail({
    eventId: input.eventId,
    participantId: input.participantId,
    templateKey: input.templateKey,
  });
  if (input.confirmation !== current.confirmation.literal) {
    throw invalid(`Confirmation must exactly equal: ${current.confirmation.literal}`);
  }
  if (!timingSafeEqual(input.confirmationDigest, current.confirmation.digest)) {
    throw invalid('The preview no longer matches this recipient or message; preview it again');
  }
  if (input.subject !== current.template.subject || input.bodyMarkdown !== current.template.bodyMarkdown) {
    throw invalid('The message source no longer matches the confirmed preview; preview it again');
  }
  if (
    input.recipientEmail !== current.recipient.email ||
    input.renderedSubject !== current.rendered.subject ||
    input.renderedBodyText !== current.rendered.bodyText
  ) {
    throw invalid('The resolved recipient or message no longer matches the confirmed preview');
  }

  const sent = await sendParticipantEmail({
    eventId: input.eventId,
    participantId: input.participantId,
    subject: input.subject,
    bodyMarkdown: input.bodyMarkdown,
    templateKey: input.templateKey,
    expectedRecipientEmail: input.recipientEmail,
    expectedPreviewSubject: input.renderedSubject,
    expectedPreviewBodyText: input.renderedBodyText,
  });
  return {
    channel: 'email' as const,
    recipient: sent.recipient,
    templateKey: input.templateKey,
    subject: sent.message.subject,
    bodyText: sent.message.text,
    logId: sent.logId,
    sent: sent.sent,
  };
}

/** Metadata only: message bodies and attachments can contain one-click credentials. */
export async function listAgentMailDeliveries(eventId: string, limit: number) {
  const rows = await listMail({ eventId, limit });
  return {
    contentRedacted: true as const,
    deliveries: rows.map((row) => ({
      id: row.id,
      toEmail: row.toEmail,
      fromEmail: row.fromEmail,
      subject: row.subject,
      templateKey: row.templateKey,
      status: row.status,
      error: row.error,
      sentAt: toIso(row.sentAt),
      createdAt: toIso(row.createdAt)!,
    })),
  };
}
