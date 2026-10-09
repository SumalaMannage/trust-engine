const CURRENCY_PREFIX: Record<string, string> = { LKR: "Rs" };

export function money(amount: number, currency = "LKR"): string {
  const prefix = CURRENCY_PREFIX[currency] ?? currency;
  return `${prefix} ${amount.toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
}

export function moneyRange(min: number, max: number, currency = "LKR"): string {
  const prefix = CURRENCY_PREFIX[currency] ?? currency;
  return `${prefix} ${min.toLocaleString("en-LK")}–${max.toLocaleString("en-LK")}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function year(isoDate?: string | null): string | null {
  return isoDate ? isoDate.slice(0, 4) : null;
}
