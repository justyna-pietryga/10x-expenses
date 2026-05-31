export type SupportedBank = "revolut" | "ing";

export interface ImportedTransactionDraft {
  transaction_date: string;
  title: string;
  recipient: string;
  amount: number;
}

export interface ParsedImportCsv {
  period_end: string;
  period_start: string;
  statement_month: string;
  transactions: ImportedTransactionDraft[];
}
