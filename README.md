# SYB MVP Infra

## Setup
Configure AWS account, cli, node, and typescript by following the [link](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html)
```bash
npm install -g aws-cdk
```

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
