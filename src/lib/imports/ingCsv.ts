import { ImportError } from "@/lib/imports/errors";
import { inferCashflowTypeFromAmount, type ParsedImportCsv } from "@/lib/imports/types";

const HEADER_INDEXES = {
  amount: 8,
  fallbackAmount: 10,
  bookingDate: 1,
  recipient: 2,
  details: 6,
  title: 3,
  transactionDate: 0,
} as const;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  if (inQuotes) {
    throw new ImportError("The ING CSV contains an unterminated quoted value", { field: "file" });
  }

  if (currentValue || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value.trim() !== ""));
}

function normalizeCell(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9() ]+/g, "")
    .replace(/\s+/g, " ");
}

function looksLikeHeaderRow(row: string[]) {
  const detailsHeader = normalizeCell(row[6] ?? "");

  return (
    normalizeCell(row[0] ?? "") === "data transakcji" &&
    normalizeCell(row[2] ?? "") === "dane kontrahenta" &&
    detailsHeader.startsWith("szczeg") &&
    normalizeCell(row[8] ?? "").startsWith("kwota transakcji")
  );
}

function parseDateOnly(value: string, rowNumber: number, fieldLabel: string) {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (!match) {
    throw new ImportError(`Row ${rowNumber}: ${fieldLabel} "${value}" does not match YYYY-MM-DD`, { field: "file" });
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    throw new ImportError(`Row ${rowNumber}: ${fieldLabel} "${value}" is not a valid calendar date`, {
      field: "file",
    });
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function parseAmount(value: string, rowNumber: number) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    throw new ImportError(`Row ${rowNumber}: amount "${value}" is not a valid number`, { field: "file" });
  }

  return amount;
}

function readAmountValue(row: string[]) {
  return row[HEADER_INDEXES.amount]?.trim() || row[HEADER_INDEXES.fallbackAmount]?.trim() || "";
}

function normalizeMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function findHeaderRowIndex(rows: string[][]) {
  const headerIndex = rows.findIndex(looksLikeHeaderRow);

  if (headerIndex === -1) {
    throw new ImportError("Unsupported ING CSV header. Expected the transaction table from the provided ING sample.", {
      field: "file",
    });
  }

  return headerIndex;
}

function isFooterRow(row: string[]) {
  return normalizeCell(row[0] ?? "").startsWith("dokument ma charakter informacyjny");
}

export function parseIngCsv(text: string): ParsedImportCsv {
  const rows = parseCsv(text);
  const headerIndex = findHeaderRowIndex(rows);
  const transactions = rows.slice(headerIndex + 1).flatMap((row, rowIndex) => {
    const currentRowNumber = headerIndex + rowIndex + 2;

    if (isFooterRow(row)) {
      return [];
    }

    const transactionDateRaw = row[HEADER_INDEXES.transactionDate]?.trim() ?? "";
    const bookingDateRaw = row[HEADER_INDEXES.bookingDate]?.trim() ?? "";
    const recipient = row[HEADER_INDEXES.recipient]?.trim() ?? "";
    const details = row[HEADER_INDEXES.details]?.trim() ?? "";
    const title = row[HEADER_INDEXES.title]?.trim() ?? "";
    const amountRaw = readAmountValue(row);

    if (!transactionDateRaw && !bookingDateRaw && !recipient && !details && !title && !amountRaw) {
      return [];
    }

    if (!transactionDateRaw) {
      throw new ImportError(`Row ${currentRowNumber}: Data transakcji is required`, { field: "file" });
    }

    if (!amountRaw) {
      throw new ImportError(`Row ${currentRowNumber}: Kwota transakcji (waluta rachunku) is required`, {
        field: "file",
      });
    }

    const transactionDate = parseDateOnly(transactionDateRaw, currentRowNumber, "transaction date");
    const effectiveDate = bookingDateRaw
      ? parseDateOnly(bookingDateRaw, currentRowNumber, "booking date")
      : transactionDate;
    const recipientValue = recipient || title || details;
    const titleValue = details || title || recipientValue;

    if (!recipientValue) {
      throw new ImportError(`Row ${currentRowNumber}: Dane kontrahenta cannot be blank`, { field: "file" });
    }

    if (!titleValue) {
      throw new ImportError(`Row ${currentRowNumber}: transaction title cannot be blank`, { field: "file" });
    }

    const amount = parseAmount(amountRaw, currentRowNumber);

    return [
      {
        amount,
        cashflow_type: inferCashflowTypeFromAmount(amount),
        recipient: recipientValue,
        title: titleValue,
        transaction_date: effectiveDate,
      },
    ];
  });

  if (transactions.length === 0) {
    throw new ImportError("The supported ING CSV must contain at least one importable transaction row", {
      field: "file",
    });
  }

  const statementMonth = normalizeMonth(transactions[0].transaction_date);

  if (transactions.some((transaction) => normalizeMonth(transaction.transaction_date) !== statementMonth)) {
    throw new ImportError("The supported ING CSV must contain transactions from exactly one calendar month", {
      field: "file",
    });
  }

  const dates = transactions.map((transaction) => transaction.transaction_date).sort();

  return {
    period_end: dates[dates.length - 1],
    period_start: dates[0],
    statement_month: statementMonth,
    transactions,
  };
}
