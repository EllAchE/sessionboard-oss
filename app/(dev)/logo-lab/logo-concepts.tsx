import type { ReactNode, SVGProps } from 'react';

type LogoMarkProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>;

function Mark({ children, ...props }: LogoMarkProps & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      {children}
    </svg>
  );
}

function ForumMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path fill="currentColor" d="M2 12.5 16 3l14 9.5v2.75H2z" />
      <path
        fill="currentColor"
        d="M5 16.75h5v9H5zm8.5 0h5v9h-5zm8.5 0h5v9h-5zM3 27.25h26v2H3zM1 30h30v2H1z"
      />
    </Mark>
  );
}

function ArchMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M3 31V15.5C3 8.044 8.82 2 16 2s13 6.044 13 13.5V31h-8V16c0-3.314-2.239-6-5-6s-5 2.686-5 6v15H3Z"
        clipRule="evenodd"
      />
    </Mark>
  );
}

function CuriaMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path fill="currentColor" d="M4 4h24v5H4zM2 10.5h28V14H2zM4 28h24v3H4z" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M6 15.5h20V28H6V15.5Zm6 12.5v-6.25a4 4 0 0 1 8 0V28h-8Z"
        clipRule="evenodd"
      />
    </Mark>
  );
}

function AmphitheatreMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="square"
        d="M3.5 5.5v6.25C3.5 20.448 9.096 27.5 16 27.5s12.5-7.052 12.5-15.75V5.5M10 6v6.5c0 4.142 2.686 7.5 6 7.5s6-3.358 6-7.5V6m-6 0v7"
      />
    </Mark>
  );
}

function RostrumMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path fill="currentColor" d="M4 4h17l7 6-7 6H4z" />
      <path fill="currentColor" d="M10 17.5h12V26h5v3H5v-3h5zM3 30.5h26V32H3z" />
      <path fill="currentColor" d="m22.5 5.5 5.75-4 1.75 2.5-5.75 4z" />
    </Mark>
  );
}

function ForumSealMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <circle cx="16" cy="16" r="13.25" stroke="currentColor" strokeWidth="2.5" />
      <path fill="currentColor" d="m7 13 9-6 9 6v2H7zM9 24h14v2H9z" />
      <path fill="currentColor" d="M9.5 16.5h3V23h-3zm5 0h3V23h-3zm5 0h3V23h-3z" />
    </Mark>
  );
}

function ColonnadeCMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
        d="M26.5 6H15C8.925 6 4 10.477 4 16s4.925 10 11 10h11.5"
      />
      <path fill="currentColor" d="M14 11h4v10h-4zM11.5 9h9v2h-9zm0 12h9v2h-9z" />
    </Mark>
  );
}

function AssemblyMark(props: LogoMarkProps) {
  return (
    <Mark {...props}>
      <path fill="currentColor" d="M13 12h6v8h-6zM11 8h10v3H11zm0 13h10v3H11z" />
      <path
        fill="currentColor"
        d="M2 4h8v5H7v4H2zm20 0h8v9h-5V9h-3zM2 19h5v4h3v5H2zm23 0h5v9h-8v-5h3z"
      />
      <circle cx="5" cy="16" r="2.5" fill="currentColor" />
      <circle cx="27" cy="16" r="2.5" fill="currentColor" />
    </Mark>
  );
}

export const LOGO_CONCEPTS = [
  {
    id: '01',
    name: 'The Forum',
    idea: 'A bold civic façade with three unmistakable columns.',
    Mark: ForumMark,
  },
  {
    id: '02',
    name: 'The Arch',
    idea: 'A single monumental form with strong favicon recognition.',
    Mark: ArchMark,
  },
  {
    id: '03',
    name: 'The Curia',
    idea: 'An assembly hall built around an open, welcoming doorway.',
    Mark: CuriaMark,
  },
  {
    id: '04',
    name: 'The Theatre',
    idea: 'A top-down forum: audience, speaker, and shared center.',
    Mark: AmphitheatreMark,
  },
  {
    id: '05',
    name: 'The Rostrum',
    idea: 'The place where a proposal becomes a public address.',
    Mark: RostrumMark,
  },
  {
    id: '06',
    name: 'The Civic Seal',
    idea: 'A more institutional forum mark contained in a roundel.',
    Mark: ForumSealMark,
  },
  {
    id: '07',
    name: 'The Colonnade C',
    idea: 'A Cicero monogram with a column at its center.',
    Mark: ColonnadeCMark,
  },
  {
    id: '08',
    name: 'The Assembly',
    idea: 'A speaker in the middle of a four-sided civic gathering.',
    Mark: AssemblyMark,
  },
] as const;
