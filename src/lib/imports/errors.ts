export class ImportError extends Error {
  status: number;
  field?: string;

  constructor(message: string, options?: { status?: number; field?: string }) {
    super(message);
    this.name = "ImportError";
    this.status = options?.status ?? 400;
    this.field = options?.field;
  }
}

export function isImportError(error: unknown): error is ImportError {
  return error instanceof ImportError;
}
