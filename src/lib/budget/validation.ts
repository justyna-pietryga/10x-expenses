import type { Tables } from "@/lib/database.types";
import { BudgetError } from "@/lib/budget/errors";

type ActiveCategory = Pick<Tables<"budget_categories">, "id" | "percentage_limit" | "archived_at">;

const MONTH_PATTERN = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

function toFiniteNumber(value: unknown, field: string) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new BudgetError(`${field} must be a valid number`, { field });
  }

  return parsed;
}

export function validateMonthString(value: unknown) {
  if (typeof value !== "string") {
    throw new BudgetError("Month must be a string in YYYY-MM format", { field: "month" });
  }

  const trimmed = value.trim();
  const match = MONTH_PATTERN.exec(trimmed);

  if (!match) {
    throw new BudgetError("Month must use YYYY-MM or YYYY-MM-DD format", { field: "month" });
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = dayText ? Number(dayText) : 1;
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    throw new BudgetError("Month must be a valid calendar date", { field: "month" });
  }

  if (day !== 1) {
    throw new BudgetError("Month must point to the first day of the month", { field: "month" });
  }

  return `${yearText}-${monthText}-01`;
}

export function validateIncomeAmount(value: unknown) {
  const amount = toFiniteNumber(value, "amount");

  if (amount < 0) {
    throw new BudgetError("Income amount cannot be negative", { field: "amount" });
  }

  return amount;
}

export function validateEstimatedFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
  }

  return false;
}

export function validateCategoryName(value: unknown) {
  if (typeof value !== "string") {
    throw new BudgetError("Category name is required", { field: "name" });
  }

  const name = value.trim();

  if (!name) {
    throw new BudgetError("Category name cannot be blank", { field: "name" });
  }

  return name;
}

export function validatePercentageLimit(value: unknown) {
  const percentageLimit = toFiniteNumber(value, "percentage_limit");

  if (percentageLimit < 0 || percentageLimit > 100) {
    throw new BudgetError("Category percentage must be between 0 and 100", { field: "percentage_limit" });
  }

  return percentageLimit;
}

export function calculateActiveTotalPercentage(
  categories: ActiveCategory[],
  options?: { excludeCategoryId?: string; nextPercentageLimit?: number },
) {
  const baseTotal = categories
    .filter((category) => category.archived_at === null && category.id !== options?.excludeCategoryId)
    .reduce((total, category) => total + category.percentage_limit, 0);

  return Number((baseTotal + (options?.nextPercentageLimit ?? 0)).toFixed(2));
}

export function validateActiveTotalPercentageLimit(
  categories: ActiveCategory[],
  options?: { excludeCategoryId?: string; nextPercentageLimit?: number },
) {
  const total = calculateActiveTotalPercentage(categories, options);

  if (total > 100) {
    throw new BudgetError("Active category percentages cannot exceed 100", {
      field: "percentage_limit",
    });
  }

  return total;
}
