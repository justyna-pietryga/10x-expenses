import { ImportError } from "@/lib/imports/errors";
import type { ImportedTransactionDraft, SupportedBank } from "@/lib/imports/types";

export interface ImportCommitPayload {
  bank: SupportedBank;
  confirm_replace: boolean;
  period_end: string;
  period_start: string;
  source_filename: string | null;
  statement_month: string;
  transactions: ImportedTransactionDraft[];
}

function validateDate(value: unknown, field: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new ImportError(`${field} must use YYYY-MM-DD format`, { field });
  }

  return value.trim();
}

function validateText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ImportError(`${field} is required`, { field });
  }

  return value.trim();
}

function validateAmount(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(amount)) {
    throw new ImportError("amount must be a valid number", { field: "amount" });
  }

  return amount;
}

export function validateSupportedBank(value: unknown): SupportedBank {
  if (typeof value !== "string") {
    throw new ImportError("bank is required", { field: "bank" });
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "revolut" || normalized === "ing") {
    return normalized;
  }

  throw new ImportError("Only Revolut and ING CSV imports are supported in this phase", { field: "bank" });
}

export function validateCsvUpload(value: unknown) {
  if (!(value instanceof File)) {
    throw new ImportError("A CSV file is required", { field: "file" });
  }

  if (!value.name.toLowerCase().endsWith(".csv")) {
    throw new ImportError("The uploaded file must use the .csv extension", { field: "file" });
  }

  const contentType = value.type.toLowerCase();
  if (contentType && !["text/csv", "application/vnd.ms-excel"].includes(contentType)) {
    throw new ImportError("The uploaded file must be a CSV export", { field: "file" });
  }

  if (value.size === 0) {
    throw new ImportError("The uploaded CSV file is empty", { field: "file" });
  }

  return value;
}

export function validateImportCommitPayload(payload: unknown): ImportCommitPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ImportError("Import commit payload must be an object", { field: "payload" });
  }

  const record = payload as Record<string, unknown>;
  const transactionsValue = record.transactions;

  if (!Array.isArray(transactionsValue) || transactionsValue.length === 0) {
    throw new ImportError("transactions must contain at least one imported row", { field: "transactions" });
  }

  return {
    bank: validateSupportedBank(record.bank),
    confirm_replace: validateRuleOptIn(record.confirm_replace),
    period_end: validateDate(record.period_end, "period_end"),
    period_start: validateDate(record.period_start, "period_start"),
    source_filename: record.source_filename == null ? null : validateText(record.source_filename, "source_filename"),
    statement_month: validateDate(record.statement_month, "statement_month"),
    transactions: transactionsValue.map((transaction, index) => validateImportedTransactionDraft(transaction, index)),
  };
}

function validateImportedTransactionDraft(transaction: unknown, index: number): ImportedTransactionDraft {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    throw new ImportError(`transactions[${index}] must be an object`, { field: "transactions" });
  }

  const record = transaction as Record<string, unknown>;

  return {
    amount: validateAmount(record.amount),
    recipient: validateText(record.recipient, `transactions[${index}].recipient`),
    title: validateText(record.title, `transactions[${index}].title`),
    transaction_date: validateDate(record.transaction_date, `transactions[${index}].transaction_date`),
  };
}

export function requirePathId(id: string | undefined, field = "id") {
  if (!id) {
    throw new ImportError(`${field} is required`, { status: 400, field });
  }

  return id;
}

export function validateImportCategoryId(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  return validateText(value, "category_id");
}

export function validateRuleOptIn(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
  }

  return false;
}
