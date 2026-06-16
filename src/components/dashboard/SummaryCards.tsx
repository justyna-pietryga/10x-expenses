interface Props {
  incompleteReviewSpend: number;
  reviewedCategorizedSpend: number;
  totalImportedSpend: number;
  totalIncome: number;
}

function formatAmount(amount: number) {
  return `${amount.toFixed(2)} PLN`;
}

export function SummaryCards({
  incompleteReviewSpend,
  reviewedCategorizedSpend,
  totalImportedSpend,
  totalIncome,
}: Props) {
  const cards = [
    { label: "Income basis", value: formatAmount(totalIncome) },
    { label: "Imported expense spend", value: formatAmount(totalImportedSpend) },
    { label: "Trusted categorized spend", value: formatAmount(reviewedCategorizedSpend) },
    { label: "Incomplete review spend", value: formatAmount(incompleteReviewSpend) },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className="rounded-[26px] border border-white/12 bg-white/8 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.3)] backdrop-blur-xl"
        >
          <p className="text-xs font-semibold tracking-[0.24em] text-slate-400 uppercase">{card.label}</p>
          <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
        </article>
      ))}
    </section>
  );
}
