const https = require('https')
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL

exports.handler = async (event) => {
  const message = JSON.stringify(event.Records[0].Sns.Message)
  const options = {
    hostname: 'hooks.slack.com',
    path: slackWebhookUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }
  const req = https.request(options, (res) => {
    res.on('data', (d) => process.stdout.write(d))
  })
  req.on('error', (e) => console.error(e))
  req.write(message)
  req.end()
}
