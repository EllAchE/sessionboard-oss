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
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="7"
        fill="var(--border-strong)"
      />
      <rect
        x="5"
        y="5"
        width="54"
        height="54"
        rx="5"
        fill="var(--surface-raised)"
      />
      <path
        fill="var(--accent)"
        d="M15.5 15.5h33v3h-33zM15.5 45.5h33v3h-33zM15.5 15.5h3v33h-3zM25.5 15.5h3v33h-3zM35.5 15.5h3v33h-3zM45.5 15.5h3v33h-3z"
      />
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
