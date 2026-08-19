export interface LogContext {
  service: string;
  component?: string;
}

export function formatLogContext(context: LogContext): string {
  return context.component ? `${context.service}:${context.component}` : context.service;
}
