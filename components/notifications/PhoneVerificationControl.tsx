'use client';

import { useState, useTransition } from 'react';
import { Button, Input } from '@/components/ui';

type ApiError = { error?: { message?: string } };

async function bodyOf(response: Response) {
  return (await response.json()) as ApiError & {
    data?: { phone: string; mode?: 'log' | 'twilio'; logCode?: string; verifiedAt?: string };
  };
}

export function PhoneVerificationControl({
  phone,
  verified,
  onVerified,
}: {
  phone: string;
  verified: boolean;
  onVerified(phone: string): void;
}) {
  const [pending, startTransition] = useTransition();
  const [requestedPhone, setRequestedPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [logCode, setLogCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (verified) {
    return <p role="status">Verified for text messages.</p>;
  }

  const request = () =>
    startTransition(async () => {
      setMessage(null);
      const response = await fetch('/api/notifications/phone-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body = await bodyOf(response);
      if (!response.ok || !body.data) {
        setMessage(body.error?.message ?? 'Could not send a verification code');
        return;
      }
      setRequestedPhone(body.data.phone);
      setLogCode(body.data.logCode ?? null);
      setMessage(
        body.data.mode === 'log'
          ? 'Development mode: no SMS was sent. Use the code shown below.'
          : `Code sent to ${body.data.phone}.`,
      );
    });

  const confirm = () =>
    startTransition(async () => {
      setMessage(null);
      const response = await fetch('/api/notifications/phone-verification', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: requestedPhone ?? phone, code }),
      });
      const body = await bodyOf(response);
      if (!response.ok || !body.data) {
        setMessage(body.error?.message ?? 'That code could not be verified');
        return;
      }
      onVerified(body.data.phone);
      setMessage('Phone number verified.');
    });

  return (
    <div>
      {requestedPhone ? (
        <>
          <label>
            <span>Verification code</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </label>
          {logCode ? <p>Development code: <code>{logCode}</code></p> : null}
          <Button type="button" loading={pending} disabled={code.length !== 6} onClick={confirm}>
            Verify code
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={request}>
            Send a new code
          </Button>
        </>
      ) : (
        <Button type="button" disabled={!phone.trim()} loading={pending} onClick={request}>
          Verify phone
        </Button>
      )}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
