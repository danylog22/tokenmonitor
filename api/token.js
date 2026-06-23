const DEX_API = "https://api.dexscreener.com";
const { randomUUID } = require("node:crypto");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=20");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const address = String(req.query.address || "").trim();
  if (!address) {
    res.status(400).json({ error: "Missing address" });
    return;
  }

  try {
    const pairs = await fetchPairs(address);
    if (!pairs.length) {
      res.status(404).json({ error: "No Solana pair found", token: fallbackToken(address) });
      return;
    }

    res.status(200).json(pairToToken(address, pairs[0]));
  } catch (error) {
    res.status(502).json({ error: error.message || "Dexscreener unavailable", token: fallbackToken(address) });
  }
};

async function fetchPairs(address) {
  const sources = [
    `${DEX_API}/token-pairs/v1/solana/${encodeURIComponent(address)}`,
    `${DEX_API}/latest/dex/tokens/${encodeURIComponent(address)}`,
  ];

  for (const url of sources) {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) continue;
    const data = await response.json();
    const pairs = Array.isArray(data) ? data : data.pairs || [];
    const solanaPairs = pairs
      .filter((pair) => pair.chainId === "solana" && pair.priceUsd && pair.pairAddress)
      .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
    if (solanaPairs.length) return solanaPairs;
  }

  return [];
}

function pairToToken(address, pair) {
  const isBase = pair.baseToken?.address === address;
  const token = isBase ? pair.baseToken : pair.quoteToken || pair.baseToken;
  return {
    id: randomUUID(),
    address,
    contractAddress: address,
    poolAddress: pair.pairAddress,
    pairAddress: pair.pairAddress,
    chartTokenSide: isBase ? "base" : "quote",
    dexId: pair.dexId || "DEX",
    url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`,
    symbol: token?.symbol || shortAddress(address),
    name: token?.name || "Solana Token",
    logo: pair.info?.imageUrl || "",
    priceUsd: pair.priceUsd,
    marketCap: pair.marketCap || pair.fdv || "",
    liquidity: pair.liquidity?.usd || "",
    volume24h: pair.volume?.h24 || "",
    change24h: pair.priceChange?.h24 || "",
    updatedAt: Date.now(),
  };
}

function fallbackToken(address) {
  return {
    id: randomUUID(),
    address,
    contractAddress: address,
    poolAddress: "",
    pairAddress: "",
    chartTokenSide: "base",
    dexId: "Dexscreener",
    url: `https://dexscreener.com/solana/${address}`,
    symbol: shortAddress(address),
    name: "Solana Token",
    logo: "",
    priceUsd: "",
    marketCap: "",
    liquidity: "",
    volume24h: "",
    change24h: "",
    updatedAt: Date.now(),
  };
}

function shortAddress(address) {
  return address.length < 10 ? address : `${address.slice(0, 4)}...${address.slice(-4)}`;
}
