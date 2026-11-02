/**
 * Payment tokens accepted by the paid endpoint, on Celo mainnet (eip155:42220).
 * Addresses and metadata were read from the chain (scripts/check-tokens.mjs):
 * all three have 6 decimals. Prices are always explicit {amount, asset, extra}
 * objects: a bare "$0.01" would silently resolve to USDC.
 */
export const CELO_MAINNET = "eip155:42220" as const;

export const TOKENS = {
  USDC: {
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    extra: { name: "USDC", version: "2" },
  },
  USDT: {
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    extra: { name: "Tether USD" },
  },
  USAT: {
    address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
    decimals: 6,
    extra: { name: "Tether America USD" },
  },
} as const;

export type TokenSymbol = keyof typeof TOKENS;

/** "0.03" -> "30000" (base units, as a string). */
export function toBaseUnits(price: string, decimals = 6): string {
  const [whole = "0", frac = ""] = price.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac) || frac.length > decimals) {
    throw new Error(`invalid price "${price}"`);
  }
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0")).toString();
}

/** One accepts entry per token, each with an explicit amount, asset and extra. */
export function acceptsFor(opts: { price: string; payTo: string }) {
  return (Object.keys(TOKENS) as TokenSymbol[]).map((symbol) => {
    const t = TOKENS[symbol];
    return {
      scheme: "exact" as const,
      network: CELO_MAINNET,
      payTo: opts.payTo,
      price: { amount: toBaseUnits(opts.price, t.decimals), asset: t.address, extra: { ...t.extra } },
    };
  });
}
