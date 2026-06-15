import type { APIRoute } from "astro";
import { updateImportTransactionReviews } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { validateImportReviewUpdatesPayload } from "@/lib/imports/validation";

export const PATCH: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const payload = validateImportReviewUpdatesPayload(await readImportJsonPayload(context.request));
    const result = await updateImportTransactionReviews(supabase, user.id, payload.updates);

    return importJson(
      {
        failed: result.failed,
        updated: result.updated,
      },
      200,
    );
  } catch (error) {
    return importErrorResponse(error);
  }
};
