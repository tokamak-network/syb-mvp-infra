#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { CommonResourcesStack } from '../lib/common-resources-stack'
import { RdsStack } from '../lib/rds-stack'

const CIDR_BLOCK = '192.168.0.0/16'

const app = new cdk.App()

const commonResourcesStack = new CommonResourcesStack(
  app,
  'CommonResourcesStack',
  {
    cidrBlock: CIDR_BLOCK
  }
)

new RdsStack(app, 'ClientMainRdsStack', {
  vpc: commonResourcesStack.vpc,
  cidrBlock: CIDR_BLOCK,
  rdsSecurityGroup: commonResourcesStack.rdsSecurityGroup
})

new RdsStack(app, 'ClientTestRdsStack', {
  vpc: commonResourcesStack.vpc,
  cidrBlock: CIDR_BLOCK,
  rdsSecurityGroup: commonResourcesStack.rdsSecurityGroup
})

new RdsStack(app, 'SequencerMainRdsStack', {
  vpc: commonResourcesStack.vpc,
  cidrBlock: CIDR_BLOCK,
  rdsSecurityGroup: commonResourcesStack.rdsSecurityGroup
})

new RdsStack(app, 'SequencerTestRdsStack', {
  vpc: commonResourcesStack.vpc,
  cidrBlock: CIDR_BLOCK,
  rdsSecurityGroup: commonResourcesStack.rdsSecurityGroup
})
