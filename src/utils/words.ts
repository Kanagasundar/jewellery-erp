const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below1000(n: number): string {
  const parts: string[] = []
  if (n >= 100) { parts.push(ones[Math.floor(n / 100)] + ' Hundred'); n %= 100 }
  if (n >= 20) { parts.push(tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')) } else if (n > 0) parts.push(ones[n])
  return parts.join(' ')
}

/** 123456.5 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Fifty Paise Only" (Indian numbering). */
export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount))
  const paise = Math.round((Math.abs(amount) - rupees) * 100)
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only'
  const parts: string[] = []
  let n = rupees
  const crore = Math.floor(n / 10000000); n %= 10000000
  const lakh = Math.floor(n / 100000); n %= 100000
  const thousand = Math.floor(n / 1000); n %= 1000
  if (crore) parts.push(below1000(crore) + ' Crore')
  if (lakh) parts.push(below1000(lakh) + ' Lakh')
  if (thousand) parts.push(below1000(thousand) + ' Thousand')
  if (n) parts.push(below1000(n))
  let out = parts.join(' ') + (rupees ? ' Rupees' : '')
  if (paise) out += (rupees ? ' and ' : '') + below1000(paise) + ' Paise'
  return out.trim() + ' Only'
}
