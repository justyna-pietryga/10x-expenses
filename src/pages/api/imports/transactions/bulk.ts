import type { APIRoute } from "astro";
import { updateImportTransactionCategories } from "@/lib/imports/data";
import { ImportError } from "@/lib/imports/errors";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { validateImportCategoryUpdatesPayload } from "@/lib/imports/validation";

export const PATCH: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const payload = validateImportCategoryUpdatesPayload(await readImportJsonPayload(context.request));
    const result = await updateImportTransactionCategories(supabase, user.id, payload.updates);

    if (result.updated.length === 0) {
      throw new ImportError("No transaction categories could be updated", { status: 400, field: "updates" });
    }

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
