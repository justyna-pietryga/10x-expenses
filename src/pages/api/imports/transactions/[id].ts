import type { APIRoute } from "astro";
import { updateTransactionCategoryAndMaybeRule } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { requirePathId, validateImportTransactionUpdatePayload } from "@/lib/imports/validation";

export const PATCH: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const transactionId = requirePathId(context.params.id, "transaction_id");
    const payload = validateImportTransactionUpdatePayload(await readImportJsonPayload(context.request));
    const result = await updateTransactionCategoryAndMaybeRule(
      supabase,
      user.id,
      transactionId,
      payload.category_id,
      payload.inclusion_status,
      {
        saveRule: payload.save_rule,
      },
    );

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
