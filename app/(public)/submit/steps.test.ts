import { describe, expect, it } from 'vitest';
import { buildSteps } from './shared';

/**
 * `P-2`. The stage list is the part of the public flow that has actually been wrong: Welcome was
 * static copy rendered outside the machine, Participant did not exist at all, and the Account stage
 * vanished for a signed-in submitter while the stepper still counted as though it had not.
 *
 * These assert the shape, not the rendering — `buildSteps` lives in `shared.ts` precisely so the
 * machine can be checked without a renderer.
 */

const kinds = (steps: ReturnType<typeof buildSteps>) => steps.map((step) => step.kind);

describe('buildSteps', () => {
  it('is the brief’s five stages, in the brief’s order', () => {
    expect(
      kinds(
        buildSteps({
          showWelcome: true,
          signedIn: false,
          fieldSteps: [0],
          collectsParticipants: true,
        }),
      ),
    ).toEqual(['welcome', 'account', 'fields', 'participant', 'review']);
  });

  /**
   * Skipping Account for someone already signed in is correct. What was not correct was a stepper
   * that still said one thing while the flow did another — so the list itself shortens, and every
   * "step N of M" downstream is derived from it.
   */
  it('drops the account stage for a signed-in submitter', () => {
    const steps = buildSteps({
      showWelcome: true,
      signedIn: true,
      fieldSteps: [0],
      collectsParticipants: true,
    });
    expect(kinds(steps)).toEqual(['welcome', 'fields', 'participant', 'review']);
    expect(steps).toHaveLength(4);
  });

  /** `F-4`: the participant toggle removes a whole stage, not just a block inside one. */
  it('drops the participant stage when the form does not collect participants', () => {
    expect(
      kinds(
        buildSteps({
          showWelcome: true,
          signedIn: false,
          fieldSteps: [0],
          collectsParticipants: false,
        }),
      ),
    ).toEqual(['welcome', 'account', 'fields', 'review']);
  });

  /** `F-9`: hiding the welcome copy hides the stage; a stage with nothing on it is worse than none. */
  it('drops the welcome stage when there is nothing to show on it', () => {
    expect(
      kinds(
        buildSteps({
          showWelcome: false,
          signedIn: false,
          fieldSteps: [0],
          collectsParticipants: true,
        }),
      ),
    ).toEqual(['account', 'fields', 'participant', 'review']);
  });

  it('gives a multi-step form one stage per step, in order', () => {
    const steps = buildSteps({
      showWelcome: false,
      signedIn: true,
      fieldSteps: [0, 1, 2],
      collectsParticipants: false,
    });
    expect(kinds(steps)).toEqual(['fields', 'fields', 'fields', 'review']);
    expect(steps.flatMap((step) => (step.kind === 'fields' ? [step.step] : []))).toEqual([0, 1, 2]);
  });

  /**
   * A form whose every question is conditionally hidden still gets a submission stage. Without this
   * the submitter is dropped from Welcome straight into Review, which reads as the form having eaten
   * their answers.
   */
  it('always keeps a submission stage, even with no visible questions', () => {
    expect(
      kinds(
        buildSteps({
          showWelcome: false,
          signedIn: true,
          fieldSteps: [],
          collectsParticipants: false,
        }),
      ),
    ).toEqual(['fields', 'review']);
  });

  it('degrades to two stages for the most stripped-down form there is', () => {
    expect(
      kinds(
        buildSteps({
          showWelcome: false,
          signedIn: true,
          fieldSteps: [0],
          collectsParticipants: false,
        }),
      ),
    ).toEqual(['fields', 'review']);
  });
});
