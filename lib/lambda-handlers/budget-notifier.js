const https = require('https')
const url = require('url')

exports.handler = async (event) => {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL
  const message = {
    text: `AWS Budget Alert: ${JSON.stringify(event)}`
  }

  const body = JSON.stringify(message)
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
