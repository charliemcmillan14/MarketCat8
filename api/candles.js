export default async function handler(req, res){
  try{
    const symbol = req.query.symbol;
    const resolution = req.query.resolution || "15";

    const key = process.env.FINNHUB_API_KEY;

    const now = Math.floor(Date.now()/1000);
    const from = now - 60*60*24*30;

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${key}`;

    const r = await fetch(url);
    const data = await r.json();

    res.status(200).json(data);

  }catch(e){
    res.status(500).json({error:e.message});
  }
}
