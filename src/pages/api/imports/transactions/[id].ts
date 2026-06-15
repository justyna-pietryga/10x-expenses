import type { APIRoute } from "astro";
import { ImportError } from "@/lib/imports/errors";
import { updateTransactionReviewAndMaybeRule } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { requirePathId, validateImportReviewUpdatePayload, validateRuleOptIn } from "@/lib/imports/validation";

export const PATCH: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const transactionId = requirePathId(context.params.id, "transaction_id");
    const payload = await readImportJsonPayload(context.request);
    const reviewUpdate = validateImportReviewUpdatePayload(payload, {
      defaultTransactionId: transactionId,
    });

    if (reviewUpdate.transaction_id !== transactionId) {
      throw new ImportError("transaction_id must match the route id", {
        status: 400,
        field: "transaction_id",
      });
    }

    const saveRule = validateRuleOptIn(payload.save_rule);
    const result = await updateTransactionReviewAndMaybeRule(supabase, user.id, reviewUpdate, {
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
