import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'
import { Env } from '../types'
import * as iam from 'aws-cdk-lib/aws-iam'

interface RdsConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cidrBlock: string
  deploymentEnv: Env
}

export class RdsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: RdsConstructProps) {
    super(scope, id)

    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: props.vpc,
      allowAllOutbound: true
    })

    rdsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.cidrBlock),
      ec2.Port.tcp(5432),
      'Allow ECS instances to access RDS'
    )

    const bastionSsmRole = new iam.Role(this, 'BastionSsmRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        )
      ]
    })

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [rdsSecurityGroup],
      deletionProtection: props.deploymentEnv === 'main' ? true : false,
      backupRetention:
        props.deploymentEnv === 'main'
          ? cdk.Duration.days(7)
          : cdk.Duration.days(0),
      credentials: rds.Credentials.fromGeneratedSecret('postgres', {
        secretName: `rds-credentials-${props.deploymentEnv}`
      })
    })

    // TODO: for some reason installs postgresql 10, investigate
    const bastionUserData = ec2.UserData.forLinux()
    bastionUserData.addCommands(
      'sudo amazon-linux-extras install postgresql16 -y',
      'sudo yum install -y socat',
      cdk.Fn.sub(
        'socat tcp-listen:5432,reuseaddr,fork tcp:${endpoint}:5432 &',
        { endpoint: database.dbInstanceEndpointAddress }
      )
    )

    const bastion = new ec2.Instance(this, 'BastionHost', {
      vpc: props.vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      role: bastionSsmRole,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      userData: bastionUserData
    })

    rdsSecurityGroup.addIngressRule(
      bastion.connections.securityGroups[0],
      ec2.Port.tcp(5432),
      'Allow bastion host to access RDS'
    )
  }
}
