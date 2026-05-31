import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import {
  archiveCategory,
  createCategory,
  listActiveCategories,
  loadMonthlyIncome,
  updateCategory,
  upsertMonthlyIncome,
} from "@/lib/budget/data";
import {
  calculateActiveTotalPercentage,
  validateActiveTotalPercentageLimit,
  validateCarryoverEnabled,
  validateCategoryName,
  validateIncomeAmount,
  validateMonthString,
  validatePercentageLimit,
} from "@/lib/budget/validation";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

function createSelectChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createMutationChain(data: unknown, error: { code?: string; message: string } | null = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

interface FakeTable {
  select?: ReturnType<typeof vi.fn>;
  insert?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
}

function createSupabaseStub(overrides: Partial<Record<string, FakeTable>> = {}) {
  const activeCategories = [
    {
      id: "cat-1",
      user_id: "user-1",
      name: "Food",
      percentage_limit: 40,
      carryover_enabled: false,
      archived_at: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
  ];
  const monthlyIncome = {
    id: "income-1",
    user_id: "user-1",
    month: "2026-05-01",
    amount: 4200,
    is_estimated: false,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
  const createdCategory = {
    ...activeCategories[0],
    id: "cat-2",
    name: "Rent",
    percentage_limit: 20,
    carryover_enabled: true,
  };
  const archivedCategory = {
    ...activeCategories[0],
    archived_at: "2026-05-27T08:00:00.000Z",
  };

  return {
    from: vi.fn((table: string) => {
      const tableOverride = overrides[table];
      if (tableOverride) {
        return tableOverride;
      }

      if (table === "budget_categories") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(activeCategories)),
          insert: vi.fn().mockReturnValue(createMutationChain(createdCategory)),
          update: vi.fn().mockReturnValue(createMutationChain(archivedCategory)),
        };
      }

      if (table === "monthly_incomes") {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(monthlyIncome)),
          upsert: vi.fn().mockReturnValue(createMutationChain(monthlyIncome)),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("budget validation", () => {
  it("normalizes valid month strings to the first day of the month", () => {
    expect(validateMonthString("2026-05")).toBe("2026-05-01");
    expect(validateMonthString("2026-05-01")).toBe("2026-05-01");
  });

  it("rejects invalid income, names, and percentage limits", () => {
    expect(() => validateMonthString("2026-05-15")).toThrow(/first day/);
    expect(() => validateIncomeAmount(-1)).toThrow(/negative/);
    expect(() => validateCategoryName("   ")).toThrow(/blank/);
    expect(() => validatePercentageLimit(101)).toThrow(/between 0 and 100/);
    expect(validateCarryoverEnabled("yes")).toBe(true);
    expect(validateCarryoverEnabled(undefined)).toBe(false);
  });

  it("enforces the active category total limit and excludes the edited category", () => {
    const categories = [
      { id: "cat-1", percentage_limit: 60, archived_at: null },
      { id: "cat-2", percentage_limit: 30, archived_at: null },
      { id: "cat-3", percentage_limit: 10, archived_at: "2026-05-01T00:00:00.000Z" },
    ];

    expect(calculateActiveTotalPercentage(categories, { nextPercentageLimit: 5 })).toBe(95);
    expect(
      calculateActiveTotalPercentage(categories, {
        excludeCategoryId: "cat-2",
        nextPercentageLimit: 35,
      }),
    ).toBe(95);
    expect(() =>
      validateActiveTotalPercentageLimit(categories, {
        excludeCategoryId: "cat-2",
        nextPercentageLimit: 50,
      }),
    ).toThrow(/cannot exceed 100/);
  });
});

describe("budget data helpers", () => {
  it("lists only active categories and loads monthly income", async () => {
    const supabase = createSupabaseStub();

    await expect(listActiveCategories(supabase as never, "user-1")).resolves.toHaveLength(1);
    await expect(loadMonthlyIncome(supabase as never, "user-1", "2026-05-01")).resolves.toMatchObject({
      id: "income-1",
    });
  });

  it("upserts income and creates, updates, and archives categories", async () => {
    const supabase = createSupabaseStub();

    await expect(
      upsertMonthlyIncome(supabase as never, "user-1", {
        month: "2026-05-01",
        amount: 5000,
        is_estimated: true,
      }),
    ).resolves.toMatchObject({ month: "2026-05-01" });

    await expect(
      createCategory(supabase as never, "user-1", {
        carryover_enabled: true,
        name: "Rent",
        percentage_limit: 20,
      }),
    ).resolves.toMatchObject({ name: "Rent", carryover_enabled: true });

    await expect(
      updateCategory(supabase as never, "user-1", "cat-1", {
        carryover_enabled: true,
        name: "Food",
        percentage_limit: 45,
      }),
    ).resolves.toMatchObject({ id: "cat-1" });

    const archivedCategory = await archiveCategory(supabase as never, "user-1", "cat-1");
    if (!archivedCategory) {
      throw new Error("Expected archived category result");
    }
    expect(archivedCategory.archived_at).toEqual(expect.any(String));
  });

  it("turns duplicate category names into a clear persistence error", async () => {
    const duplicateError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
    };
    const supabase = createSupabaseStub({
      budget_categories: {
        insert: vi.fn().mockReturnValue(createMutationChain(null, duplicateError)),
      },
    });

    await expect(
      createCategory(supabase as never, "user-1", {
        carryover_enabled: false,
        name: "Food",
        percentage_limit: 25,
      }),
    ).rejects.toThrow(/already exists/);
  });
});

describe("budget API routes", () => {
  it("rejects unauthenticated income and category writes", async () => {
    const incomeRoute: typeof import("@/pages/api/budget/income") = await import("@/pages/api/budget/income");
    const categoryCollectionRoute: typeof import("@/pages/api/budget/categories/index") =
      await import("@/pages/api/budget/categories/index");
    const categoryItemRoute: typeof import("@/pages/api/budget/categories/[id]") =
      await import("@/pages/api/budget/categories/[id]");
    const unauthenticatedContext = {
      request: new Request("http://localhost/api/budget/income", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ month: "2026-05", amount: 1000, is_estimated: false }),
      }),
      cookies: {} as never,
      locals: { user: null },
      params: {},
      redirect: vi.fn(),
    };

    await expect(incomeRoute.POST(unauthenticatedContext as never)).resolves.toMatchObject({ status: 401 });
    await expect(categoryCollectionRoute.POST(unauthenticatedContext as never)).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      categoryItemRoute.DELETE({
        ...unauthenticatedContext,
        params: { id: "cat-1" },
      } as never),
    ).resolves.toMatchObject({ status: 401 });
  });

  it("supports authenticated category create, update, and archive route contracts", async () => {
    const categoryCollectionRoute: typeof import("@/pages/api/budget/categories/index") =
      await import("@/pages/api/budget/categories/index");
    const categoryItemRoute: typeof import("@/pages/api/budget/categories/[id]") =
      await import("@/pages/api/budget/categories/[id]");
    const supabase = createSupabaseStub();

    vi.mocked(createClient).mockReturnValue(supabase as never);

    const authenticatedContext = {
      cookies: {} as never,
      locals: {
        user: {
          id: "user-1",
          email: "user@example.com",
        },
      },
      redirect: vi.fn(),
    };

    const createResponse = await categoryCollectionRoute.POST({
      ...authenticatedContext,
      request: new Request("http://localhost/api/budget/categories", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          carryover_enabled: true,
          name: "Rent",
          percentage_limit: 20,
        }),
      }),
      params: {},
    } as never);

    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      category: {
        id: "cat-2",
        name: "Rent",
        carryover_enabled: true,
      },
    });

    const updateResponse = await categoryItemRoute.PUT({
      ...authenticatedContext,
      request: new Request("http://localhost/api/budget/categories/cat-1", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          carryover_enabled: true,
          name: "Food",
          percentage_limit: 45,
        }),
      }),
      params: { id: "cat-1" },
    } as never);

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      category: {
        id: "cat-1",
      },
    });

    const archiveResponse = await categoryItemRoute.DELETE({
      ...authenticatedContext,
      request: new Request("http://localhost/api/budget/categories/cat-1", {
        method: "DELETE",
      }),
      params: { id: "cat-1" },
    } as never);

    expect(archiveResponse.status).toBe(200);
    const archivePayload = (await archiveResponse.json()) as { category: { archived_at: string } };
    expect(archivePayload.category.archived_at).toEqual(expect.any(String));
  });
});
