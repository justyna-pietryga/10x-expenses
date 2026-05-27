import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { BudgetError, isBudgetError } from "@/lib/budget/errors";

interface BudgetRouteContext {
  cookies: AstroCookies;
  locals: App.Locals;
  request: Request;
}

export function requireBudgetAuth(context: BudgetRouteContext) {
  if (!context.locals.user) {
    throw new BudgetError("Authentication is required", { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    throw new BudgetError("Supabase is not configured", { status: 500 });
  }

  return {
    supabase,
    user: context.locals.user,
  };
}

export async function readBudgetPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as Record<string, unknown>;
    return payload;
  }

  const formData = await request.formData();

  return Object.fromEntries(formData.entries());
}

export function budgetJson(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function budgetErrorResponse(error: unknown) {
  if (isBudgetError(error)) {
    return budgetJson(
      {
        error: error.message,
        field: error.field ?? null,
      },
      error.status,
    );
  }

  return budgetJson(
    {
      error: "Unexpected budget API error",
      field: null,
    },
    500,
  );
}
