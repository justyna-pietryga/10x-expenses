export class SummaryError extends Error {
  status: number;
  field?: string;

  constructor(message: string, options?: { status?: number; field?: string }) {
    super(message);
    this.name = "SummaryError";
    this.status = options?.status ?? 400;
    this.field = options?.field;
  }
}

export function isSummaryError(error: unknown): error is SummaryError {
  return error instanceof SummaryError;
}
