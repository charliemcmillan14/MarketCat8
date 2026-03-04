export default async function handler(req,res){

  const symbol = req.query.symbol
  const key = process.env.FINNHUB_API_KEY

  const today = new Date()
  const lastWeek = new Date(Date.now() - 7*24*60*60*1000)

  const from = lastWeek.toISOString().split("T")[0]
  const to = today.toISOString().split("T")[0]

  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${key}`

  const r = await fetch(url)
  const data = await r.json()

  res.status(200).json(data)
}
