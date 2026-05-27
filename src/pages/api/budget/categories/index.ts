import type { APIRoute } from "astro";
import { createCategory, listActiveCategories } from "@/lib/budget/data";
import { budgetErrorResponse, budgetJson, readBudgetPayload, requireBudgetAuth } from "@/lib/budget/http";
import {
  validateActiveTotalPercentageLimit,
  validateCategoryName,
  validatePercentageLimit,
} from "@/lib/budget/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireBudgetAuth(context);
    const payload = await readBudgetPayload(context.request);
    const name = validateCategoryName(payload.name);
    const percentageLimit = validatePercentageLimit(payload.percentage_limit);
    const categories = await listActiveCategories(supabase, user.id);

    validateActiveTotalPercentageLimit(categories, { nextPercentageLimit: percentageLimit });

    const category = await createCategory(supabase, user.id, {
      name,
      percentage_limit: percentageLimit,
    });

    return budgetJson({ category }, 201);
  } catch (error) {
    return budgetErrorResponse(error);
  }
};
