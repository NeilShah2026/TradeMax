export type RangeKey = "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

export const RANGES: RangeKey[] = ["1W", "1M", "3M", "YTD", "1Y", "ALL"];

export const RANGE_LABEL: Record<RangeKey, string> = {
  "1W": "past week",
  "1M": "past month",
  "3M": "past 3 months",
  YTD: "year to date",
  "1Y": "past year",
  ALL: "all time",
};

/** Start of the range (inclusive), or null for all time */
export function rangeStart(range: RangeKey, now = new Date()): Date | null {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case "1W":
      d.setDate(d.getDate() - 7);
      return d;
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "YTD":
      return new Date(now.getFullYear(), 0, 1);
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    default:
      return null;
  }
}
