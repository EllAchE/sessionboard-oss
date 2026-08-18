import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PortalRedirect } from './PortalRedirect';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * `CFP-S1`. The confirmation page used to leave for the portal after five seconds, and an evaluator
 * who submitted a proposal and looked at the result found the portal — reporting that the product
 * confirms a submission in no way at all. It had confirmed it, and then thrown the confirmation
 * away while they were reading it.
 *
 * The countdown runs on a timer, so these assert the first paint rather than the passage of time:
 * how long it says it is giving, and that stopping it is offered at all.
 */
describe('PortalRedirect', () => {
  it('gives long enough to read a confirmation, not five seconds', () => {
    const html = renderToStaticMarkup(<PortalRedirect to="/portal/devflow-conf-2027" />);

    expect(html).toContain('in 20 seconds');
  });

  it('offers a way to stop it', () => {
    const html = renderToStaticMarkup(<PortalRedirect to="/portal/devflow-conf-2027" />);

    expect(html).toContain('Stay on this page');
  });

  /**
   * `F-11` asks for the auto-redirect, so stopping it is a choice the reader makes and never the
   * default. A submitter who closes the laptop still lands in the portal.
   */
  it('still counts down on its own', () => {
    const html = renderToStaticMarkup(<PortalRedirect to="/portal/devflow-conf-2027" />);

    expect(html).toContain('Taking you to your speaker portal');
  });

  /** The countdown is announced, because it changes under a reader who is not watching for it. */
  it('announces itself to a screen reader', () => {
    const html = renderToStaticMarkup(<PortalRedirect to="/portal/devflow-conf-2027" />);

    expect(html).toContain('aria-live="polite"');
  });

  it('says one second rather than 1 seconds when it gets there', () => {
    const html = renderToStaticMarkup(<PortalRedirect to="/portal/devflow-conf-2027" seconds={1} />);

    expect(html).toContain('in 1 second');
    expect(html).not.toContain('in 1 seconds');
  });
});
