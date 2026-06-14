import type { APIRoute } from "astro";
import { loadImportBatchReview } from "@/lib/imports/data";
import { importErrorResponse, importJson, requireImportAuth } from "@/lib/imports/http";
import { requirePathId } from "@/lib/imports/validation";

export const GET: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const batchId = requirePathId(context.params.id, "batch_id");
    const review = await loadImportBatchReview(supabase, user.id, batchId);

    return importJson({ batch: review.batch, transactions: review.transactions }, 200);
  } catch (error) {
    return importErrorResponse(error);
  }
};
