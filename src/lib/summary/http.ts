import type { AstroCookies } from "astro";
import { isBudgetError } from "@/lib/budget/errors";
import { validateMonthString } from "@/lib/budget/validation";
import { isRuleError } from "@/lib/rules/errors";
import { SummaryError, isSummaryError } from "@/lib/summary/errors";
import { createClient } from "@/lib/supabase";

interface SummaryRouteContext {
  cookies: AstroCookies;
  locals: App.Locals;
  request: Request;
}

export function requireSummaryAuth(context: SummaryRouteContext) {
  if (!context.locals.user) {
    throw new SummaryError("Authentication is required", { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    throw new SummaryError("Supabase is not configured", { status: 500 });
  }

  return {
    supabase,
    user: context.locals.user,
  };
}

export async function readSummaryJsonPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    throw new SummaryError("This endpoint expects application/json", {
      field: "content-type",
    });
  }

  return (await request.json()) as Record<string, unknown>;
}

export function readSelectedMonth(request: Request) {
  const rawMonth = new URL(request.url).searchParams.get("month");

  if (!rawMonth) {
    return null;
  }

  return validateMonthString(rawMonth);
}

export function summaryJson(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function summaryErrorResponse(error: unknown) {
  if (isSummaryError(error)) {
    return summaryJson(
      {
        error: error.message,
        field: error.field ?? null,
      },
      error.status,
    );
  }

  if (isBudgetError(error)) {
    return summaryJson(
      {
        error: error.message,
        field: error.field ?? null,
      },
      error.status,
    );
  }

  if (isRuleError(error)) {
    return summaryJson(
      {
        error: error.message,
        field: error.field ?? null,
      },
      error.status,
    );
  }

  return summaryJson(
    {
      error: "Unexpected summary API error",
      field: null,
    },
    500,
  );
}
