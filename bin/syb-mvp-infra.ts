#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { CommonResourcesStack } from '../lib/common-resources-stack'
import { RdsStack } from '../lib/rds-stack'
import { EcsStack } from '../lib/ecs-stack'

const CIDR_BLOCK = process.env.CIDR_BLOCK
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

const ROUTE53_DOMAIN_NAME = process.env.ROUTE53_DOMAIN_NAME

const CLIENT_MAIN_DOMAIN=process.env.CLIENT_MAIN_DOMAIN
const CLIENT_TEST_DOMAIN=process.env.CLIENT_TEST_DOMAIN
const CLIENT_MAIN_PORT=process.env.CLIENT_MAIN_PORT
const CLIENT_TEST_PORT=process.env.CLIENT_TEST_PORT

const SEQUENCER_MAIN_DOMAIN=process.env.SEQUENCER_MAIN_DOMAIN
const SEQUENCER_TEST_DOMAIN=process.env.SEQUENCER_TEST_DOMAIN
const SEQUENCER_MAIN_PORT=process.env.SEQUENCER_MAIN_PORT
const SEQUENCER_TEST_PORT=process.env.SEQUENCER_TEST_PORT

const CIRCUIT_MAIN_DOMAIN=process.env.CIRCUIT_MAIN_DOMAIN
const CIRCUIT_TEST_DOMAIN=process.env.CIRCUIT_TEST_DOMAIN
const CIRCUIT_MAIN_PORT=process.env.CIRCUIT_MAIN_PORT
const CIRCUIT_TEST_PORT=process.env.CIRCUIT_TEST_PORT

if (!SLACK_WEBHOOK_URL || !CIDR_BLOCK || !ROUTE53_DOMAIN_NAME ||
  !CLIENT_MAIN_DOMAIN || !CLIENT_TEST_DOMAIN || !CLIENT_MAIN_PORT || !CLIENT_TEST_PORT ||
  !SEQUENCER_MAIN_DOMAIN || !SEQUENCER_TEST_DOMAIN || !SEQUENCER_MAIN_PORT || !SEQUENCER_TEST_PORT ||
  !CIRCUIT_MAIN_DOMAIN || !CIRCUIT_TEST_DOMAIN || !CIRCUIT_MAIN_PORT || !CIRCUIT_TEST_PORT
) {
  throw new Error('some env values not provided')
}

const app = new cdk.App()

const commonResourcesStack = new CommonResourcesStack(
  app,
  'CommonResourcesStack',
  {
    cidrBlock: CIDR_BLOCK,
    slackWebhookUrl: SLACK_WEBHOOK_URL,
    route53DomainName: ROUTE53_DOMAIN_NAME
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

new EcsStack(app, 'ClientMainEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(CLIENT_MAIN_PORT),
  domainName: CLIENT_MAIN_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.mainEcrRepo,
  route53: commonResourcesStack.route53
})

new EcsStack(app, 'ClientTestEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(CLIENT_TEST_PORT),
  domainName: CLIENT_TEST_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.testEcrRepo,
  route53: commonResourcesStack.route53
})

new EcsStack(app, 'SequencerMainEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(SEQUENCER_MAIN_PORT),
  domainName: SEQUENCER_MAIN_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.mainEcrRepo,
  route53: commonResourcesStack.route53
})

new EcsStack(app, 'SequencerTestEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(SEQUENCER_TEST_PORT),
  domainName: SEQUENCER_TEST_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.testEcrRepo,
  route53: commonResourcesStack.route53
})

new EcsStack(app, 'CircuitMainEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(CIRCUIT_MAIN_PORT),
  domainName: CIRCUIT_MAIN_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.mainEcrRepo,
  route53: commonResourcesStack.route53
})

new EcsStack(app, 'CircuitTestEcsStack', {
  cidrBlock: CIDR_BLOCK,
  serverPort: parseInt(CIRCUIT_TEST_PORT),
  domainName: CIRCUIT_TEST_DOMAIN,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  vpc: commonResourcesStack.vpc,
  slackNotifier: commonResourcesStack.slackNotifier,
  ecrRepo: commonResourcesStack.testEcrRepo,
  route53: commonResourcesStack.route53
})