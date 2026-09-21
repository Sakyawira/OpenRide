import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({ type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} {...props} />;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

export interface NoticeProps extends HTMLAttributes<HTMLParagraphElement> {
  warning?: boolean;
}
export function Notice({ warning = false, className = '', ...props }: NoticeProps) {
  return (
    <p
      role={warning ? 'alert' : 'status'}
      className={`notice ${warning ? 'error' : ''} ${className}`}
      {...props}
    />
  );
}

export interface JourneyCardProps {
  badge: string;
  detail: string;
  pickup: string;
  destination: string;
  amount: string;
  note: string;
  action?: ReactNode;
}

export function JourneyCard({
  badge,
  detail,
  pickup,
  destination,
  amount,
  note,
  action,
}: JourneyCardProps) {
  return (
    <article className="journey">
      <div className="card-top">
        <Badge>{badge}</Badge>
        <span>{detail}</span>
      </div>
      <h2>
        {pickup}
        <span className="to">↓</span>
        {destination}
      </h2>
      <div className="card-bottom">
        <strong>{amount}</strong>
        <span>{note}</span>
      </div>
      {action}
    </article>
  );
}

export function TripPanel({ children }: { children: ReactNode }) {
  return <aside className="trip-panel">{children}</aside>;
}
