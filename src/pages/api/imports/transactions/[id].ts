import type { APIRoute } from "astro";
import { updateTransactionCategoryAndMaybeRule } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { requirePathId, validateImportCategoryId, validateRuleOptIn } from "@/lib/imports/validation";

export const PATCH: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const transactionId = requirePathId(context.params.id, "transaction_id");
    const payload = await readImportJsonPayload(context.request);
    const categoryId = validateImportCategoryId(payload.category_id);
    const saveRule = validateRuleOptIn(payload.save_rule);
    const result = await updateTransactionCategoryAndMaybeRule(supabase, user.id, transactionId, categoryId, {
      saveRule,
    });

    return importJson(
      {
        rule: result.rule,
        transaction: result.transaction,
      },
      200,
    );
  } catch (error) {
    return importErrorResponse(error);
  }
};
