import { startTransition, useState, type SyntheticEvent } from "react";
import type { BudgetCategory } from "@/lib/budget/data";
import { calculateActiveTotalPercentage } from "@/lib/budget/validation";
import { Button } from "@/components/ui/button";

interface Props {
  categories: BudgetCategory[];
  totalPercentage: number;
  onChange: (categories: BudgetCategory[]) => void;
}

interface CategoryDraft {
  carryover_enabled: boolean;
  name: string;
  percentage_limit: string;
}

function createEmptyDraft(): CategoryDraft {
  return {
    carryover_enabled: false,
    name: "",
    percentage_limit: "",
  };
}

function getProjectedTotal(categories: BudgetCategory[], percentageLimit: number, categoryId?: string) {
  return calculateActiveTotalPercentage(categories, {
    excludeCategoryId: categoryId,
    nextPercentageLimit: percentageLimit,
  });
}

export function CategoryManager({ categories, totalPercentage, onChange }: Props) {
  const [newCategory, setNewCategory] = useState<CategoryDraft>(createEmptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<CategoryDraft>(createEmptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function request<T>(input: RequestInfo, init: RequestInit) {
    const response = await fetch(input, {
      ...init,
      headers: {
        "content-type": "application/json",
      },
    });
    const payload = (await response.json()) as { error?: string; category?: T };

    if (!response.ok) {
      throw new Error(payload.error ?? "Budget category request failed");
    }

    return payload.category as T;
  }

  function validateDraft(draft: CategoryDraft, categoryId?: string) {
    const name = draft.name.trim();
    const percentageLimit = Number(draft.percentage_limit);

    if (!name) {
      throw new Error("Category name cannot be blank");
    }

    if (!Number.isFinite(percentageLimit) || percentageLimit < 0 || percentageLimit > 100) {
      throw new Error("Category percentage must be between 0 and 100");
    }

    const projectedTotal = getProjectedTotal(categories, percentageLimit, categoryId);
    if (projectedTotal > 100) {
      throw new Error(`Active category total would reach ${projectedTotal}%, which is above 100%`);
    }

    return {
      carryover_enabled: draft.carryover_enabled,
      name,
      percentage_limit: percentageLimit,
    };
  }

  async function handleCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setError(null);

    try {
      const payload = validateDraft(newCategory);
      const category = await request<BudgetCategory>("/api/budget/categories", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      startTransition(() => {
        onChange([...categories, category]);
        setNewCategory(createEmptyDraft());
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create category");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSave(categoryId: string) {
    setBusyId(categoryId);
    setError(null);

    try {
      const payload = validateDraft(editingDraft, categoryId);
      const category = await request<BudgetCategory>(`/api/budget/categories/${categoryId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      startTransition(() => {
        onChange(categories.map((item) => (item.id === categoryId ? category : item)));
        setEditingId(null);
        setEditingDraft(createEmptyDraft());
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update category");
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(categoryId: string) {
    setBusyId(categoryId);
    setError(null);

    try {
      await request<BudgetCategory>(`/api/budget/categories/${categoryId}`, {
        method: "DELETE",
      });

      startTransition(() => {
        onChange(categories.filter((category) => category.id !== categoryId));
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not archive category");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/12 bg-slate-950/35 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.4)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-amber-200/70 uppercase">Category Limits</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Shape the active budget mix.</h2>
        </div>
        <div
          className={`rounded-full border px-4 py-2 text-sm ${
            totalPercentage > 100
              ? "border-rose-300/40 bg-rose-400/15 text-rose-100"
              : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          Active total: {totalPercentage}%
        </div>
      </div>

      <form className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/6 p-4" onSubmit={handleCreate}>
        <div className="grid gap-3 md:grid-cols-[1.3fr_.8fr_auto]">
          <input
            type="text"
            aria-label="Category name"
            value={newCategory.name}
            onChange={(event) => {
              setNewCategory((prev) => ({ ...prev, name: event.target.value }));
            }}
            className="rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white transition outline-none focus:border-amber-300/60"
            placeholder="Category name"
          />
          <input
            type="number"
            aria-label="Category percentage limit"
            min="0"
            max="100"
            step="0.01"
            value={newCategory.percentage_limit}
            onChange={(event) => {
              setNewCategory((prev) => ({ ...prev, percentage_limit: event.target.value }));
            }}
            className="rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-white transition outline-none focus:border-amber-300/60"
            placeholder="25"
          />
          <Button
            type="submit"
            className="h-12 rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200"
            disabled={isCreating}
          >
            {isCreating ? "Adding..." : "Add category"}
          </Button>
        </div>
        <label className="flex items-center gap-3 rounded-2xl border border-white/12 bg-slate-950/25 px-4 py-3 text-sm text-slate-100">
          <input
            type="checkbox"
            checked={newCategory.carryover_enabled}
            onChange={(event) => {
              setNewCategory((prev) => ({ ...prev, carryover_enabled: event.target.checked }));
            }}
            className="size-4 rounded border-white/20 bg-slate-950/60"
          />
          Savings category with carry-over
        </label>
      </form>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-6 space-y-3">
        {categories.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 bg-white/4 px-5 py-8 text-center text-sm text-slate-300">
            No active categories yet. Add the first one above.
          </div>
        ) : (
          categories.map((category) => {
            const isEditing = editingId === category.id;
            const projectedTotal = isEditing
              ? getProjectedTotal(categories, Number(editingDraft.percentage_limit || "0"), category.id)
              : totalPercentage;

            return (
              <div key={category.id} className="rounded-3xl border border-white/10 bg-white/4 p-4">
                <div className="grid gap-3 md:grid-cols-[1.3fr_.8fr_auto]">
                  <input
                    type="text"
                    aria-label="Category name"
                    value={isEditing ? editingDraft.name : category.name}
                    onChange={(event) => {
                      if (!isEditing) {
                        return;
                      }

                      setEditingDraft((prev) => ({ ...prev, name: event.target.value }));
                    }}
                    disabled={!isEditing}
                    className="rounded-2xl border border-white/12 bg-slate-950/25 px-4 py-3 text-white outline-none disabled:opacity-80"
                  />
                  <div className="space-y-2">
                    <input
                      type="number"
                      aria-label="Category percentage limit"
                      min="0"
                      max="100"
                      step="0.01"
                      value={isEditing ? editingDraft.percentage_limit : String(category.percentage_limit)}
                      onChange={(event) => {
                        if (!isEditing) {
                          return;
                        }

                        setEditingDraft((prev) => ({ ...prev, percentage_limit: event.target.value }));
                      }}
                      disabled={!isEditing}
                      className="w-full rounded-2xl border border-white/12 bg-slate-950/25 px-4 py-3 text-white outline-none disabled:opacity-80"
                    />
                    {isEditing && projectedTotal > 100 && (
                      <p className="text-xs text-rose-300">This change would push the active total above 100%.</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          className="rounded-2xl bg-white/14 text-white hover:bg-white/20"
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft(createEmptyDraft());
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          className="rounded-2xl bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                          onClick={() => {
                            void handleSave(category.id);
                          }}
                          disabled={busyId === category.id}
                        >
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          className="rounded-2xl bg-white/14 text-white hover:bg-white/20"
                          onClick={() => {
                            setEditingId(category.id);
                            setEditingDraft({
                              carryover_enabled: category.carryover_enabled,
                              name: category.name,
                              percentage_limit: String(category.percentage_limit),
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="rounded-2xl"
                          onClick={() => {
                            void handleArchive(category.id);
                          }}
                          disabled={busyId === category.id}
                        >
                          Archive
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-3 rounded-2xl border border-white/12 bg-slate-950/20 px-4 py-3 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={isEditing ? editingDraft.carryover_enabled : category.carryover_enabled}
                    onChange={(event) => {
                      if (!isEditing) {
                        return;
                      }

                      setEditingDraft((prev) => ({ ...prev, carryover_enabled: event.target.checked }));
                    }}
                    disabled={!isEditing}
                    className="size-4 rounded border-white/20 bg-slate-950/60 disabled:opacity-80"
                  />
                  Savings category with carry-over
                </label>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
