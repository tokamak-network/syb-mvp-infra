# SYB MVP Infra

## Setup

Configure AWS account, cli, node, and typescript by following the [link](https://docs.aws.amazon.com/cdk/v2/guide/prerequisites.html)

```bash
npm install -g aws-cdk
cp .env.example .env
```

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## DB connection

RDS is hosted in a private subnet and the only way to access it is through the Bastion host, which is also limited to only SSM connection. To establish an SSM connection to the Bastion host, ensure you have the plugin installed:

```bash
brew install session-manager-plugin
```

Start a port forwarding session from your local machine to the RDS instance through the bastion host:

```bash
aws ssm start-session --target <bastion-instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["5432"],"localPortNumber":["5432"]}'
```

Configure your DBMS tool to connect to `localhost:5432` to access the RDS.

## Deploy Stacks

- Bootstrap CDK to prepare the repo for stack creation (only one time per account & region):

```bash
cdk bootstrap
```

- `cdk list` will give the list of stacks defined in the app
- `cdk synth <StackName>` will synthesize specified stack from CDK to Cloudformation template files.
- `cdk deploy <StackName>` deploys the specified stack
- `cdk diff <StackName>` compare deployed stack with current state
- `cdk destroy <StackName>` delete specified stack

## Manually push local image to ECR

```bash
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<region>.amazonaws.com
docker tag my-image:latest <aws_account_id>.dkr.ecr.<region>.amazonaws.com/my-repo:latest
docker push <aws_account_id>.dkr.ecr.<region>.amazonaws.com/my-repo:latest
```
