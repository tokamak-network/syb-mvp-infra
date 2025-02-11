#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { CommonResourcesStack } from '../lib/common-resources-stack'
import { RdsStack } from '../lib/rds-stack'
import { EcsStack } from '../lib/ecs-stack'
import * as dotenv from 'dotenv'

dotenv.config()

const CIDR_BLOCK = process.env.CIDR_BLOCK
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

if (!SLACK_WEBHOOK_URL || !CIDR_BLOCK) {
  throw new Error('some env values not provided')
}
const ROUTE53_DOMAIN_NAME = process.env.ROUTE53_DOMAIN_NAME
if (!ROUTE53_DOMAIN_NAME) {
  throw new Error('ROUTE53_DOMAIN_NAME not provided')
}
const SEQUENCER_MAIN_DOMAIN = process.env.SEQUENCER_MAIN_DOMAIN
const SEQUENCER_MAIN_PORT = process.env.SEQUENCER_MAIN_PORT
if (!SEQUENCER_MAIN_DOMAIN || !SEQUENCER_MAIN_PORT) {
  throw new Error('SEQUENCER_MAIN_DOMAIN or SEQUENCER_MAIN_PORT not provided')
}
const SEQUENCER_TEST_DOMAIN = process.env.SEQUENCER_TEST_DOMAIN
const SEQUENCER_TEST_PORT = process.env.SEQUENCER_TEST_PORT
if (!SEQUENCER_TEST_DOMAIN || !SEQUENCER_TEST_PORT) {
  throw new Error('SEQUENCER_TEST_DOMAIN or SEQUENCER_TEST_PORT not provided')
}
const CIRCUIT_TEST_DOMAIN = process.env.CIRCUIT_TEST_DOMAIN
const CIRCUIT_TEST_PORT = process.env.CIRCUIT_TEST_PORT
if (!CIRCUIT_TEST_DOMAIN || !CIRCUIT_TEST_PORT) {
  throw new Error('CIRCUIT_TEST_DOMAIN or CIRCUIT_TEST_PORT not provided')
}
const CIRCUIT_MAIN_DOMAIN = process.env.CIRCUIT_MAIN_DOMAIN
const CIRCUIT_MAIN_PORT = process.env.CIRCUIT_MAIN_PORT
if (!CIRCUIT_MAIN_DOMAIN || !CIRCUIT_MAIN_PORT) {
  throw new Error('CIRCUIT_MAIN_DOMAIN or CIRCUIT_MAIN_PORT not provided')
}

const app = new cdk.App()

const commonResourcesStack = new CommonResourcesStack(
  app,
  'CommonResourcesStack',
  {
    cidrBlock: CIDR_BLOCK,
    slackWebhookUrl: SLACK_WEBHOOK_URL,
    route53DomainName: ROUTE53_DOMAIN_NAME,
    monthlyBudgetLimit: 300
  }
)

new RdsStack(app, 'SequencerMainRdsStack', {
  vpc: commonResourcesStack.vpc,
  cidrBlock: CIDR_BLOCK,
  rdsSecurityGroup: commonResourcesStack.rdsSecurityGroup
})

new EcsStack(app, 'SequencerMainEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(SEQUENCER_MAIN_PORT),
  domainName: SEQUENCER_MAIN_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.mainEcrRepo,
  route53: commonResourcesStack.route53,
  service: 'sequencer',
  deploymentEnv: 'main'
})

new RdsStack(app, 'SequencerTestRdsStack', {
  vpc: commonResourcesStack.vpc,
  cidrBlock: CIDR_BLOCK,
  rdsSecurityGroup: commonResourcesStack.rdsSecurityGroup
})

new EcsStack(app, 'SequencerTestEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(SEQUENCER_TEST_PORT),
  domainName: SEQUENCER_TEST_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.testEcrRepo,
  route53: commonResourcesStack.route53,
  service: 'sequencer',
  deploymentEnv: 'test'
})

new EcsStack(app, 'CircuitMainEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(CIRCUIT_MAIN_PORT),
  domainName: CIRCUIT_MAIN_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.mainEcrRepo,
  route53: commonResourcesStack.route53,
  service: 'circuit',
  deploymentEnv: 'main'
})

new EcsStack(app, 'CircuitTestEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(CIRCUIT_TEST_PORT),
  domainName: CIRCUIT_TEST_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.testEcrRepo,
  route53: commonResourcesStack.route53,
  service: 'circuit',
  deploymentEnv: 'test'
})
