const STORAGE_KEY = "solana-token-monitor-vercel-v1";
const LEGACY_KEYS = ["solana-token-monitor-v3", "solana-token-monitor-v2", "solana-token-monitor-v1"];
const DEX_API = "https://api.dexscreener.com";

const fallback = {
  pages: [
    {
      id: crypto.randomUUID(),
      name: "Main",
      tokens: [],
    },
  ],
  activePageId: null,
  columns: 3,
  timeframe: "1m",
  sidebarCollapsed: false,
};

let refreshTimer = null;
const state = loadState();
if (!state.activePageId) state.activePageId = state.pages[0].id;
if (!state.timeframe) state.timeframe = "1m";

const els = {
  pageList: document.querySelector("#pageList"),
  addPageBtn: document.querySelector("#addPageBtn"),
  addTokenForm: document.querySelector("#addTokenForm"),
  tokenAddress: document.querySelector("#tokenAddress"),
  chartGrid: document.querySelector("#chartGrid"),
  emptyState: document.querySelector("#emptyState"),
  pageTitle: document.querySelector("#pageTitle"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  pageNameInput: document.querySelector("#pageNameInput"),
  renamePageBtn: document.querySelector("#renamePageBtn"),
  deletePageBtn: document.querySelector("#deletePageBtn"),
  gridSelect: document.querySelector("#gridSelect"),
  timeframeSelect: document.querySelector("#timeframeSelect"),
  refreshBtn: document.querySelector("#refreshBtn"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  chartTemplate: document.querySelector("#chartTemplate"),
};

els.gridSelect.value = String(state.columns);
els.timeframeSelect.value = state.timeframe;
applySidebarState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.pages?.length) return saved;
  } catch {
    return structuredClone(fallback);
  }

  for (const key of LEGACY_KEYS) {
    try {
      const legacy = JSON.parse(localStorage.getItem(key));
      if (legacy?.pages?.length) {
        return {
          ...structuredClone(fallback),
          ...legacy,
          pages: legacy.pages.map((page) => ({
            ...page,
            tokens: (page.tokens || []).map((token) => ({
              ...token,
              pairAddress: token.pairAddress || token.poolAddress,
            })),
          })),
        };
      }
    } catch {
      // Try the next local key.
    }
  }

  return structuredClone(fallback);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", Boolean(state.sidebarCollapsed));
  if (!els.sidebarToggle) return;
  els.sidebarToggle.textContent = state.sidebarCollapsed ? "›" : "‹";
  els.sidebarToggle.title = state.sidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral";
  els.sidebarToggle.setAttribute("aria-label", els.sidebarToggle.title);
}

function getActivePage() {
  return state.pages.find((page) => page.id === state.activePageId) || state.pages[0];
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: number >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: number >= 1 ? 2 : 8,
  }).format(number);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

function normalizeAddress(value) {
  return value.trim();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  return response.json();
}

async function fetchDexPairs(address) {
  const sources = [
    `${DEX_API}/token-pairs/v1/solana/${address}`,
    `${DEX_API}/latest/dex/tokens/${address}`,
  ];

  for (const url of sources) {
    try {
      const data = await fetchJson(url);
      const pairs = Array.isArray(data) ? data : data.pairs || [];
      const solanaPairs = pairs
        .filter((pair) => pair.chainId === "solana" && pair.priceUsd)
        .sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
      if (solanaPairs.length) return solanaPairs;
    } catch {
      // Try the next Dexscreener endpoint.
    }
  }

  return [];
}

async function fetchToken(address) {
  const pairs = await fetchDexPairs(address);
  if (!pairs.length) return fallbackToken(address);
  return pairToToken(address, pairs[0]);
}

