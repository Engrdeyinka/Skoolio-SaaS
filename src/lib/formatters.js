export function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export function formatCurrency(value, options = {}) {
  const amount = Number(value || 0);
  const {
    prefix = "N",
    minimumFractionDigits = 0,
    maximumFractionDigits = 0,
  } = options;

  return `${prefix}${amount.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  })}`;
}

export function formatCompactCurrency(value, options = {}) {
  const amount = Number(value || 0);
  const prefix = options.prefix || "N";
  const absAmount = Math.abs(amount);

  if (absAmount >= 1_000_000_000) {
    return `${prefix}${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (absAmount >= 1_000_000) {
    return `${prefix}${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (absAmount >= 1_000) {
    return `${prefix}${(amount / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(amount, options);
}

export function formatPercent(value, options = {}) {
  if (value == null || Number.isNaN(Number(value))) return options.fallback || "N/A";
  const rounded = options.decimals != null
    ? Number(value).toFixed(options.decimals)
    : Math.round(Number(value));
  return `${rounded}%`;
}
