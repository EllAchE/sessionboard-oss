'use client';

import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent } from 'react';
import { cn } from '../cn';
import styles from './ScoreStars.module.css';

interface ScoreStarsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: number;
  max?: number;
  readOnly?: boolean;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

function ScoreStars({
  value,
  max = 5,
  readOnly = true,
  onChange,
  size = 'md',
  label = 'Judgment score',
  className,
  ...rest
}: ScoreStarsProps) {
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  if (readOnly) {
    return (
      <div
        role="img"
        aria-label={`${label}: ${value} out of ${max}`}
        className={cn(styles.root, styles[size], className)}
        {...rest}
      >
        {stars.map((starIndex) => {
          const fillFraction = Math.max(0, Math.min(1, value - (starIndex - 1)));
          return (
            <span key={starIndex} className={styles.starBox}>
              <Star className={styles.starEmpty} aria-hidden="true" />
              {fillFraction > 0 ? (
                <span className={styles.starClip} style={{ width: `${fillFraction * 100}%` }}>
                  <Star className={styles.starFilled} aria-hidden="true" />
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <InteractiveScoreStars
      value={value}
      max={max}
      onChange={onChange}
      size={size}
      label={label}
      className={className}
      stars={stars}
      {...rest}
    />
  );
}

interface InteractiveScoreStarsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: number;
  max: number;
  onChange?: (value: number) => void;
  size: 'sm' | 'md' | 'lg';
  label: string;
  stars: number[];
}

function InteractiveScoreStars({
  value,
  max,
  onChange,
  size,
  label,
  className,
  stars,
  ...rest
}: InteractiveScoreStarsProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(() => clampIndex(value, max));

  useEffect(() => {
    setFocusIndex(clampIndex(value, max));
  }, [value, max]);

  const commitValue = (next: number) => {
    const clamped = Math.max(1, Math.min(max, next));
    setFocusIndex(clamped - 1);
    onChange?.(clamped);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, starValue: number) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        commitValue(starValue - 1);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        commitValue(starValue + 1);
        break;
      case 'Home':
        e.preventDefault();
        commitValue(1);
        break;
      case 'End':
        e.preventDefault();
        commitValue(max);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(styles.root, styles[size], className)}
      onMouseLeave={() => setHoverValue(null)}
      {...rest}
    >
      {stars.map((starValue) => {
        const isChecked = value === starValue;
        const isTabbable = focusIndex === starValue - 1;
        const isFilled = (hoverValue ?? value) >= starValue;
        return (
          <button
            key={starValue}
            type="button"
            role="radio"
            aria-checked={isChecked}
            aria-label={`${starValue} out of ${max}`}
            tabIndex={isTabbable ? 0 : -1}
            className={styles.starButton}
            onMouseEnter={() => setHoverValue(starValue)}
            onFocus={() => setFocusIndex(starValue - 1)}
            onClick={() => commitValue(starValue)}
            onKeyDown={(e) => handleKeyDown(e, starValue)}
          >
            <Star className={isFilled ? styles.starFilled : styles.starEmpty} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function clampIndex(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, value - 1));
}

export { ScoreStars };
export type { ScoreStarsProps };
