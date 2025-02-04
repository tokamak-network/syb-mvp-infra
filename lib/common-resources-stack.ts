import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as budgets from 'aws-cdk-lib/aws-budgets'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'

interface CommonResourcesStackProps extends cdk.StackProps {
  cidrBlock: string
  slackWebhookUrl: string
  route53DomainName: string
  monthlyBudgetLimit: number
}

export class CommonResourcesStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly rdsSecurityGroup: ec2.SecurityGroup
  public readonly bastion: ec2.Instance
  public readonly slackNotifier: lambda.Function
  public readonly testEcrRepo: ecr.Repository
  public readonly mainEcrRepo: ecr.Repository
  public readonly route53: route53.IHostedZone

  constructor(scope: Construct, id: string, props: CommonResourcesStackProps) {
    super(scope, id, props)

    this.vpc = new ec2.Vpc(this, 'ProdVPC', {
      cidr: props.cidrBlock,
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
      keyName: 'bastion-key-name' // TODO: To be replaced with actual key name
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

    // TODO: Setup Codedeploy

    this.slackNotifier = new lambda.Function(this, 'SlackNotifier', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        __dirname + '/lambda-handlers/slack-notifier.js'
      ),
      environment: {
        SLACK_WEBHOOK_URL: props.slackWebhookUrl
      }
    })

    this.mainEcrRepo = new ecr.Repository(this, 'MainEcrRepo', {
      repositoryName: 'main-ecr-repo'
    })

    this.testEcrRepo = new ecr.Repository(this, 'TestEcrRepo', {
      repositoryName: 'test-ecr-repo'
    })

    this.route53 = new route53.HostedZone(this, 'HostedZone', {
      zoneName: props.route53DomainName
    })

    const budgetNotificationTopic = new sns.Topic(
      this,
      'BudgetNotificationTopic'
    )

    const budgetNotifier = new lambda.Function(this, 'BudgetNotifier', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        __dirname + '/lambda-handlers/budget-notifier.js'
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
  }
}
