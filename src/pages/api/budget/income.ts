import type { APIRoute } from "astro";
import { budgetErrorResponse, budgetJson, readBudgetPayload, requireBudgetAuth } from "@/lib/budget/http";
import { deleteMonthlyIncome, upsertMonthlyIncome } from "@/lib/budget/data";
import { validateEstimatedFlag, validateIncomeAmount, validateMonthString } from "@/lib/budget/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireBudgetAuth(context);
    const payload = await readBudgetPayload(context.request);
    const month = validateMonthString(payload.month);
    const amount = validateIncomeAmount(payload.amount);
    const isEstimated = validateEstimatedFlag(payload.is_estimated);
    const income = await upsertMonthlyIncome(supabase, user.id, { month, amount, is_estimated: isEstimated });

    return budgetJson({ income }, 200);
  } catch (error) {
    return budgetErrorResponse(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireBudgetAuth(context);
    const payload = await readBudgetPayload(context.request);
    const month = validateMonthString(payload.month);

    await deleteMonthlyIncome(supabase, user.id, month);

    return budgetJson({ ok: true }, 200);
  } catch (error) {
    return budgetErrorResponse(error);
  }
};
