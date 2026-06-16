export type SupportedBank = "revolut" | "ing";
export type CashflowType = "expense" | "income" | "reimbursement" | "transfer";

export function inferCashflowTypeFromAmount(amount: number): CashflowType {
  return amount < 0 ? "expense" : "income";
}

export interface ImportedTransactionDraft {
  transaction_date: string;
  title: string;
  recipient: string;
  amount: number;
  cashflow_type: CashflowType;
}

export interface ParsedImportCsv {
  period_end: string;
  period_start: string;
  statement_month: string;
  transactions: ImportedTransactionDraft[];
}
