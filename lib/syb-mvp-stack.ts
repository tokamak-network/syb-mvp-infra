import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as budgets from 'aws-cdk-lib/aws-budgets'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import { EcsConstruct } from './constructs/ecs-construct'
import { RdsConstruct } from './constructs/rds-construct'

interface SybMvpStackProps extends cdk.StackProps {
  cidrBlock: string
  slackWebhookUrl: string
  route53DomainName: string
  monthlyBudgetLimit: number
  deploymentEnv: 'main' | 'test'
}

export class SybMvpStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly rdsSecurityGroup: ec2.SecurityGroup
  public readonly bastion: ec2.Instance
  public readonly slackNotifier: lambda.Function
  public readonly ecrRepo: ecr.Repository
  public readonly route53: route53.IHostedZone

  constructor(scope: Construct, id: string, props: SybMvpStackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'ProdVPC', {
      ipAddresses: ec2.IpAddresses.cidr(props.cidrBlock),
      maxAzs: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }
      ]
    })

    this.rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: this.vpc,
      allowAllOutbound: true
    })

    this.rdsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.cidrBlock),
      ec2.Port.tcp(5432),
      'Allow ECS instances to access RDS'
    )

    this.bastion = new ec2.Instance(this, 'BastionHost', {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      keyPair: ec2.KeyPair.fromKeyPairAttributes(this, 'KeyPair', {
        keyPairName: 'bastion-key-name'
      }) // TODO: To be replaced with actual key name
    })

    this.bastion.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access from the internet'
    )

    this.rdsSecurityGroup.addIngressRule(
      this.bastion.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      'Allow bastion host to access RDS'
    )

    this.slackNotifier = new lambda.Function(this, 'SlackNotifier', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        __dirname + '/lambda-handlers/slack-notifier'
      ),
      environment: {
        SLACK_WEBHOOK_URL: props.slackWebhookUrl
      }
    })

    this.ecrRepo = new ecr.Repository(this, 'EcrRepo', {
      repositoryName: 'main-ecr-repo'
    })

    this.route53 = new route53.HostedZone(this, 'HostedZone', {
      zoneName: props.route53DomainName,
      vpcs: [this.vpc]
    })
    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(', ', this.route53.hostedZoneNameServers || [])
    })

    const budgetNotificationTopic = new sns.Topic(
      this,
      'BudgetNotificationTopic'
    )

    const budgetNotifier = new lambda.Function(this, 'BudgetNotifier', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        __dirname + '/lambda-handlers/budget-notifier'
      ),
      environment: {
        SLACK_WEBHOOK_URL: props.slackWebhookUrl
      }
    })

    budgetNotificationTopic.addSubscription(
      new sns_subscriptions.LambdaSubscription(budgetNotifier)
    )

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'MonthlyBudget',
        budgetLimit: {
          amount: props.monthlyBudgetLimit,
          unit: 'USD'
        },
        budgetType: 'COST',
        timeUnit: 'MONTHLY'
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'FORECASTED',
            threshold: 100,
            comparisonOperator: 'GREATER_THAN'
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: budgetNotificationTopic.topicArn
            }
          ]
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            threshold: 90,
            comparisonOperator: 'GREATER_THAN'
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: budgetNotificationTopic.topicArn
            }
          ]
        }
      ]
    })

    // sequencer ECS resources
    new EcsConstruct(this, 'EcsConstruct', {
      vpc: this.vpc,
      slackNotifier: this.slackNotifier,
      ecrRepo: this.ecrRepo,
      route53: this.route53,
      slackWebhookUrl: props.slackWebhookUrl,
      cidrBlock: props.cidrBlock,
      service: 'sequencer',
      deploymentEnv: props.deploymentEnv,
      serverPort: 5000, // TODO: hardcoded
      domainName: 'sequencer' // TODO: hardcoded
    })

    // sequencer RDS resources
    new RdsConstruct(this, 'RdsConstruct', {
      vpc: this.vpc,
      cidrBlock: props.cidrBlock,
      rdsSecurityGroup: this.rdsSecurityGroup
    })

    // circuit ECS resources
    new EcsConstruct(this, 'CircuitEcsConstruct', {
      vpc: this.vpc,
      slackNotifier: this.slackNotifier,
      ecrRepo: this.ecrRepo,
      route53: this.route53,
      slackWebhookUrl: props.slackWebhookUrl,
      cidrBlock: props.cidrBlock,
      service: 'circuit',
      deploymentEnv: props.deploymentEnv,
      serverPort: 5000, // TODO: hardcoded
      domainName: 'circuit' // TODO: hardcoded
    })
  }
}
