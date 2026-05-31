import type { APIRoute } from "astro";
import { createRule, listRules } from "@/lib/rules/data";
import { requireSummaryAuth, readSummaryJsonPayload, summaryErrorResponse, summaryJson } from "@/lib/summary/http";
import { validateMatchField, validateMatchText, validateTargetCategoryId } from "@/lib/rules/validation";

export const GET: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireSummaryAuth(context);
    const rules = await listRules(supabase, user.id);

    return summaryJson({ rules }, 200);
  } catch (error) {
    return summaryErrorResponse(error);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireSummaryAuth(context);
    const payload = await readSummaryJsonPayload(context.request);
    const rule = await createRule(supabase, user.id, {
      match_field: validateMatchField(payload.match_field),
      match_text: validateMatchText(payload.match_text),
      target_category_id: validateTargetCategoryId(payload.target_category_id),
    });

    return summaryJson({ rule }, 201);
  } catch (error) {
    return summaryErrorResponse(error);
  }
};
