const https = require('https')
const url = require('url')

exports.handler = async (event) => {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
  const messageText = event.Records[0].Sns.Message

  const actualAmountMatch = messageText.match(
    /ACTUAL Amount:\s*\$([0-9]+(?:\.[0-9]+)?)/
  )
  const actualAmount = actualAmountMatch ? actualAmountMatch[1] : 'unknown'

  const budgetNameMatch = messageText.match(/Budget Name:\s*(\S+)/)
  const budgetName = budgetNameMatch ? budgetNameMatch[1] : 'unknown'

  let slackMessage = ''

  if (budgetName == 'DailyBudget') {
    slackMessage = `AWS Daily Cost: $${actualAmount}`
  } else if (budgetName == 'MonthlyBudget') {
    slackMessage = messageText
  }

  const body = JSON.stringify({ text: slackMessage })
  const parsedUrl = url.parse(slackWebhookUrl)
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        console.log(`Response: ${chunk}`)
      })
      res.on('end', () => {
        resolve()
      })
    })

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`)
      reject(e)
    })

    req.write(body)
    req.end()
  })
}
