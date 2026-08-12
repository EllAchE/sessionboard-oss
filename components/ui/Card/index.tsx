import type { HTMLAttributes } from 'react';
import { cn } from '../cn';
import styles from './Card.module.css';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  elevated?: boolean;
}

function Card({ padding = 'md', elevated = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(styles.root, styles[padding], elevated && styles.elevated, className)}
      {...rest}
    />
  );
}
Card.displayName = 'Card';

function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.header, className)} {...rest} />;
}
CardHeader.displayName = 'CardHeader';

function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.body, className)} {...rest} />;
}
CardBody.displayName = 'CardBody';

function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.footer, className)} {...rest} />;
}
CardFooter.displayName = 'CardFooter';

function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn(styles.title, className)} {...rest} />;
}
CardTitle.displayName = 'CardTitle';

function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn(styles.description, className)} {...rest} />;
}
CardDescription.displayName = 'CardDescription';

export { Card, CardHeader, CardBody, CardFooter, CardTitle, CardDescription };
export type { CardProps };
