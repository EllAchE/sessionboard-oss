import { eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { user } from '../../db/schema';
import { invalid, isAppError, notFound } from '../errors';
import { personNameColumns, splitPersonName } from '../person-name';
import { parseSpeakerName } from '../speaker-name';

/** Account identity is global: the same name and sign-in address follow a person across events. */
export type AccountProfile = {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
};

export type AccountNameInput = {
  firstName: string;
  lastName: string;
};

export async function getAccountProfile(userId: string): Promise<AccountProfile> {
  const row = await getDb().query.user.findFirst({
    where: eq(user.id, userId),
    columns: { email: true, name: true, firstName: true, lastName: true },
  });
  if (!row) throw notFound('Your account');

  // Older imported accounts may predate the split name columns. Show a recoverable best guess.
  const fallback = splitPersonName(row.name);
  return {
    email: row.email,
    name: row.name ?? row.email,
    firstName: row.firstName ?? fallback.firstName ?? '',
    lastName: row.lastName ?? fallback.lastName ?? '',
  };
}

function accountNameColumns(input: AccountNameInput) {
  const details: Record<string, string> = {};
  for (const [field, value] of Object.entries(input)) {
    try {
      parseSpeakerName(value);
    } catch (error) {
      details[field] = isAppError(error) ? error.message : 'That name is not valid';
    }
  }
  if (Object.keys(details).length > 0) {
    throw invalid('Some of your details need attention', details);
  }

  const columns = personNameColumns(input);
  if (!columns.name) {
    throw invalid('Add the name you want Cicero to use', {
      firstName: 'Enter at least a first or last name',
    });
  }
  return columns;
}

export async function saveAccountProfile(
  userId: string,
  input: AccountNameInput,
): Promise<AccountProfile> {
  const names = accountNameColumns(input);
  const [updated] = await getDb()
    .update(user)
    .set({ ...names, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  if (!updated) throw notFound('Your account');

  return {
    email: updated.email,
    name: updated.name ?? updated.email,
    firstName: updated.firstName ?? '',
    lastName: updated.lastName ?? '',
  };
}
