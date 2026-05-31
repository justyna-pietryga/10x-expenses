import type { APIRoute } from "astro";
import { createCategory, listActiveCategories } from "@/lib/budget/data";
import { budgetErrorResponse, budgetJson, readBudgetPayload, requireBudgetAuth } from "@/lib/budget/http";
import {
  validateActiveTotalPercentageLimit,
  validateCarryoverEnabled,
  validateCategoryName,
  validatePercentageLimit,
} from "@/lib/budget/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireBudgetAuth(context);
    const payload = await readBudgetPayload(context.request);
    const name = validateCategoryName(payload.name);
    const carryoverEnabled = validateCarryoverEnabled(payload.carryover_enabled);
    const percentageLimit = validatePercentageLimit(payload.percentage_limit);
    const categories = await listActiveCategories(supabase, user.id);

    validateActiveTotalPercentageLimit(categories, { nextPercentageLimit: percentageLimit });

    const category = await createCategory(supabase, user.id, {
      carryover_enabled: carryoverEnabled,
      name,
      percentage_limit: percentageLimit,
    });

    return budgetJson({ category }, 201);
  } catch (error) {
    return budgetErrorResponse(error);
  }
};
