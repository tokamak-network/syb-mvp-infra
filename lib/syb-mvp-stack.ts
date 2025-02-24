import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as budgets from 'aws-cdk-lib/aws-budgets'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as dotenv from 'dotenv'
import { EcsConstruct } from './constructs/ecs-construct'
import { RdsConstruct } from './constructs/rds-construct'
import { RemovalPolicyAspect } from './aspects/removal-policy-aspect'

dotenv.config()

interface SybMvpStackProps extends cdk.StackProps {
  cidrBlock: string
  slackWebhookUrl: string
  route53DomainName: string
  monthlyBudgetLimit: number
  deploymentEnv: 'main' | 'test'
  sequencerDomain: string
  sequencerPort: number
  circuitDomain: string
  circuitPort: number
  sequencerInitialImageTag: string
  circuitInitialImageTag: string
}

export class SybMvpStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly slackNotifier: lambda.Function
  public readonly ecrRepo: ecr.IRepository
  public readonly route53: route53.IHostedZone

  constructor(scope: Construct, id: string, props: SybMvpStackProps) {
    super(scope, id, props)

    // TODO: public subnets are being assigned an EIP, investigate if necessary
    this.vpc = new ec2.Vpc(this, 'ProdVPC', {
      ipAddresses: ec2.IpAddresses.cidr(props.cidrBlock),
      maxAzs: 2,
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

    this.ecrRepo = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepo',
      `${props.deploymentEnv}-ecr-repo`
    )

    this.route53 = new route53.HostedZone(this, 'HostedZone', {
      zoneName: props.route53DomainName,
      vpcs: [this.vpc]
    })

    // TODO: investigate if necessary
    // new cdk.CfnOutput(this, 'NameServers', {
    //   value: cdk.Fn.join(', ', this.route53.hostedZoneNameServers || [])
    // })

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

    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: this.vpc
    })

    if (process.env.DEPLOY_SEQUENCER === 'true') {
      new EcsConstruct(this, 'SequencerEcsConstruct', {
        vpc: this.vpc,
        slackNotifier: this.slackNotifier,
        ecrRepo: this.ecrRepo,
        route53: this.route53,
        slackWebhookUrl: props.slackWebhookUrl,
        cidrBlock: props.cidrBlock,
        service: 'sequencer',
        deploymentEnv: props.deploymentEnv,
        serverPort: props.sequencerPort,
        domainName: props.sequencerDomain,
        cluster,
        initialImageTag: props.sequencerInitialImageTag,
        maxEc2ScalingCapacity: 1,
        maxTaskScalingCapacity: 1
      })

      new RdsConstruct(this, 'RdsConstruct', {
        vpc: this.vpc,
        cidrBlock: props.cidrBlock,
        deploymentEnv: props.deploymentEnv
      })
    }

    if (process.env.DEPLOY_CIRCUIT === 'true') {
      // TODO: circuit needs to be serverless as it runs only at certain times and is expensive to run
      // update EcsConstruct to support serverless
      new EcsConstruct(this, 'CircuitEcsConstruct', {
        vpc: this.vpc,
        slackNotifier: this.slackNotifier,
        ecrRepo: this.ecrRepo,
        route53: this.route53,
        slackWebhookUrl: props.slackWebhookUrl,
        cidrBlock: props.cidrBlock,
        service: 'circuit',
        deploymentEnv: props.deploymentEnv,
        serverPort: props.circuitPort,
        domainName: props.circuitDomain,
        cluster,
        initialImageTag: props.circuitInitialImageTag,
        maxEc2ScalingCapacity: 1,
        maxTaskScalingCapacity: 1
      })
    }

    cdk.Aspects.of(this).add(new RemovalPolicyAspect())
  }
}
