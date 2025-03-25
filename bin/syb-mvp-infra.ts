#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import * as dotenv from 'dotenv'
import { SybMvpStack } from '../lib/syb-mvp-stack'

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

const SEQUENCER_MAIN_INITIAL_IMAGE_TAG =
  process.env.SEQUENCER_MAIN_INITIAL_IMAGE_TAG
const SEQUENCER_TEST_INITIAL_IMAGE_TAG =
  process.env.SEQUENCER_TEST_INITIAL_IMAGE_TAG
const CIRCUIT_MAIN_INITIAL_IMAGE_TAG =
  process.env.CIRCUIT_MAIN_INITIAL_IMAGE_TAG
const CIRCUIT_TEST_INITIAL_IMAGE_TAG =
  process.env.CIRCUIT_TEST_INITIAL_IMAGE_TAG
if (
  !SEQUENCER_MAIN_INITIAL_IMAGE_TAG ||
  !SEQUENCER_TEST_INITIAL_IMAGE_TAG ||
  !CIRCUIT_MAIN_INITIAL_IMAGE_TAG ||
  !CIRCUIT_TEST_INITIAL_IMAGE_TAG
) {
  throw new Error('some initial image tags not provided')
}

const app = new cdk.App()

new SybMvpStack(app, 'SybMvpMainStack', {
  cidrBlock: CIDR_BLOCK,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  route53DomainName: ROUTE53_DOMAIN_NAME,
  monthlyBudgetLimit: 300,
  deploymentEnv: 'main',
  sequencerDomain: SEQUENCER_MAIN_DOMAIN,
  sequencerPort: parseInt(SEQUENCER_MAIN_PORT),
  circuitDomain: CIRCUIT_MAIN_DOMAIN,
  circuitPort: parseInt(CIRCUIT_MAIN_PORT),
  sequencerInitialImageTag: SEQUENCER_MAIN_INITIAL_IMAGE_TAG,
  circuitInitialImageTag: CIRCUIT_MAIN_INITIAL_IMAGE_TAG
})

new SybMvpStack(app, 'SybMvpTestStack', {
  cidrBlock: CIDR_BLOCK,
  slackWebhookUrl: SLACK_WEBHOOK_URL,
  route53DomainName: ROUTE53_DOMAIN_NAME,
  monthlyBudgetLimit: 300,
  deploymentEnv: 'test',
  sequencerDomain: SEQUENCER_TEST_DOMAIN,
  sequencerPort: parseInt(SEQUENCER_TEST_PORT),
  circuitDomain: CIRCUIT_TEST_DOMAIN,
  circuitPort: parseInt(CIRCUIT_TEST_PORT),
  sequencerInitialImageTag: SEQUENCER_TEST_INITIAL_IMAGE_TAG,
  circuitInitialImageTag: CIRCUIT_TEST_INITIAL_IMAGE_TAG
})
