import { supabase } from "./supabase.js";
import { state, fmt } from "./state.js";
import { toast, setActiveNav } from "./ui.js";

/**
 * ENV injection (safe):
 * - On Vercel, you’ll set these as Environment Variables and Vercel will inject them via a script tag.
 * - For local dev, you can hardcode here temporarily.
 */
window.__ENV__ = window.__ENV__ || {
  SUPABASE_URL: "PASTE_SUPABASE_URL",
  SUPABASE_ANON_KEY: "PASTE_SUPABASE_ANON_KEY"
};

const authView = document.getElementById("authView");
const appView  = document.getElementById("appView");

const tabSignIn = document.getElementById("tabSignIn");
const tabSignUp = document.getElementById("tabSignUp");
const authForm  = document.getElementById("authForm");
const authBtn   = document.getElementById("authBtn");
const authMsg   = document.getElementById("authMsg");

let mode = "signin";

tabSignIn.onclick = () => setMode("signin");
tabSignUp.onclick = () => setMode("signup");

function setMode(m){
  mode = m;
  tabSignIn.classList.toggle("active", m==="signin");
  tabSignUp.classList.toggle("active", m==="signup");
  authBtn.textContent = m==="signin" ? "Sign in" : "Create account";
  authMsg.textContent = "";
}

authForm.onsubmit = async (e) => {
  e.preventDefault();
  authMsg.textContent = "Working…";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try{
    if(mode === "signin"){
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) throw error;
      toast("Signed in");
    }else{
      const { data, error } = await supabase.auth.signUp({ email, password });
      if(error) throw error;
      toast("Account created — check email if confirmation is enabled.");
    }
  }catch(err){
    authMsg.textContent = err?.message || "Auth error";
    return;
  }
  authMsg.textContent = "";
};

document.getElementById("logoutBtn").onclick = async () => {
  await supabase.auth.signOut();
  toast("Logged out");
};

// auth state listener
supabase.auth.onAuthStateChange(async (_event, session) => {
  state.session = session;
  state.user = session?.user || null;
  if(state.user){
    document.getElementById("userEmail").textContent = state.user.email;
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    await ensureUserProfile();
    boot();
  }else{
    appView.classList.add("hidden");
    authView.classList.remove("hidden");
  }
});

// on load: check session
(async function init(){
  const { data } = await supabase.auth.getSession();
  state.session = data.session;
  state.user = data.session?.user || null;
  if(state.user){
    document.getElementById("userEmail").textContent = state.user.email;
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    await ensureUserProfile();
    boot();
  }
})();

async function ensureUserProfile(){
  // Creates the row if it doesn't exist
  const uid = state.user.id;
  const { data: existing, error: e1 } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", uid)
    .maybeSingle();

  if(e1) console.warn(e1);

  if(!existing){
    const { error: e2 } = await supabase.from("profiles").insert({
      id: uid,
      email: state.user.email,
      created_at: new Date().toISOString()
    });
    if(e2) console.warn(e2);
  }
}

function boot(){
  // nav routing
  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.onclick = () => {
      state.route = btn.dataset.route;
      render();
    };
  });

  // search
  document.getElementById("searchBtn").onclick = () => {
    const v = document.getElementById("globalSearch").value.trim().toUpperCase();
    if(v) {
      state.symbol = v;
      state.route = "markets";
      render();
    }
  };

  // initial render
  render();
  startLiveStrip();
  setInterval(startLiveStrip, 15000);
}

function setHeader(title, sub){
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSub").textContent = sub;
}

async function render(){
  setActiveNav(state.route);
  const page = document.getElementById("page");
  page.innerHTML = "";

  if(state.route === "markets"){
    setHeader("Markets", "Quotes, intraday chart, and key stats.");
    page.appendChild(await marketsPage(state.symbol));
  }

  if(state.route === "watchlist"){
    setHeader("Watchlist", "Your saved tickers (per account).");
    page.appendChild(await watchlistPage());
  }

  if(state.route === "portfolio"){
    setHeader("Paper Portfolio", "Track positions, P&L, and trades (per account).");
    page.appendChild(await portfolioPage());
  }

  if(state.route === "news"){
    setHeader("News", "Latest headlines by symbol and market.");
    page.appendChild(await newsPage(state.symbol));
  }

  if(state.route === "macro"){
    setHeader("Macro", "Rates snapshot + movers.");
    page.appendChild(await macroPage());
  }
}

