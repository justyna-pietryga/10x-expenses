import type { APIRoute } from "astro";
import { findExistingImportBatch } from "@/lib/imports/data";
import { ImportError } from "@/lib/imports/errors";
import { importErrorResponse, importJson, readImportUploadPayload, requireImportAuth } from "@/lib/imports/http";
import { parseRevolutCsv } from "@/lib/imports/revolutCsv";
import type { ParsedImportCsv, SupportedBank } from "@/lib/imports/types";
import { validateCsvUpload, validateSupportedBank } from "@/lib/imports/validation";

function parseImportPreview(bank: SupportedBank, text: string): ParsedImportCsv {
  if (bank === "revolut") {
    return parseRevolutCsv(text);
  }

  throw new ImportError("ING CSV parsing lands in Phase 2 of this plan", {
    field: "bank",
  });
}

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireImportAuth(context);
    const payload = await readImportUploadPayload(context.request);
    const bank = validateSupportedBank(payload.bank);
    const file = validateCsvUpload(payload.file);
    const parsed = parseImportPreview(bank, await file.text());
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
