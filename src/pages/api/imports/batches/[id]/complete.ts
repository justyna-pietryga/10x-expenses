import type { APIRoute } from "astro";
import { markBatchReviewComplete } from "@/lib/imports/data";
import { importErrorResponse, importJson, requireImportAuth } from "@/lib/imports/http";
import { requirePathId } from "@/lib/imports/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const batchId = requirePathId(context.params.id, "batch_id");
    const batch = await markBatchReviewComplete(supabase, user.id, batchId);

    return importJson({ batch }, 200);
  } catch (error) {
    return importErrorResponse(error);
  }
};
