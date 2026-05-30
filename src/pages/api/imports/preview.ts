import type { APIRoute } from "astro";
import { findExistingImportBatch } from "@/lib/imports/data";
import { importErrorResponse, importJson, readImportUploadPayload, requireImportAuth } from "@/lib/imports/http";
import { parseRevolutCsv } from "@/lib/imports/revolutCsv";
import { validateCsvUpload, validateSupportedBank } from "@/lib/imports/validation";

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const payload = await readImportUploadPayload(context.request);
    const bank = validateSupportedBank(payload.bank);
    const file = validateCsvUpload(payload.file);
    const parsed = parseRevolutCsv(await file.text());
    const existingBatch = await findExistingImportBatch(supabase, user.id, bank, parsed.statement_month);

    return importJson(
      {
        bank,
        existing_batch: existingBatch,
        period_end: parsed.period_end,
        period_start: parsed.period_start,
        source_filename: file.name,
        statement_month: parsed.statement_month,
        transactions: parsed.transactions,
      },
      200,
    );
  } catch (error) {
    return importErrorResponse(error);
  }
};
