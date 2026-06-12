export const TRANSACTION_INCLUSION_VALUES = ["included", "excluded"] as const;

export type TransactionInclusion = (typeof TRANSACTION_INCLUSION_VALUES)[number];
