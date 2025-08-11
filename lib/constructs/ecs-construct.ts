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
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
// Import the EFS library
import * as efs from 'aws-cdk-lib/aws-efs'
import { Env, Service } from '../types'

interface EcsConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cidrBlock: string
  serverPort: number
  domainName: string
  slackWebhookUrl: string
  slackNotifier: lambda.Function
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
    // Add policy to allow EC2 instances to connect to EFS
    ecsInstanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonElasticFileSystemClientFullAccess'
      )
    )

    // Create a UserData script to install the EFS utilities
    const userData = ec2.UserData.forLinux()
    userData.addCommands('yum install -y amazon-efs-utils')

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
            // With EFS, we are no longer constrained to a single instance
            maxCapacity: props.maxEc2ScalingCapacity,
            // Add the UserData script to the ASG
            userData: userData,
            // Add an update policy for smooth deployments
            updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({
              minInstancesInService: 1,
              maxBatchSize: 1,
              waitOnResourceSignals: true,
              pauseTime: cdk.Duration.minutes(10)
            })
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

    // =================================================================
    // SECTION for EFS file system and Task Definition
    // =================================================================
    let efsVolumeConfig: ecs.Volume | undefined
    let fileSystem: efs.FileSystem | undefined
    let accessPoint: efs.AccessPoint | undefined

    if (props.service === 'sequencer') {
      // 1. Create a persistent, elastic file system (EFS)
      fileSystem = new efs.FileSystem(this, 'StateDBFileSystem', {
        vpc: props.vpc,
        performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
        encrypted: true,
        lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })

      // 2. Create an EFS Access Point for better permission management
      accessPoint = fileSystem.addAccessPoint('AccessPoint', {
        path: '/data', // A dedicated directory within the EFS
        createAcl: {
          ownerGid: '1000',
          ownerUid: '1000',
          permissions: '0777' // security: open to everyone
        },
        posixUser: {
          gid: '1000',
          uid: '1000'
        }
      })

      // 3. Configure a security group for the EFS mount targets
      fileSystem.connections.allowDefaultPortFrom(instanceSG)

      // 4. Define the volume configuration for the task definition
      efsVolumeConfig = {
        name: 'stateDB-volume',
        efsVolumeConfiguration: {
          fileSystemId: fileSystem.fileSystemId,
          transitEncryption: 'ENABLED',
          // Use the access point to mount the volume
          authorizationConfig: {
            accessPointId: accessPoint.accessPointId,
            iam: 'ENABLED'
          }
        }
      }
    }

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef', {
      // Add the EFS volume to the task definition if it exists
      volumes: efsVolumeConfig ? [efsVolumeConfig] : []
    })

    // Add permissions for the task to connect to the EFS via the access point
    if (props.service === 'sequencer' && fileSystem && accessPoint) {
      // CORRECTED IAM POLICY
      taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            'elasticfilesystem:ClientMount',
            'elasticfilesystem:ClientWrite',
            'elasticfilesystem:DescribeMountTargets'
          ],
          resources: [fileSystem.fileSystemArn],
          // Condition to only allow access through the defined access point
          conditions: {
            StringEquals: {
              'elasticfilesystem:AccessPointArn': accessPoint.accessPointArn
            }
          }
        })
      )
    }

    taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite')
    )

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(
        props.ecrRepo,
        props.initialImageTag
      ),
      memoryReservationMiB: 1536,
      cpu: 1024,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs' }),
      healthCheck: {
        command: [
          'CMD-SHELL',
          `curl -f http://localhost:${props.serverPort}/api/v1/health || exit 1`
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 5
      },
      command: [
        '/bin/sh',
        '-c',
        'find /app/var -type f -name LOCK -exec rm -f {} + && chown -R 1000:1000 /app/var && exec go run main.go'
      ]
    })

    container.addPortMappings({
      containerPort: props.serverPort,
      hostPort: 0
    })

    // If the EFS volume was defined, mount it to the container
    if (efsVolumeConfig) {
      container.addMountPoints({
        sourceVolume: efsVolumeConfig.name,
        containerPath: '/app/var', // The path inside your container
        readOnly: false
      })
    }

    const service = new ecs.Ec2Service(this, 'Ec2Service', {
      cluster: props.cluster,
      taskDefinition
    })

    const targetGroup = listener.addTargets('TargetGroup', {
      port: props.serverPort,
      targets: [service],
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/api/v1/health',
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

    const topic = new sns.Topic(
      this,
      `AlarmTopic-${props.service}-${props.deploymentEnv}`
    )
    topic.addSubscription(
      new sns_subscriptions.LambdaSubscription(props.slackNotifier)
    )

    const cpuAlarm = new cloudwatch.Alarm(this, 'CpuAlarm', {
      metric: service.metricCpuUtilization(),
      threshold: 90,
      evaluationPeriods: 2
    })

    const memoryAlarm = new cloudwatch.Alarm(this, 'MemoryAlarm', {
      metric: service.metricMemoryUtilization(),
      threshold: 80,
      evaluationPeriods: 2
    })

    cpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic))
    memoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic))

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
  }
}
