import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as autoscaling_group from 'aws-cdk-lib/aws-autoscaling';

interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  cidrBlock: string;
  serverPort: number;
  domainName: string;
  slackWebhookUrl: string;
  slackNotifier: lambda.Function;
  ecrRepo: ecr.Repository;
  route53: route53.IHostedZone;
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc: props.vpc,
    });

    const autoScalingGroup = new ecs.AsgCapacityProvider(this, 'AsgCapacityProvider', {
      autoScalingGroup: new autoscaling_group.AutoScalingGroup(this, 'DefaultAutoScalingGroup', {
        vpc: props.vpc,
        instanceType: new ec2.InstanceType('t2.micro'),
        machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
        minCapacity: 1,
        maxCapacity: 5,
      }),
    });

    cluster.addAsgCapacityProvider(autoScalingGroup);

    const taskDefinition = new ecs.Ec2TaskDefinition(this, 'TaskDef');

    const container = taskDefinition.addContainer('AppContainer', {
      image: ecs.ContainerImage.fromEcrRepository(props.ecrRepo),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs' }),
    });

    container.addPortMappings({
      containerPort: props.serverPort,
    });

    const service = new ecs_patterns.ApplicationLoadBalancedEc2Service(this, 'Ec2Service', {
      cluster,
      taskDefinition,
      publicLoadBalancer: true,
      desiredCount: 1,
      listenerPort: props.serverPort,
    });

    // TODO: consider volume usage and make it auto upgradeable (?)
    const scaling = service.service.autoScaleTaskCount({ maxCapacity: 5 });
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 90,
    });
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: props.route53,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(service.loadBalancer)),
    });

    const topic = new sns.Topic(this, 'AlarmTopic');
    topic.addSubscription(new sns_subscriptions.LambdaSubscription(props.slackNotifier));

    const cpuAlarm = new cloudwatch.Alarm(this, 'CpuAlarm', {
      metric: service.service.metricCpuUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
    });

    const memoryAlarm = new cloudwatch.Alarm(this, 'MemoryAlarm', {
      metric: service.service.metricMemoryUtilization(),
      threshold: 80,
      evaluationPeriods: 2,
    });

    cpuAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic));
    memoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(topic));

    props.vpc.addInterfaceEndpoint('SSM', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    props.vpc.addInterfaceEndpoint('SSMMessages', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });
    props.vpc.addInterfaceEndpoint('EC2Messages', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });

    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true,
    });
    ecsSecurityGroup.addIngressRule(ec2.Peer.ipv4(props.cidrBlock), ec2.Port.tcp(props.serverPort), 'Allow traffic to server port');
    service.service.connections.addSecurityGroup(ecsSecurityGroup);
  }
}