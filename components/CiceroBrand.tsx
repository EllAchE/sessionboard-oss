import styles from './cicero-brand.module.css';

export function CiceroMark({
  className,
  size = 24,
  title,
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M50 9H34C19.6 9 8 19.3 8 32s11.6 23 26 23h16v-6H35c-10.9 0-20-7.6-20-17s9.1-17 20-17h15V9Z"
        fill="currentColor"
      />
      <path
        d="M45 21H35c-7.2 0-13 4.9-13 11s5.8 11 13 11h10v-5H35c-4.2 0-7-2.7-7-6s2.8-6 7-6h10v-5Z"
        fill="currentColor"
      />
      <path d="M43 27h11v10H43z" fill="var(--accent)" />
    </svg>
  );
}

export function CiceroBrand({
  className,
  markSize = 24,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <span className={`${styles.lockup} ${className ?? ''}`}>
      <CiceroMark size={markSize} />
      <span className={styles.wordmark}>Cicero</span>
    </span>
  );
}
