import { ImportError } from "@/lib/imports/errors";

export interface ImportedTransactionDraft {
  transaction_date: string;
  title: string;
  recipient: string;
  amount: number;
}

export interface ParsedRevolutCsv {
  period_end: string;
  period_start: string;
  statement_month: string;
  transactions: ImportedTransactionDraft[];
}

const EXPECTED_HEADERS = [
  "Rodzaj",
  "Produkt",
  "Data rozpoczecia",
  "Data zrealizowania",
  "Opis",
  "Kwota",
  "Oplata",
  "Waluta",
  "State",
  "Saldo",
] as const;

const COMPLETED_STATE = "zakonczono";
const NORMALIZED_EXPECTED_HEADERS = EXPECTED_HEADERS.map(normalizeHeader);

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

    if (char === "," && !inQuotes) {
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
    throw new ImportError("The Revolut CSV contains an unterminated quoted value", { field: "file" });
  }

  if (currentValue || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((value) => value.trim() !== ""));
}

function normalizeHeader(header: string) {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/Ł/g, "L")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseDateOnly(value: string, rowNumber: number) {
  const trimmed = value.trim();
  const datePart = trimmed.split(/[ T]/, 1)[0];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

  if (!match) {
    throw new ImportError(`Row ${rowNumber}: date "${value}" does not match YYYY-MM-DD`, { field: "file" });
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
    throw new ImportError(`Row ${rowNumber}: date "${value}" is not a valid calendar date`, { field: "file" });
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function parseAmount(value: string, rowNumber: number) {
  const normalized = value.trim().replace(/\s/g, "");
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    throw new ImportError(`Row ${rowNumber}: amount "${value}" is not a valid number`, { field: "file" });
  }

  return amount;
}

function parseNetAmount(amountValue: string, feeValue: string, rowNumber: number) {
  const amount = parseAmount(amountValue, rowNumber);
  const fee = parseAmount(feeValue, rowNumber);

  return amount - fee;
}

function normalizeMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

export function parseRevolutCsv(text: string): ParsedRevolutCsv {
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new ImportError("The Revolut CSV must contain a header row and at least one transaction row", {
      field: "file",
    });
  }

  const headers = rows[0].map(normalizeHeader);

  if (
    headers.length !== EXPECTED_HEADERS.length ||
    NORMALIZED_EXPECTED_HEADERS.some((expectedHeader, index) => headers[index] !== expectedHeader)
  ) {
    throw new ImportError(`Unsupported Revolut CSV header. Expected: ${EXPECTED_HEADERS.join(", ")}`, {
      field: "file",
    });
  }

  const transactions = rows.slice(1).flatMap((row, rowIndex) => {
    const currentRowNumber = rowIndex + 2;

    if (row.length !== EXPECTED_HEADERS.length) {
      throw new ImportError(
        `Row ${currentRowNumber}: expected ${EXPECTED_HEADERS.length} columns, received ${row.length}`,
        { field: "file" },
      );
    }

    const values = Object.fromEntries(headers.map((header, index) => [header, row[index]?.trim() ?? ""]));
    const state = normalizeValue(values.State);

    if (state !== COMPLETED_STATE) {
      return [];
    }

    const description = values.Opis;

    if (!description) {
      throw new ImportError(`Row ${currentRowNumber}: Opis cannot be blank`, { field: "file" });
    }

    if (!values["Data zrealizowania"]) {
      throw new ImportError(`Row ${currentRowNumber}: completed rows require Data zrealizowania`, {
        field: "file",
      });
    }

    const transactionDate = parseDateOnly(values["Data zrealizowania"], currentRowNumber);

    return [
      {
        amount: parseNetAmount(values.Kwota, values.Oplata, currentRowNumber),
        recipient: description,
        title: values.Rodzaj || description,
        transaction_date: transactionDate,
      },
    ];
  });

  if (transactions.length === 0) {
    throw new ImportError("The supported Revolut CSV must contain at least one completed transaction", {
      field: "file",
    });
  }

  const statementMonth = normalizeMonth(transactions[0].transaction_date);

  if (transactions.some((transaction) => normalizeMonth(transaction.transaction_date) !== statementMonth)) {
    throw new ImportError("The supported Revolut CSV must contain transactions from exactly one calendar month", {
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
