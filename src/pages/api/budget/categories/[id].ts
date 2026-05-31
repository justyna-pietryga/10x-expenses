import type { APIRoute } from "astro";
import { archiveCategory, listActiveCategories, updateCategory } from "@/lib/budget/data";
import { BudgetError } from "@/lib/budget/errors";
import { budgetErrorResponse, budgetJson, readBudgetPayload, requireBudgetAuth } from "@/lib/budget/http";
import {
  validateActiveTotalPercentageLimit,
  validateCarryoverEnabled,
  validateCategoryName,
  validatePercentageLimit,
} from "@/lib/budget/validation";

function requireCategoryId(id: string | undefined) {
  if (!id) {
    throw new BudgetError("Category id is required", { status: 400, field: "id" });
  }

  return id;
}

export const PUT: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireBudgetAuth(context);
    const categoryId = requireCategoryId(context.params.id);
    const payload = await readBudgetPayload(context.request);
    const name = validateCategoryName(payload.name);
    const carryoverEnabled = validateCarryoverEnabled(payload.carryover_enabled);
    const percentageLimit = validatePercentageLimit(payload.percentage_limit);
    const categories = await listActiveCategories(supabase, user.id);

    validateActiveTotalPercentageLimit(categories, {
      excludeCategoryId: categoryId,
      nextPercentageLimit: percentageLimit,
    });

    const category = await updateCategory(supabase, user.id, categoryId, {
      carryover_enabled: carryoverEnabled,
      name,
      percentage_limit: percentageLimit,
    });

    return budgetJson({ category }, 200);
  } catch (error) {
    return budgetErrorResponse(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireBudgetAuth(context);
    const categoryId = requireCategoryId(context.params.id);
    const category = await archiveCategory(supabase, user.id, categoryId);

    return budgetJson({ category }, 200);
  } catch (error) {
    return budgetErrorResponse(error);
  }
};
