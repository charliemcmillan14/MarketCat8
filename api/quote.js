export default async function handler(req, res){
  try{
    const symbol = String(req.query.symbol || "").toUpperCase();
    if(!symbol) return res.status(400).json({ error:"missing symbol" });

    const key = process.env.FINNHUB_API_KEY;
    if(!key) return res.status(500).json({ error:"missing FINNHUB_API_KEY" });

    // Finnhub quote endpoint:
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
    const r = await fetch(url);
    if(!r.ok) return res.status(r.status).json({ error:"finnhub error" });
    const data = await r.json();

    // data: { c,h,l,o,pc,t,d,dp }
    return res.status(200).json(data);
  }catch(e){
    return res.status(500).json({ error:e.message });
  }
}
