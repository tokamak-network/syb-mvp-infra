# SYB MVP Infra

## Setup

Configure AWS account, cli, node, and typescript by following the [link](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html)

```bash
npm install -g aws-cdk
cp .env.example .env
```

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## DB connection

Start an SSH tunnel from your local machine to the RDS instance through the bastion host:

```bash
ssh -i /path/to/your-key-pair.pem -L 5432:<rds-endpoint>:5432 ec2-user@<bastion-host-public-ip>
```

Configure your DBMS tool to connect to `localhost:5432` to access the RDS.

## Create Stacks

- Bootstrap CDK to prepare the repo for stack creation (only one time per account & region):

```bash
cdk bootstrap
```

## Useful commands

- `yarn build` compile typescript to js
- `yarn watch` watch for changes and compile
- `yarn test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template
