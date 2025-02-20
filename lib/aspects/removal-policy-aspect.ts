import * as cdk from 'aws-cdk-lib'
import { IConstruct } from 'constructs'

export class RemovalPolicyAspect implements cdk.IAspect {
  public applyPolicy(resource: cdk.CfnResource) {
    resource.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)
  }

  public visit(node: IConstruct): void {
    if (node instanceof cdk.CfnResource) {
      this.applyPolicy(node)
    }
  }
}
