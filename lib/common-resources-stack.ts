import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'

interface CommonResourcesStackProps extends cdk.StackProps {
  cidrBlock: string
}

export class CommonResourcesStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc
  public readonly rdsSecurityGroup: ec2.SecurityGroup
  public readonly bastion: ec2.Instance

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
  }
}
