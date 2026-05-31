export class RuleError extends Error {
  status: number;
  field?: string;

  constructor(message: string, options?: { status?: number; field?: string }) {
    super(message);
    this.name = "RuleError";
    this.status = options?.status ?? 400;
    this.field = options?.field;
  }
}

export function isRuleError(error: unknown): error is RuleError {
  return error instanceof RuleError;
}
