export type FormState = {
  status: 'idle' | 'ok' | 'error';
  message?: string;
  /** Field-keyed messages, straight from `AppError.details`. */
  details?: Record<string, string>;
};

export const IDLE_STATE: FormState = { status: 'idle' };
