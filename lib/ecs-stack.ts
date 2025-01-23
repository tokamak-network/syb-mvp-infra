import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as targets from 'aws-cdk-lib/aws-route53-targets'
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling'
import * as iam from 'aws-cdk-lib/aws-iam'

interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cidrBlock: string
  serverPort: number
  domainName: string
  slackWebhookUrl: string
  slackNotifier: lambda.Function
  ecrRepo: ecr.Repository
  route53: route53.IHostedZone
  service: Service
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props)

    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: props.vpc
    })

    const autoScalingGroup = new ecs.AsgCapacityProvider(
      this,
      'AsgCapacityProvider',
      {
        autoScalingGroup: new autoscaling.AutoScalingGroup(
          this,
          'DefaultAutoScalingGroup',
          {
            vpc: props.vpc,
            instanceType: new ec2.InstanceType('t2.micro'),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 1,

            // An EBS volume can only be used by a single instance at a time
            // This is why we set maxCapacity to 1 for the sequencer service
            // Need to figure out a better way to handle this
            maxCapacity: props.service === 'sequencer' ? 1 : 5
          }
        )
      }
    )

    cluster.addAsgCapacityProvider(autoScalingGroup)

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef')

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.ecrRepo),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs' })
    })

    container.addPortMappings({
      containerPort: props.serverPort
    })

    const service = new ecs_patterns.ApplicationLoadBalancedEc2Service(
      this,
      'Ec2Service',
      {
        cluster,
        taskDefinition,
        publicLoadBalancer: true,
        desiredCount: 1,
        listenerPort: props.serverPort
      }
    )

    const scaling = service.service.autoScaleTaskCount({ maxCapacity: 5 })
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 90
    })
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80
    })

    new route53.ARecord(this, 'AliasRecord', {
      zone: props.route53,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(service.loadBalancer)
      )
    })

    const topic = new sns.Topic(this, 'AlarmTopic')
    topic.addSubscription(
      new sns_subscriptions.LambdaSubscription(props.slackNotifier)
    )

    const cpuAlarm = new cloudwatch.Alarm(this, 'CpuAlarm', {
      metric: service.service.metricCpuUtilization(),
      threshold: 90,
      evaluationPeriods: 2
    })

    const memoryAlarm = new cloudwatch.Alarm(this, 'MemoryAlarm', {
      metric: service.service.metricMemoryUtilization(),
      threshold: 80,
      evaluationPeriods: 2
    })

    cpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic))
    memoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic))

    props.vpc.addInterfaceEndpoint('SSM', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM
    })
    props.vpc.addInterfaceEndpoint('SSMMessages', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES
    })
    props.vpc.addInterfaceEndpoint('EC2Messages', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES
    })

    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true
    })
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.cidrBlock),
      ec2.Port.tcp(props.serverPort),
      'Allow traffic to server port'
    )
    service.service.connections.addSecurityGroup(ecsSecurityGroup)

    // sequencer uses key-value database which will be persisted on a volume
    // all sequencer instances will have the same volume attached and this volume should NOT be deleted on termination
    if (props.service === 'sequencer') {
      const volume = new ec2.CfnVolume(this, 'SequencerPersistentVolume', {
        availabilityZone: props.vpc.availabilityZones[0],
        size: 20, // Size in GB
        volumeType: 'gp2'
      })

      autoScalingGroup.autoScalingGroup.addUserData(
        `aws ec2 attach-volume --volume-id ${volume.ref} --instance-id $(curl -s http://169.254.169.254/latest/meta-data/instance-id) --device /dev/sdf`
      )

      const volumeAlarm = new cloudwatch.Alarm(this, 'VolumeUsageAlarm', {
        metric: new cloudwatch.Metric({
          namespace: 'AWS/EBS',
          metricName: 'VolumeConsumedReadWriteOps',
          dimensionsMap: {
            VolumeId: volume.ref
          }
        }),
        threshold: 90,
        evaluationPeriods: 2,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
      })

      const lambdaRole = new iam.Role(this, 'LambdaRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole'
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2FullAccess')
        ]
      })

      const volumeExpansionFunction = new lambda.Function(
        this,
        'VolumeExpansionFunction',
        {
          runtime: lambda.Runtime.NODEJS_LATEST,
          handler: 'index.handler',
          code: lambda.Code.fromAsset(
            __dirname + '/lambda-handlers/scale-sequencer-volume.js'
          ),
          role: lambdaRole
        }
      )

      volumeAlarm.addAlarmAction(
        new cloudwatch_actions.LambdaAction(volumeExpansionFunction)
      )
    }
  }
}
