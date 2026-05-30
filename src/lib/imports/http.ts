import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import { ImportError, isImportError } from "@/lib/imports/errors";

interface ImportRouteContext {
  cookies: AstroCookies;
  locals: App.Locals;
  request: Request;
}

export function requireImportAuth(context: ImportRouteContext) {
  if (!context.locals.user) {
    throw new ImportError("Authentication is required", { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    throw new ImportError("Supabase is not configured", { status: 500 });
  }

  return {
    supabase,
    user: context.locals.user,
  };
}

export async function readImportJsonPayload(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    throw new ImportError("This endpoint expects application/json", { field: "content-type" });
  }

  return (await request.json()) as Record<string, unknown>;
}

export async function readImportUploadPayload(request: Request) {
  const formData = await request.formData();

  return {
    bank: formData.get("bank"),
    file: formData.get("file"),
  };
}

export function importJson(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export function importErrorResponse(error: unknown) {
  if (isImportError(error)) {
    return importJson(
      {
        error: error.message,
        field: error.field ?? null,
      },
      error.status,
    );
  }

  return importJson(
    {
      error: "Unexpected import API error",
      field: null,
    },
    500,
  );
}