/** -------------------------
 * REAL DATA CALLS (via /api/*)
 * -------------------------- */
async function apiGet(path, params={}){
  const u = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k, v));
  const r = await fetch(u.toString(), { headers: { "Accept":"application/json" } });
  if(!r.ok) throw new Error(`API error: ${r.status}`);
  return await r.json();
}

async function getQuote(symbol){
  const key = `q:${symbol}`;
  const cached = state.quotesCache.get(key);
  if(cached && (Date.now() - cached.t) < 8000) return cached.v;
  const v = await apiGet("/api/quote", { symbol });
  state.quotesCache.set(key, { t: Date.now(), v });
  return v;
}

async function getCandles(symbol, resolution="15", lookback=200){
  return await apiGet("/api/candles", { symbol, resolution, lookback });
}

async function getNews(symbol){
  return await apiGet("/api/news", { symbol });
}

async function getMovers(){
  return await apiGet("/api/movers", {});
}

/** -------------------------
 * Pages
 * -------------------------- */
async function marketsPage(symbol){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const left = document.createElement("div");
  left.className = "card";
  left.innerHTML = `<div class="muted" style="font-family:var(--mono)">SYMBOL</div>
                    <div style="display:flex; justify-content:space-between; align-items:end; gap:12px">
                      <div>
                        <div style="font-size:28px;font-weight:900">${symbol}</div>
                        <div id="qLine" class="muted" style="font-family:var(--mono)">Loading…</div>
                      </div>
                      <button id="addWL" class="ghost">+ Watchlist</button>
                    </div>
                    <div id="stats" style="margin-top:12px"></div>`;

  const right = document.createElement("div");
  right.className = "card";
  right.innerHTML = `<div class="muted" style="font-family:var(--mono)">INTRADAY (simplified)</div>
                     <canvas id="chart" height="140" style="width:100%; margin-top:10px"></canvas>
                     <div class="muted" style="margin-top:8px;font-family:var(--mono)">
                        Tip: this chart is simple by design (fast + stable). Upgrade later to TradingView lightweight charts.
                     </div>`;

  wrap.appendChild(left);
  wrap.appendChild(right);

  // Data + UI
  try{
    const q = await getQuote(symbol);
    const change = (q.dp ?? 0);
    const cls = change >= 0 ? "good" : "bad";
    left.querySelector("#qLine").innerHTML =
      `<span style="font-size:18px;font-weight:900">$${fmt(q.c)}</span>
       <span class="${cls}" style="margin-left:10px;font-family:var(--mono)">${fmt(q.d)} (${fmt(q.dp)}%)</span>`;

    left.querySelector("#stats").innerHTML = `
      <table class="table">
        <tbody>
          <tr><th>Open</th><td>$${fmt(q.o)}</td></tr>
          <tr><th>High</th><td>$${fmt(q.h)}</td></tr>
          <tr><th>Low</th><td>$${fmt(q.l)}</td></tr>
          <tr><th>Prev Close</th><td>$${fmt(q.pc)}</td></tr>
        </tbody>
      </table>
    `;

    left.querySelector("#addWL").onclick = async () => {
      await addToWatchlist(symbol);
      toast(`${symbol} added`);
    };

    const candles = await getCandles(symbol, "15", 160);
    drawChart(document.getElementById("chart"), candles.close || []);
  }catch(e){
    left.querySelector("#qLine").textContent = "Unable to load quote.";
    left.querySelector("#stats").innerHTML = `<div class="muted">${e.message}</div>`;
  }

  return wrap;
}

