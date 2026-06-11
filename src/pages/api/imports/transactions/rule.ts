import type { APIRoute } from "astro";
import { createImportReviewRule } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { validateImportReviewRulePayload } from "@/lib/imports/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const payload = validateImportReviewRulePayload(await readImportJsonPayload(context.request));
    const result = await createImportReviewRule(supabase, user.id, payload);

    return importJson(
      {
        anchor_transaction: result.anchor_transaction,
        applied_transactions: result.applied_transactions,
        match_count: result.match_count,
        rule: result.rule,
        skipped_rows: result.skipped_rows,
      },
      200,
    );
  } catch (error) {
    return importErrorResponse(error);
  }
};
