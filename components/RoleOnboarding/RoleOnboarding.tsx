'use client';

import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FileText,
  ListChecks,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { Button, Dialog } from '@/components/ui';
import { onboardingStorageKey, type OnboardingPersona } from './model';
import styles from './role-onboarding.module.css';

type OnboardingStep = {
  title: string;
  description: string;
  icon: LucideIcon;
  points: string[];
};

type OnboardingContent = {
  eyebrow: string;
  title: string;
  description: string;
  steps: OnboardingStep[];
};

const CONTENT: Record<OnboardingPersona, OnboardingContent> = {
  organizer: {
    eyebrow: 'Organizer onboarding',
    title: 'Welcome to your command center',
    description: 'A quick orientation to the tools that move your conference from CFP to show day.',
    steps: [
      {
        title: 'Shape the event',
        description: 'Start with the details every other workflow relies on.',
        icon: CalendarDays,
        points: [
          'Set dates, venue, rooms, tracks, and formats in Settings.',
          'Switch between your events from the top bar at any time.',
        ],
      },
      {
        title: 'Open the call for speakers',
        description: 'Build the submission path your speakers will actually use.',
        icon: FileText,
        points: [
          'Create and publish a form, then share its public link.',
          'Review, score, and decide every proposal from Submissions.',
        ],
      },
      {
        title: 'Bring the program together',
        description: 'Turn accepted talks into a ready, published agenda.',
        icon: ClipboardCheck,
        points: [
          'Schedule sessions and resolve room, track, or speaker clashes.',
          'Track speaker tasks, send updates, and publish the program.',
        ],
      },
    ],
  },
  speaker: {
    eyebrow: 'Speaker onboarding',
    title: 'Welcome to your speaker portal',
    description: 'Everything your conference team needs from you lives here.',
    steps: [
      {
        title: 'Make your profile yours',
        description: 'Keep the information organizers use across the program accurate.',
        icon: UserRound,
        points: [
          'Add your bio, headshot, role, company, and public links.',
          'Choose how the conference team may contact you.',
        ],
      },
      {
        title: 'Follow your sessions',
        description: 'Your proposals and accepted talks stay together.',
        icon: CalendarCheck,
        points: [
          'Check proposal status and update a submission when edits are open.',
          'Find published times and add accepted sessions to your calendar.',
        ],
      },
      {
        title: 'Finish the details',
        description: 'Tasks and files show exactly what the organizers are waiting for.',
        icon: ListChecks,
        points: [
          'Complete requested tasks before their deadlines.',
          'Upload slides and supporting files without losing earlier versions.',
        ],
      },
    ],
  },
  attendee: {
    eyebrow: 'Attendee onboarding',
    title: 'Make the program your own',
    description: 'Explore the conference and keep the sessions you care about close at hand.',
    steps: [
      {
        title: 'Explore the program',
        description: 'Move between the full agenda and focused directories.',
        icon: Compass,
        points: [
          'Browse by time, session, speaker, or topic.',
          'Open any session for its description, speakers, and location.',
        ],
      },
      {
        title: 'Find your people',
        description: 'Learn who is speaking and where to hear them.',
        icon: Users,
        points: [
          'Search the speaker directory by name, company, or talk.',
          'Open a speaker profile to see all of their published sessions.',
        ],
      },
      {
        title: 'Build your schedule',
        description: 'Keep a lightweight itinerary in this browser.',
        icon: CalendarCheck,
        points: [
          'Save the sessions you want to attend from the program.',
          'Review your schedule and export it to your calendar.',
        ],
      },
    ],
  },
};

export function RoleOnboarding({ persona }: { persona: OnboardingPersona }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const shownWithoutStorage = useRef(false);
  const content = CONTENT[persona];
  const step = content.steps[stepIndex] ?? content.steps[0];
  const isLastStep = stepIndex === content.steps.length - 1;
  const StepIcon = step.icon;

  useEffect(() => {
    const key = onboardingStorageKey(persona);

    try {
      if (window.sessionStorage.getItem(key)) return;
      // Record the impression immediately, so refreshes and route changes cannot restart the tour.
      window.sessionStorage.setItem(key, 'seen');
    } catch {
      // Privacy settings can disable storage. Keep the experience usable without throwing or
      // repeatedly reopening it during this mounted app session.
      if (shownWithoutStorage.current) return;
      shownWithoutStorage.current = true;
    }

    setStepIndex(0);
    setOpen(true);
  }, [persona]);

  const close = () => setOpen(false);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={content.title}
      description={content.description}
      size="md"
      className={styles.dialog}
      footer={
        <div className={styles.footerActions}>
          <Button variant="ghost" onClick={close}>
            Skip tour
          </Button>
          <div className={styles.stepActions}>
            {stepIndex > 0 ? (
              <Button variant="secondary" onClick={() => setStepIndex((current) => current - 1)}>
                Back
              </Button>
            ) : null}
            <Button
              variant="primary"
              iconRight={isLastStep ? <CheckCircle2 size={16} aria-hidden="true" /> : undefined}
              onClick={() => {
                if (isLastStep) close();
                else setStepIndex((current) => current + 1);
              }}
            >
              {isLastStep ? 'Start exploring' : 'Next'}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.progressRow}>
        <span className={styles.eyebrow}>{content.eyebrow}</span>
        <span className={styles.stepCount} aria-live="polite">
          Step {stepIndex + 1} of {content.steps.length}
        </span>
      </div>

      <ol className={styles.progress} aria-label="Onboarding progress">
        {content.steps.map((candidate, index) => (
          <li
            key={candidate.title}
            className={styles.progressStep}
            data-state={index === stepIndex ? 'current' : index < stepIndex ? 'complete' : 'upcoming'}
            aria-current={index === stepIndex ? 'step' : undefined}
          >
            <span className={styles.progressDot} />
            <span className={styles.progressLabel}>{candidate.title}</span>
          </li>
        ))}
      </ol>

      <section className={styles.step} key={step.title}>
        <div className={styles.iconWrap} aria-hidden="true">
          <StepIcon size={26} strokeWidth={1.8} />
          <Sparkles className={styles.sparkle} size={13} />
        </div>
        <div className={styles.stepCopy}>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepDescription}>{step.description}</p>
          <ul className={styles.points}>
            {step.points.map((point) => (
              <li key={point}>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </Dialog>
  );
}
