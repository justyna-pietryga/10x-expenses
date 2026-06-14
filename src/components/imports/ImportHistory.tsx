import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileClock, FolderOpen, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImportBatchHistorySummary } from "@/lib/imports/data";

interface Props {
  activeBatchId: string | null;
  history: ImportBatchHistorySummary[];
  initialMobileOpen?: boolean;
  onSelectBatch?: (batchId: string) => boolean | undefined | Promise<boolean | undefined>;
}

function formatBankLabel(bank: ImportBatchHistorySummary["bank"]) {
  return bank === "ing" ? "ING" : "Revolut";
}

function formatMonthLabel(statementMonth: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${statementMonth}T00:00:00Z`));
}

function formatStatusLabel(reviewCompletedAt: string | null) {
  return reviewCompletedAt ? "Completed review" : "Pending review";
}

function formatTransactionCountLabel(transactionCount: number) {
  return `${transactionCount} ${transactionCount === 1 ? "transaction" : "transactions"}`;
}

function renderHistoryList(
  history: ImportBatchHistorySummary[],
  activeBatchId: string | null,
  onSelectBatch?: (batchId: string) => boolean | undefined | Promise<boolean | undefined>,
) {
  if (history.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-white/12 bg-slate-950/30 px-5 py-8 text-sm text-slate-300">
        <p className="font-medium text-white">No import history yet.</p>
        <p className="mt-2 text-slate-300/80">
          Upload a supported statement to create your first review batch and start building recent history here.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {history.map((item) => {
        const isActive = item.id === activeBatchId;

        return (
          <li key={item.id}>
            <button
              type="button"
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full rounded-[24px] border px-4 py-4 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70",
                isActive
                  ? "border-emerald-300/45 bg-emerald-300/12 shadow-[0_18px_60px_rgba(16,185,129,0.12)]"
                  : "border-white/10 bg-slate-950/28 hover:border-white/18 hover:bg-white/8",
              )}
              disabled={!onSelectBatch || isActive}
              onClick={() => {
                void onSelectBatch?.(item.id);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.22em] text-cyan-200/70 uppercase">
                    {formatBankLabel(item.bank)}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-white">{formatMonthLabel(item.statement_month)}</h3>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase",
                    item.review_completed_at
                      ? "border border-white/12 bg-white/8 text-slate-200"
                      : "border border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
                  )}
                >
                  {item.review_completed_at ? "Completed" : "Pending"}
                </span>
              </div>

              <dl className="mt-4 space-y-2 text-sm text-slate-200/85">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Status</dt>
                  <dd>{formatStatusLabel(item.review_completed_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Source file</dt>
                  <dd className="truncate text-right text-white">{item.source_filename ?? "Unnamed import"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400">Rows</dt>
                  <dd>{formatTransactionCountLabel(item.transaction_count)}</dd>
                </div>
              </dl>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function ImportHistory({ activeBatchId, history, initialMobileOpen = false, onSelectBatch }: Props) {
  const [isMobileOpen, setIsMobileOpen] = useState(initialMobileOpen);
  const dialogTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isMobileOpen) {
      return;
    }

    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const triggerElement = triggerButtonRef.current;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const nextFocusTarget = lastFocusedElementRef.current ?? triggerElement;
      nextFocusTarget?.focus();
    };
  }, [isMobileOpen]);

  async function handleSelectBatch(batchId: string): Promise<boolean | undefined> {
    const result = await onSelectBatch?.(batchId);

    if (result !== false) {
      setIsMobileOpen(false);
    }

    return result;
  }

  return (
    <>
      <div className="lg:hidden">
        <button
          ref={triggerButtonRef}
          type="button"
          className="flex w-full items-center justify-between rounded-[24px] border border-white/12 bg-slate-950/35 px-4 py-4 text-left text-white transition hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-emerald-200/70"
          onClick={() => {
            setIsMobileOpen(true);
          }}
        >
          <span className="flex items-center gap-3">
            <FolderOpen className="size-4 text-emerald-200" />
            <span>
              <span className="block text-xs font-semibold tracking-[0.22em] text-emerald-200/80 uppercase">
                Import history
              </span>
              <span className="mt-1 block text-sm text-slate-200">
                {history.length === 0
                  ? "No batches yet"
                  : `${history.length} recent ${history.length === 1 ? "batch" : "batches"}`}
              </span>
            </span>
          </span>
          <ChevronRight className="size-4 text-slate-300" />
        </button>
      </div>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close import history"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => {
              setIsMobileOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-white/12 bg-slate-950/96 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.55)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.24em] text-emerald-200/75 uppercase">Mobile history</p>
                <h2 id={dialogTitleId} className="mt-2 text-2xl font-semibold text-white">
                  Recent import batches
                </h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full border border-white/12 text-slate-200 transition hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-emerald-200/70"
                onClick={() => {
                  setIsMobileOpen(false);
                }}
              >
                <X className="size-4" />
                <span className="sr-only">Close import history</span>
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-300/80">
              Review old and current batches without leaving the import workspace.
            </p>

            <div className="mt-5 overflow-y-auto pr-1">
              {renderHistoryList(history, activeBatchId, onSelectBatch ? handleSelectBatch : undefined)}
            </div>
          </div>
        </div>
      )}

      <section className="hidden lg:block">
        <div className="rounded-[32px] border border-white/12 bg-white/7 p-5 shadow-[0_20px_70px_rgba(2,6,23,0.28)] backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3">
              <FileClock className="size-5 text-emerald-100" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.24em] text-emerald-200/75 uppercase">Recent history</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Resume older import reviews</h2>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-300/80">
            Pending reviews stay at the top so unfinished work is always easier to reopen than completed corrections.
          </p>

          <div className="mt-5">{renderHistoryList(history, activeBatchId, onSelectBatch)}</div>
        </div>
      </section>
    </>
  );
}

export function ImportHistoryCollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="hidden rounded-full border border-white/12 bg-slate-950/35 px-4 text-slate-100 hover:bg-white/8 lg:inline-flex"
      onClick={onToggle}
    >
      {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      {collapsed ? "Show history" : "Hide history"}
      <ChevronLeft className={cn("size-4 transition", collapsed && "rotate-180")} />
    </Button>
  );
}
