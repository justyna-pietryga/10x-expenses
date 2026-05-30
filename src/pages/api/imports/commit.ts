import type { APIRoute } from "astro";
import { commitImportBatch } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportJsonPayload, requireImportAuth } from "@/lib/imports/http";
import { validateImportCommitPayload } from "@/lib/imports/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const payload = validateImportCommitPayload(await readImportJsonPayload(context.request));
    const result = await commitImportBatch(supabase, user.id, payload);

    return importJson(
      {
        batch: result.batch,
        replaced: result.replaced,
        transactions: result.transactions,
      },
      result.replaced ? 200 : 201,
    );
  } catch (error) {
    return importErrorResponse(error);
  }
};
