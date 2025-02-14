import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds'

interface RdsConstructProps extends cdk.StackProps {
  vpc: ec2.Vpc
  cidrBlock: string
  rdsSecurityGroup: ec2.SecurityGroup
}

export class RdsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: RdsConstructProps) {
    super(scope, id)

    new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      securityGroups: [props.rdsSecurityGroup],
      deletionProtection: true
    })
  }
}
