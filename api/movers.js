const symbols = [
"AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA",
"JPM","BAC","XOM","CVX","WMT","COST","AVGO"
]

export default async function handler(req,res){

 const key = process.env.FINNHUB_API_KEY

 const results = await Promise.all(
   symbols.map(async s=>{
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${key}`)
      const q = await r.json()
      return {symbol:s,...q}
   })
 )

 results.sort((a,b)=>Math.abs(b.dp)-Math.abs(a.dp))

 res.status(200).json(results)
}
