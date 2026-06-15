import { useState, type ChangeEvent, type SyntheticEvent } from "react";
import type { ExistingImportBatchSummary } from "@/lib/imports/data";
import type { ImportedTransactionDraft, SupportedBank } from "@/lib/imports/types";
import { Button } from "@/components/ui/button";

export interface ImportPreviewPayload {
  bank: SupportedBank;
  existing_batch: ExistingImportBatchSummary | null;
  period_end: string;
  period_start: string;
  source_filename: string | null;
  statement_month: string;
  transactions: ImportedTransactionDraft[];
}

interface Props {
  commitBlockedReason?: string | null;
  isCommitBlocked?: boolean;
  isCommitting: boolean;
  onPreviewLoaded: (preview: ImportPreviewPayload) => void;
  onCommitRequested: (confirmReplace: boolean) => Promise<void>;
  preview: ImportPreviewPayload | null;
}

const BANK_COPY: Record<
  SupportedBank,
  {
    badge: string;
    description: string;
    headline: string;
    label: string;
  }
> = {
  ing: {
    badge: "Bank: ING",
    description:
      "The ING parser scans the export preamble, supports the exact sample format, and keeps same-month replacement explicit.",
    headline: "Preview the supported ING CSV before saving.",
    label: "ING CSV",
  },
  revolut: {
    badge: "Bank: Revolut",
    description:
      "The Revolut parser imports completed rows only, derives the statement month from completion dates, and blocks replacement until you confirm it.",
    headline: "Preview the supported Revolut CSV before saving.",
    label: "Revolut CSV",
  },
};

export function ImportUploadForm({
  commitBlockedReason,
  isCommitBlocked = false,
  isCommitting,
  onPreviewLoaded,
  onCommitRequested,
  preview,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [selectedBank, setSelectedBank] = useState<SupportedBank>("revolut");

  async function handlePreview(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose a supported CSV file before previewing.");
      return;
    }

    setIsPreviewing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("bank", selectedBank);
      formData.set("file", file);

      const response = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ImportPreviewPayload & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not preview this import");
      }

      onPreviewLoaded(payload);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not preview this import");
    } finally {
      setIsPreviewing(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setFile(event.target.files?.[0] ?? null);
  }

  const copy = BANK_COPY[selectedBank];

  return (
    <section className="rounded-[28px] border border-white/12 bg-white/8 p-6 shadow-[0_20px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-emerald-200/70 uppercase">Upload Statement</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{copy.headline}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/75">{copy.description}</p>
        </div>
        <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-100">
          {copy.badge}
        </div>
      </div>

      <form className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handlePreview}>
        <div className="grid gap-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-100">Bank</legend>
            <div className="flex flex-wrap gap-3" data-testid="bank-selector">
              {(["revolut", "ing"] as SupportedBank[]).map((bank) => {
                const isSelected = selectedBank === bank;

                return (
                  <label
                    key={bank}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                      isSelected
                        ? "border-emerald-200/60 bg-emerald-300/20 text-white"
                        : "border-white/12 bg-slate-950/25 text-slate-200 hover:border-emerald-200/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="bank"
                      value={bank}
                      checked={isSelected}
                      onChange={() => {
                        setSelectedBank(bank);
                        setError(null);
                      }}
                      className="sr-only"
                    />
                    <span>{BANK_COPY[bank].label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-100">Statement file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full rounded-2xl border border-white/12 bg-slate-950/35 px-4 py-3 text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-emerald-300 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950"
            />
          </label>
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            className="h-12 w-full rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200 lg:w-auto"
            disabled={isPreviewing}
          >
            {isPreviewing ? "Previewing..." : "Preview import"}
          </Button>
        </div>
      </form>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      {preview && (
        <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/30 p-5">
          <div className="grid gap-4 md:grid-cols-5">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">Bank</p>
              <p className="mt-2 text-base font-semibold text-white">{BANK_COPY[preview.bank].label}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">Statement month</p>
              <p className="mt-2 text-base font-semibold text-white">{preview.statement_month}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">Period</p>
              <p className="mt-2 text-base font-semibold text-white">
                {preview.period_start} to {preview.period_end}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">Transactions</p>
              <p className="mt-2 text-base font-semibold text-white">{preview.transactions.length} imported rows</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-slate-400 uppercase">Source file</p>
              <p className="mt-2 truncate text-base font-semibold text-white">
                {preview.source_filename ?? "uploaded CSV"}
              </p>
            </div>
          </div>

          {preview.existing_batch ? (
            <div
              className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/12 p-4 text-sm text-amber-50"
              data-testid="replace-warning"
            >
              <p className="font-semibold">Existing batch found for this bank and month.</p>
              <p className="mt-2 text-amber-100/85">
                Replacing will overwrite the saved {preview.existing_batch.statement_month} batch imported from{" "}
                {preview.existing_batch.source_filename ?? "the previous file"}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="rounded-2xl bg-amber-300 text-slate-950 hover:bg-amber-200"
                  disabled={isCommitting || isCommitBlocked}
                  onClick={() => {
                    void onCommitRequested(true);
                  }}
                >
                  {isCommitting ? "Replacing..." : "Replace existing batch"}
                </Button>
              </div>
              {commitBlockedReason && <p className="mt-3 text-amber-100/85">{commitBlockedReason}</p>}
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-50">
              <div>
                <p>This import will create a new monthly batch and open it in review mode.</p>
                {commitBlockedReason && <p className="mt-2 text-emerald-100/85">{commitBlockedReason}</p>}
              </div>
              <Button
                type="button"
                className="rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                disabled={isCommitting || isCommitBlocked}
                onClick={() => {
                  void onCommitRequested(false);
                }}
              >
                {isCommitting ? "Saving..." : "Save import batch"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
