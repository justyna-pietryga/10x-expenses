import type { APIRoute } from "astro";
import { loadDashboardSummary } from "@/lib/summary/data";
import { readSelectedMonth, requireSummaryAuth, summaryErrorResponse, summaryJson } from "@/lib/summary/http";

export const GET: APIRoute = async (context) => {
  try {
    const { supabase, user } = requireSummaryAuth(context);
    const requestedMonth = readSelectedMonth(context.request);
    const summary = await loadDashboardSummary(supabase, user.id, requestedMonth);

    return summaryJson(summary, 200);
  } catch (error) {
    return summaryErrorResponse(error);
  }
};
