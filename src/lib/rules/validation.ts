import { RuleError } from "@/lib/rules/errors";

export type RuleMatchField = "both" | "recipient" | "title";

const MATCH_FIELDS: RuleMatchField[] = ["title", "recipient", "both"];

export function validateMatchField(value: unknown): RuleMatchField {
  if (typeof value !== "string") {
    throw new RuleError("Rule match field is required", { field: "match_field" });
  }

  const matchField = value.trim().toLowerCase() as RuleMatchField;

  if (!MATCH_FIELDS.includes(matchField)) {
    throw new RuleError("Rule match field must be title, recipient, or both", {
      field: "match_field",
    });
  }

  return matchField;
}

export function validateMatchText(value: unknown) {
  if (typeof value !== "string") {
    throw new RuleError("Rule match text is required", { field: "match_text" });
  }

  const matchText = value.trim();

  if (!matchText) {
    throw new RuleError("Rule match text cannot be blank", { field: "match_text" });
  }

  return matchText;
}

export function validateTargetCategoryId(value: unknown) {
  if (typeof value !== "string") {
    throw new RuleError("Target category is required", { field: "target_category_id" });
  }

  const categoryId = value.trim();

  if (!categoryId) {
    throw new RuleError("Target category is required", { field: "target_category_id" });
  }

  return categoryId;
}
