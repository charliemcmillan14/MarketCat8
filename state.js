export const state = {
  session: null,
  user: null,
  route: "markets",
  symbol: "SPY",
  quotesCache: new Map(),
  liveStripSymbols: ["SPY","QQQ","IWM","AAPL","MSFT","TSLA","NVDA","BTCUSD","ETHUSD","EURUSD"]
};

export function fmt(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const x = Number(n);
  if (Math.abs(x) >= 1e12) return (x/1e12).toFixed(2)+"T";
  if (Math.abs(x) >= 1e9) return (x/1e9).toFixed(2)+"B";
  if (Math.abs(x) >= 1e6) return (x/1e6).toFixed(2)+"M";
  if (Math.abs(x) >= 1e3) return (x/1e3).toFixed(2)+"K";
  return x.toFixed(2);
}
