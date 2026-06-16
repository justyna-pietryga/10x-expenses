import { ImportError } from "@/lib/imports/errors";
import {
  inferCashflowTypeFromAmount,
  type CashflowType,
  type ImportedTransactionDraft,
  type SupportedBank,
} from "@/lib/imports/types";
import type { RuleMatchField } from "@/lib/rules/validation";

export interface ImportCommitPayload {
  bank: SupportedBank;
  confirm_replace: boolean;
  period_end: string;
  period_start: string;
  source_filename: string | null;
  statement_month: string;
  transactions: ImportedTransactionDraft[];
}

export interface ImportReviewUpdate {
  category_id: string | null;
  is_included: boolean;
  transaction_id: string;
}

export interface ImportReviewUpdatesPayload {
  updates: {
    category_id: string | null;
    is_included: boolean;
    transaction_id: string;
  }[];
}

export type ImportCategoryUpdatePayload = ImportReviewUpdatesPayload;

export interface ImportReviewRulePayload {
  apply_now: boolean;
  category_id: string | null;
  dirty_transaction_ids: string[];
  match_field: RuleMatchField;
  match_text: string;
  transaction_id: string;
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

function validateCashflowType(value: unknown, field: string): CashflowType {
  if (typeof value !== "string") {
    throw new ImportError(`${field} must be expense, income, reimbursement, or transfer`, { field });
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "expense" ||
    normalized === "income" ||
    normalized === "reimbursement" ||
    normalized === "transfer"
  ) {
    return normalized;
  }

  throw new ImportError(`${field} must be expense, income, reimbursement, or transfer`, { field });
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
  const amount = validateAmount(record.amount);

  return {
    amount,
    cashflow_type:
      record.cashflow_type == null
        ? inferCashflowTypeFromAmount(amount)
        : validateCashflowType(record.cashflow_type, `transactions[${index}].cashflow_type`),
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

export function validateImportReviewUpdatePayload(
  payload: unknown,
  options?: { defaultTransactionId?: string },
): ImportReviewUpdate {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ImportError("Review update payload must be an object", { field: "payload" });
  }

  return validateImportReviewUpdate(payload, undefined, {
    allowSaveRule: true,
    defaultTransactionId: options?.defaultTransactionId,
  });
}

export function validateImportReviewUpdatesPayload(payload: unknown): ImportReviewUpdatesPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ImportError("Bulk review update payload must be an object", { field: "payload" });
  }

  const record = payload as Record<string, unknown>;

  if ("save_rule" in record) {
    throw new ImportError("Bulk review updates cannot create rules", { field: "save_rule" });
  }

  if (!Array.isArray(record.updates) || record.updates.length === 0) {
    throw new ImportError("updates must contain at least one transaction review change", { field: "updates" });
  }

  return {
    updates: record.updates.map((update, index) => validateImportReviewUpdate(update, index)),
  };
}

export const validateImportCategoryUpdatesPayload = validateImportReviewUpdatesPayload;

function validateBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new ImportError(`${field} must be a boolean`, { field });
  }

  return value;
}

function validateIncludedFlag(value: unknown, field: string) {
  if (value === undefined) {
    return true;
  }

  return validateBoolean(value, field);
}

function validateMatchField(value: unknown): RuleMatchField {
  if (typeof value !== "string") {
    throw new ImportError("match_field is required", { field: "match_field" });
  }

  const matchField = value.trim().toLowerCase();

  if (matchField === "recipient" || matchField === "title" || matchField === "both") {
    return matchField;
  }

  throw new ImportError("match_field must be recipient, title, or both", { field: "match_field" });
}

function validateTransactionIds(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new ImportError(`${field} must be an array`, { field });
  }

  return Array.from(new Set(value.map((entry, index) => validateText(entry, `${field}[${index}]`))));
}

export function validateImportReviewRulePayload(payload: unknown): ImportReviewRulePayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ImportError("Review rule payload must be an object", { field: "payload" });
  }

  const record = payload as Record<string, unknown>;

  return {
    apply_now: validateBoolean(record.apply_now, "apply_now"),
    category_id: validateImportCategoryId(record.category_id),
    dirty_transaction_ids: validateTransactionIds(record.dirty_transaction_ids ?? [], "dirty_transaction_ids"),
    match_field: validateMatchField(record.match_field),
    match_text: validateText(record.match_text, "match_text"),
    transaction_id: validateText(record.transaction_id, "transaction_id"),
  };
}

function validateImportReviewUpdate(
  update: unknown,
  index?: number,
  options?: { allowSaveRule?: boolean; defaultTransactionId?: string },
): ImportReviewUpdate {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    if (index === undefined) {
      throw new ImportError("Review update payload must be an object", { field: "payload" });
    }

    throw new ImportError(`updates[${index}] must be an object`, { field: "updates" });
  }

  const record = update as Record<string, unknown>;
  const prefix = index === undefined ? "" : `updates[${index}].`;

  if ("save_rule" in record && !options?.allowSaveRule) {
    throw new ImportError("Bulk review updates cannot create rules", {
      field: index === undefined ? "save_rule" : `updates[${index}].save_rule`,
    });
  }

  return {
    category_id:
      record.category_id == null || record.category_id === ""
        ? null
        : validateText(record.category_id, `${prefix}category_id`),
    is_included: validateIncludedFlag(record.is_included, `${prefix}is_included`),
    transaction_id: validateText(record.transaction_id ?? options?.defaultTransactionId, `${prefix}transaction_id`),
  };
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