function drawChart(canvas, series){
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = 140 * devicePixelRatio;
  ctx.clearRect(0,0,w,h);
  if(!series || series.length < 2) return;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = 12*devicePixelRatio;

  ctx.globalAlpha = 1;
  ctx.lineWidth = 2*devicePixelRatio;
  ctx.beginPath();

  series.forEach((v,i)=>{
    const x = pad + (i/(series.length-1))*(w-2*pad);
    const y = pad + (1 - (v-min)/(max-min || 1))*(h-2*pad);
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });

  // default stroke color uses current canvas default; keep stable
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.stroke();

  // baseline
  ctx.globalAlpha = .25;
  ctx.beginPath();
  ctx.moveTo(pad, h-pad);
  ctx.lineTo(w-pad, h-pad);
  ctx.strokeStyle = "rgba(255,255,255,.65)";
  ctx.stroke();
}

async function watchlistPage(){
  const card = document.createElement("div");
  card.className = "card";

  const list = await loadWatchlist();

  card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center">
      <div style="font-weight:900">Your Watchlist</div>
      <button id="refreshWL" class="ghost">Refresh</button>
    </div>
    <div style="margin-top:12px">
      <table class="table">
        <thead><tr><th>Symbol</th><th>Last</th><th>Chg%</th><th></th></tr></thead>
        <tbody id="wlBody"></tbody>
      </table>
    </div>`;

  const body = card.querySelector("#wlBody");

  async function fill(){
    body.innerHTML = "";
    for(const sym of list){
      try{
        const q = await getQuote(sym);
        const cls = (q.dp ?? 0) >= 0 ? "good" : "bad";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-weight:900; cursor:pointer">${sym}</td>
          <td>$${fmt(q.c)}</td>
          <td class="${cls}">${fmt(q.dp)}%</td>
          <td><button class="ghost" data-del="${sym}">Remove</button></td>
        `;
        tr.querySelector("td").onclick = () => { state.symbol = sym; state.route="markets"; render(); };
        tr.querySelector("[data-del]").onclick = async () => {
          await removeFromWatchlist(sym);
          toast(`${sym} removed`);
          location.reload(); // simplest refresh; can optimize later
        };
        body.appendChild(tr);
      }catch{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${sym}</td><td colspan="3" class="muted">Quote unavailable</td>`;
        body.appendChild(tr);
      }
    }
    if(list.length === 0){
      body.innerHTML = `<tr><td colspan="4" class="muted">No symbols yet. Add from Markets.</td></tr>`;
    }
  }

  await fill();
  card.querySelector("#refreshWL").onclick = fill;
  return card;
}

async function portfolioPage(){
  const card = document.createElement("div");
  card.className = "card";

  const { positions, trades } = await loadPortfolio();

  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center">
      <div style="font-weight:900">Paper Portfolio</div>
      <button id="newTrade" class="primary" style="width:auto">New Trade</button>
    </div>
    <div class="grid two" style="margin-top:12px">
      <div class="card" style="box-shadow:none">
        <div class="muted" style="font-family:var(--mono)">POSITIONS</div>
        <table class="table" style="margin-top:8px">
          <thead><tr><th>Symbol</th><th>Qty</th><th>Avg</th><th>Last</th><th>P/L</th></tr></thead>
          <tbody id="posBody"></tbody>
        </table>
      </div>
      <div class="card" style="box-shadow:none">
        <div class="muted" style="font-family:var(--mono)">RECENT TRADES</div>
        <table class="table" style="margin-top:8px">
          <thead><tr><th>Time</th><th>Side</th><th>Symbol</th><th>Qty</th><th>Px</th></tr></thead>
          <tbody id="trdBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const posBody = card.querySelector("#posBody");
  const trdBody = card.querySelector("#trdBody");

  // Positions with live last price + P/L
  if(positions.length === 0){
    posBody.innerHTML = `<tr><td colspan="5" class="muted">No positions yet.</td></tr>`;
  }else{
    for(const p of positions){
      let last = null, pl = null;
      try{
        const q = await getQuote(p.symbol);
        last = q.c;
        pl = (last - p.avg_price) * p.qty;
      }catch{}
      const cls = (pl ?? 0) >= 0 ? "good" : "bad";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:900;cursor:pointer">${p.symbol}</td>
        <td>${p.qty}</td>
        <td>$${fmt(p.avg_price)}</td>
        <td>$${fmt(last)}</td>
        <td class="${cls}">$${fmt(pl)}</td>
      `;
      tr.querySelector("td").onclick = () => { state.symbol=p.symbol; state.route="markets"; render(); };
      posBody.appendChild(tr);
    }
  }

  // Trades
  if(trades.length === 0){
    trdBody.innerHTML = `<tr><td colspan="5" class="muted">No trades yet.</td></tr>`;
  }else{
    trades.slice(0,15).forEach(t=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="muted">${new Date(t.created_at).toLocaleString()}</td>
        <td style="font-weight:900">${t.side}</td>
        <td style="font-weight:900">${t.symbol}</td>
        <td>${t.qty}</td>
        <td>$${fmt(t.price)}</td>
      `;
      trdBody.appendChild(tr);
    });
  }

  // Trade modal (simple prompt version, stable + fast)
  card.querySelector("#newTrade").onclick = async () => {
    const symbol = prompt("Symbol (e.g. AAPL):", state.symbol)?.trim()?.toUpperCase();
    if(!symbol) return;
    const side = prompt("Side (BUY/SELL):", "BUY")?.trim()?.toUpperCase();
    if(!["BUY","SELL"].includes(side)) return toast("Invalid side");
    const qty = Number(prompt("Quantity:", "10"));
    if(!Number.isFinite(qty) || qty<=0) return toast("Invalid quantity");

    // price from real quote
    let price;
    try{
      const q = await getQuote(symbol);
      price = q.c;
    }catch{
      return toast("Could not fetch price");
    }

    await placePaperTrade({ symbol, side, qty, price });
    toast(`${side} ${qty} ${symbol} @ $${fmt(price)}`);
    render();
  };

  return card;
}

async function newsPage(symbol){
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <div style="font-weight:900">News: ${symbol}</div>
    <button id="refreshNews" class="ghost">Refresh</button>
  </div>
  <div id="newsList" style="margin-top:12px" class="muted">Loading…</div>`;

  async function fill(){
    const listEl = card.querySelector("#newsList");
    listEl.textContent = "Loading…";
    try{
      const items = await getNews(symbol);
      if(!items?.length){
        listEl.innerHTML = `<div class="muted">No recent items found.</div>`;
        return;
      }
      listEl.innerHTML = items.slice(0,20).map(n=>{
        const when = n.datetime ? new Date(n.datetime*1000).toLocaleString() : "";
        const src = n.source ? ` • ${n.source}` : "";
        const headline = (n.headline || "Headline").replaceAll("<","&lt;");
        const url = n.url || "#";
        return `
          <div style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div style="font-weight:900">${headline}</div>
            <div class="muted" style="font-family:var(--mono);font-size:12px">${when}${src}</div>
            <div style="margin-top:6px"><a href="${url}" target="_blank" rel="noreferrer" style="color:var(--text)">Open</a></div>
          </div>
        `;
      }).join("");
    }catch(e){
      listEl.innerHTML = `<div class="muted">News unavailable: ${e.message}</div>`;
    }
  }

  card.querySelector("#refreshNews").onclick = fill;
  await fill();
  return card;
}

async function macroPage(){
  const wrap = document.createElement("div");
  wrap.className = "grid two";

  const moversCard = document.createElement("div");
  moversCard.className = "card";
  moversCard.innerHTML = `<div style="font-weight:900">Top Movers (sample universe)</div>
    <div class="muted" style="margin-top:6px;font-family:var(--mono)">Uses Finnhub “most active / gainers/losers” style endpoints where available.</div>
    <table class="table" style="margin-top:10px">
      <thead><tr><th>Symbol</th><th>Last</th><th>Chg%</th></tr></thead>
      <tbody id="mvBody"></tbody>
    </table>`;

  const ratesCard = document.createElement("div");
  ratesCard.className = "card";
  ratesCard.innerHTML = `<div style="font-weight:900">Rates Snapshot (basic)</div>
    <div class="muted" style="margin-top:6px;font-family:var(--mono)">Placeholder: you can wire FRED later via the same backend pattern.</div>
    <div class="muted" style="margin-top:10px">Add UST 2Y/10Y, DXY, Oil, Gold here next.</div>`;

  wrap.appendChild(moversCard);
  wrap.appendChild(ratesCard);

  const mvBody = moversCard.querySelector("#mvBody");
  try{
    const movers = await getMovers();
    mvBody.innerHTML = "";
    movers.slice(0,15).forEach(m=>{
      const cls = (m.dp ?? 0) >= 0 ? "good" : "bad";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td style="font-weight:900;cursor:pointer">${m.symbol}</td>
                      <td>$${fmt(m.c)}</td>
                      <td class="${cls}">${fmt(m.dp)}%</td>`;
      tr.querySelector("td").onclick = () => { state.symbol=m.symbol; state.route="markets"; render(); };
      mvBody.appendChild(tr);
    });
  }catch(e){
    mvBody.innerHTML = `<tr><td colspan="3" class="muted">Movers unavailable: ${e.message}</td></tr>`;
  }

  return wrap;
}

async function startLiveStrip(){
  const el = document.getElementById("liveStrip");
  el.innerHTML = "";
  for(const s of state.liveStripSymbols){
    try{
      const q = await getQuote(s);
      const cls = (q.dp ?? 0) >= 0 ? "good" : "bad";
      const span = document.createElement("span");
      span.innerHTML = `<b>${s}</b> $${fmt(q.c)} <span class="${cls}">${fmt(q.dp)}%</span>`;
      el.appendChild(span);
    }catch{
      const span = document.createElement("span");
      span.innerHTML = `<b>${s}</b> —`;
      el.appendChild(span);
    }
  }
}

/** -------------------------
 * DB: Watchlist / Portfolio
 * -------------------------- */
async function loadWatchlist(){
  const { data, error } = await supabase
    .from("watchlist")
    .select("symbol")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending:false });

  if(error) { console.warn(error); return []; }
  return data.map(x=>x.symbol);
}

async function addToWatchlist(symbol){
  const { error } = await supabase.from("watchlist").insert({
    user_id: state.user.id,
    symbol
  });
  if(error) console.warn(error);
}

async function removeFromWatchlist(symbol){
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", state.user.id)
    .eq("symbol", symbol);
  if(error) console.warn(error);
}

async function loadPortfolio(){
  const uid = state.user.id;

  const { data: positions, error: e1 } = await supabase
    .from("positions")
    .select("symbol,qty,avg_price")
    .eq("user_id", uid);

  const { data: trades, error: e2 } = await supabase
    .from("trades")
    .select("symbol,side,qty,price,created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending:false })
    .limit(50);

  if(e1) console.warn(e1);
  if(e2) console.warn(e2);

  return { positions: positions || [], trades: trades || [] };
}

async function placePaperTrade({symbol, side, qty, price}){
  const uid = state.user.id;

  // insert trade
  const { error: e1 } = await supabase.from("trades").insert({
    user_id: uid, symbol, side, qty, price
  });
  if(e1) console.warn(e1);

  // update positions (simple avg price model)
  const { data: pos, error: e2 } = await supabase
    .from("positions")
    .select("symbol,qty,avg_price")
    .eq("user_id", uid)
    .eq("symbol", symbol)
    .maybeSingle();

  if(e2) console.warn(e2);

  const sign = side === "BUY" ? 1 : -1;
  const newQty = (pos?.qty || 0) + sign*qty;

  if(newQty === 0){
    await supabase.from("positions").delete().eq("user_id", uid).eq("symbol", symbol);
    return;
  }

  let newAvg = pos?.avg_price || price;
  if(side === "BUY"){
    const oldQty = (pos?.qty || 0);
    const oldAvg = (pos?.avg_price || price);
    newAvg = ((oldQty*oldAvg) + (qty*price)) / (oldQty + qty);
  } // SELL leaves avg as-is

  if(pos){
    await supabase.from("positions")
      .update({ qty: newQty, avg_price: newAvg })
      .eq("user_id", uid).eq("symbol", symbol);
  }else{
    await supabase.from("positions").insert({
      user_id: uid, symbol, qty: newQty, avg_price: newAvg
    });
  }
}
