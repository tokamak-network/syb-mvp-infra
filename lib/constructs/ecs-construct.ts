import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecs from 'aws-cdk-lib/aws-ecs'
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
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import { Env, Service } from '../types'

interface EcsConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cidrBlock: string
  serverPort: number
  domainName: string
  // slackWebhookUrl: string
  // slackNotifier: lambda.Function
  ecrRepo: ecr.IRepository
  route53: route53.IHostedZone
  service: Service
  deploymentEnv: Env
  cluster: ecs.Cluster
  initialImageTag: string
  maxEc2ScalingCapacity: number
  maxTaskScalingCapacity: number
}

export class EcsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id)

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc: props.vpc,
      internetFacing: true
    })

    const listener = loadBalancer.addListener('Listener', {
      port: props.serverPort,
      protocol: elbv2.ApplicationProtocol.HTTP
    })

    const ecsInstanceRole = new iam.Role(this, 'EcsInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })
    ecsInstanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    )

    const autoScalingGroup = new ecs.AsgCapacityProvider(
      this,
      'AsgCapacityProvider',
      {
        autoScalingGroup: new autoscaling.AutoScalingGroup(
          this,
          'DefaultAutoScalingGroup',
          {
            vpc: props.vpc,
            instanceType: new ec2.InstanceType('t3.medium'),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 1,
            role: ecsInstanceRole,

            // An EBS volume can only be used by a single instance at a time
            // This is why we set maxCapacity to 1 for the sequencer service
            // Need to figure out a better way to handle this
            maxCapacity: props.maxEc2ScalingCapacity
          }
        )
      }
    )
    const instanceSG =
      autoScalingGroup.autoScalingGroup.connections.securityGroups[0]

    instanceSG.addIngressRule(
      ec2.Peer.ipv4(props.cidrBlock),
      ec2.Port.tcp(props.serverPort),
      'Allow traffic on server port'
    )

    instanceSG.connections.allowFrom(
      loadBalancer,
      ec2.Port.tcpRange(32768, 65535),
      'Allow traffic from ALB to container instances'
    )

    props.cluster.addAsgCapacityProvider(autoScalingGroup)

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef')
    taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite')
    )

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(
        props.ecrRepo,
        props.initialImageTag
      ),
      memoryReservationMiB: 2048,
      cpu: 1024,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs' }),
      healthCheck: {
        command: [
          'CMD-SHELL',
          `curl -f http://localhost:${props.serverPort}/v1/health || exit 1`
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 5
      }
    })

    container.addPortMappings({
      containerPort: props.serverPort,
      hostPort: 0
    })

    const service = new ecs.Ec2Service(this, 'Ec2Service', {
      cluster: props.cluster,
      taskDefinition
    })

    const targetGroup = listener.addTargets('TargetGroup', {
      port: props.serverPort,
      targets: [service],
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/v1/health',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(3),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5
      }
    })

    const scaling = service.autoScaleTaskCount({
      maxCapacity: props.maxTaskScalingCapacity
    })
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
        new targets.LoadBalancerTarget(loadBalancer)
      )
    })

    // const topic = new sns.Topic(
    //   this,
    //   `AlarmTopic-${props.service}-${props.deploymentEnv}`
    // )
    // topic.addSubscription(
    //   new sns_subscriptions.LambdaSubscription(props.slackNotifier)
    // )

    // const cpuAlarm = new cloudwatch.Alarm(this, 'CpuAlarm', {
    //   metric: service.metricCpuUtilization(),
    //   threshold: 90,
    //   evaluationPeriods: 2
    // })

    // const memoryAlarm = new cloudwatch.Alarm(this, 'MemoryAlarm', {
    //   metric: service.metricMemoryUtilization(),
    //   threshold: 80,
    //   evaluationPeriods: 2
    // })

    // cpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic))
    // memoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic))

    // TODO: for some reason EC2 instances don't have inbound SG rules attached
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
      description: 'Security group for ECS service'
    })

    ecsSecurityGroup.connections.allowFrom(
      loadBalancer,
      ec2.Port.tcpRange(32768, 65535),
      'Allow traffic from ALB to ECS tasks'
    )

    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.cidrBlock),
      ec2.Port.tcp(props.serverPort),
      'Allow traffic from CIDR block'
    )

    autoScalingGroup.autoScalingGroup.addSecurityGroup(ecsSecurityGroup)
    service.connections.addSecurityGroup(ecsSecurityGroup)

    if (props.service === 'sequencer') {
      const volume = new ec2.CfnVolume(this, 'SequencerPersistentVolume', {
        availabilityZone: props.vpc.availabilityZones[0],
        size: 20,
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
            __dirname + './../lambda-handlers/scale-sequencer-volume'
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