function pairToToken(address, pair) {
  const isBase = pair.baseToken?.address === address;
  const token = isBase ? pair.baseToken : pair.quoteToken || pair.baseToken;
  return {
    id: crypto.randomUUID(),
    address,
    poolAddress: pair.pairAddress,
    pairAddress: pair.pairAddress,
    chartTokenSide: isBase ? "base" : "quote",
    dexId: pair.dexId || "DEX",
    url: pair.url || `https://dexscreener.com/solana/${pair.pairAddress}`,
    symbol: token?.symbol || shortAddress(address),
    name: token?.name || "Solana Token",
    logo: pair.info?.imageUrl || "",
    priceUsd: pair.priceUsd,
    marketCap: pair.marketCap || pair.fdv,
    liquidity: pair.liquidity?.usd,
    volume24h: pair.volume?.h24,
    change24h: pair.priceChange?.h24,
    updatedAt: Date.now(),
  };
}

function fallbackToken(address) {
  return {
    id: crypto.randomUUID(),
    address,
    poolAddress: address,
    pairAddress: address,
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

async function refreshToken(token) {
  const fresh = await fetchToken(token.address);
  return { ...token, ...fresh, id: token.id };
}

function chartUrl(token) {
  const pair = token.pairAddress || token.poolAddress || token.address;
  return `https://dexscreener.com/solana/${pair}?embed=1&theme=dark&trades=0&info=0`;
}

function render() {
  const activePage = getActivePage();
  els.pageList.innerHTML = "";
  state.pages.forEach((page) => {
    const btn = document.createElement("button");
    btn.className = `page-btn${page.id === activePage.id ? " active" : ""}`;
    btn.textContent = `${page.name} (${page.tokens.length})`;
    btn.addEventListener("click", () => {
      state.activePageId = page.id;
      saveState();
      render();
    });
    els.pageList.appendChild(btn);
  });

  els.pageTitle.textContent = activePage.name;
  els.pageSubtitle.textContent = `${activePage.tokens.length} grafica${activePage.tokens.length === 1 ? "" : "s"} activas · cache local`;
  els.pageNameInput.value = activePage.name;
  els.emptyState.hidden = activePage.tokens.length > 0;

  els.chartGrid.className = `chart-grid cols-${state.columns}`;
  els.chartGrid.innerHTML = "";
  activePage.tokens.forEach((token) => {
    els.chartGrid.appendChild(renderChart(token, activePage));
  });

  activePage.tokens.forEach(resolveMissingTokenImage);
  scheduleAutoRefresh();
}

function renderChart(token, page) {
  const node = els.chartTemplate.content.firstElementChild.cloneNode(true);
  const logo = node.querySelector(".token-logo");
  const title = node.querySelector(".token-title");
  const meta = node.querySelector(".token-meta");
  const iframe = node.querySelector("iframe");
  const openLink = node.querySelector(".open-link");
  const avatarImg = node.querySelector(".token-avatar-img");
  const avatarFallback = node.querySelector(".token-avatar-fallback");

  node.dataset.tokenId = token.id;
  logo.src = token.logo || "";
  logo.hidden = !token.logo;
  avatarImg.src = token.logo || "";
  avatarImg.hidden = !token.logo;
  avatarFallback.hidden = Boolean(token.logo);
  avatarFallback.textContent = (token.symbol || token.address || "?").slice(0, 3).toUpperCase();
  avatarImg.addEventListener("error", () => {
    avatarImg.hidden = true;
    avatarFallback.hidden = false;
  });
  node.querySelector(".token-avatar-overlay").title = `${token.symbol || "Token"} · ${shortAddress(token.address)}`;
  title.textContent = `${token.symbol || "TOKEN"} / SOL`;
  meta.textContent = `${token.name || "Solana Token"} · ${token.dexId || "DEX"} · ${shortAddress(token.address)}`;
  iframe.src = chartUrl(token);
  openLink.href = token.url || `https://dexscreener.com/solana/${token.pairAddress || token.poolAddress || token.address}`;

  node.querySelector('[data-stat="marketCap"]').textContent = formatCurrency(token.marketCap);
  node.querySelector('[data-stat="price"]').textContent = formatCurrency(token.priceUsd);
  node.querySelector('[data-stat="liquidity"]').textContent = formatCurrency(token.liquidity);
  node.querySelector('[data-stat="volume"]').textContent = formatNumber(token.volume24h);

  node.querySelector(".remove-token").addEventListener("click", () => {
    page.tokens = page.tokens.filter((item) => item.id !== token.id);
    saveState();
    render();
  });

  return node;
}

function updateTokenStats(token) {
  const card = document.querySelector(`[data-token-id="${token.id}"]`);
  if (!card) return;
  card.querySelector('[data-stat="marketCap"]').textContent = formatCurrency(token.marketCap);
  card.querySelector('[data-stat="price"]').textContent = formatCurrency(token.priceUsd);
  card.querySelector('[data-stat="liquidity"]').textContent = formatCurrency(token.liquidity);
  card.querySelector('[data-stat="volume"]').textContent = formatNumber(token.volume24h);
  const avatarImg = card.querySelector(".token-avatar-img");
  const avatarFallback = card.querySelector(".token-avatar-fallback");
  if (avatarImg && avatarFallback) {
    avatarImg.src = token.logo || "";
    avatarImg.hidden = !token.logo;
    avatarFallback.hidden = Boolean(token.logo);
    avatarFallback.textContent = (token.symbol || token.address || "?").slice(0, 3).toUpperCase();
  }
}

async function resolveMissingTokenImage(token) {
  if (token.logo) return;
  try {
    const pairs = await fetchDexPairs(token.address);
    const pair = pairs.find((item) => item.info?.imageUrl);
    if (!pair?.info?.imageUrl) return;
    token.logo = pair.info.imageUrl;
    saveState();
    updateTokenStats(token);
  } catch {
    // Keep fallback text if image discovery is unavailable.
  }
}

function shortAddress(address) {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function toast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => refreshActivePage(false), 10000);
}

async function refreshActivePage(showLoading = true) {
  const page = getActivePage();
  if (!page.tokens.length) return;
  if (showLoading) {
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = "Actualizando...";
  }
  try {
    page.tokens = await Promise.all(page.tokens.map(refreshToken));
    page.tokens.forEach(updateTokenStats);
    saveState();
  } catch (error) {
    if (showLoading) toast(error.message || "No pude actualizar todos los tokens.");
  } finally {
    if (showLoading) {
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = "Actualizar";
    }
  }
}

els.addPageBtn.addEventListener("click", () => {
  const nextNumber = state.pages.length + 1;
  const page = { id: crypto.randomUUID(), name: `Pagina ${nextNumber}`, tokens: [] };
  state.pages.push(page);
  state.activePageId = page.id;
  saveState();
  render();
});

els.renamePageBtn.addEventListener("click", () => {
  const name = els.pageNameInput.value.trim();
  if (!name) return toast("Escribe un nombre para la pagina.");
  getActivePage().name = name;
  saveState();
  render();
});

els.deletePageBtn.addEventListener("click", () => {
  if (state.pages.length === 1) return toast("Debe existir al menos una pagina.");
  const active = getActivePage();
  state.pages = state.pages.filter((page) => page.id !== active.id);
  state.activePageId = state.pages[0].id;
  saveState();
  render();
});

els.gridSelect.addEventListener("change", () => {
  state.columns = Number(els.gridSelect.value);
  saveState();
  render();
});

els.timeframeSelect.addEventListener("change", () => {
  state.timeframe = els.timeframeSelect.value;
  saveState();
  document.querySelectorAll(".chart-card iframe").forEach((iframe) => {
    iframe.src = iframe.src;
  });
});

els.addTokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = normalizeAddress(els.tokenAddress.value);
  if (!address) return toast("Pega un CA de Solana.");

  const page = getActivePage();
  if (page.tokens.some((token) => token.address === address)) {
    return toast("Ese token ya esta en esta pagina.");
  }

  const submit = els.addTokenForm.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Buscando...";
  try {
    const token = await fetchToken(address);
    page.tokens.unshift(token);
    els.tokenAddress.value = "";
    saveState();
    render();
  } catch (error) {
    toast(error.message || "No pude agregar el token.");
  } finally {
    submit.disabled = false;
    submit.textContent = "Agregar grafica";
  }
});

els.refreshBtn.addEventListener("click", () => refreshActivePage(true));

els.sidebarToggle.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarState();
  saveState();
});

render();
