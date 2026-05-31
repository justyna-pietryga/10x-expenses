import type { APIRoute } from "astro";
import { deleteRule, updateRule } from "@/lib/rules/data";
import { RuleError } from "@/lib/rules/errors";
import { requireSummaryAuth, readSummaryJsonPayload, summaryErrorResponse, summaryJson } from "@/lib/summary/http";
import { validateMatchField, validateMatchText, validateTargetCategoryId } from "@/lib/rules/validation";

function requireRuleId(id: string | undefined) {
  if (!id) {
    throw new RuleError("Rule id is required", { status: 400, field: "id" });
  }

  return id;
}

export const PATCH: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireSummaryAuth(context);
    const ruleId = requireRuleId(context.params.id);
    const payload = await readSummaryJsonPayload(context.request);
    const updates: Record<string, string> = {};

    if ("match_field" in payload) {
      updates.match_field = validateMatchField(payload.match_field);
    }

    if ("match_text" in payload) {
      updates.match_text = validateMatchText(payload.match_text);
    }

    if ("target_category_id" in payload) {
      updates.target_category_id = validateTargetCategoryId(payload.target_category_id);
    }

    const rule = await updateRule(supabase, user.id, ruleId, updates);

    return summaryJson({ rule }, 200);
  } catch (error) {
    return summaryErrorResponse(error);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireSummaryAuth(context);
    const ruleId = requireRuleId(context.params.id);
    const rule = await deleteRule(supabase, user.id, ruleId);

    return summaryJson({ rule }, 200);
  } catch (error) {
    return summaryErrorResponse(error);
  }
};
