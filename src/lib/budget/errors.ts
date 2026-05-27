export class BudgetError extends Error {
  status: number;
  field?: string;

  constructor(message: string, options?: { status?: number; field?: string }) {
    super(message);
    this.name = "BudgetError";
    this.status = options?.status ?? 400;
    this.field = options?.field;
  }
}

export function isBudgetError(error: unknown): error is BudgetError {
  return error instanceof BudgetError;
}
