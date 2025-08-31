import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function mergeTags(
  ...groups: (
    | pulumi.Input<{
      [key: string]: pulumi.Input<string>;
    }>
    | undefined
  )[]
): pulumi.Input<{
  [key: string]: pulumi.Input<string>;
}> {
  return pulumi.all(groups).apply((groups) => {
    let result: Record<string, string> = {};
    for (const group of groups) {
      if (group === undefined) {
        continue;
      }
      result = {
        ...result,
        ...group,
      };
    }
    return result;
  });
}

export function iamPolicyDocument(
  args?: aws.iam.GetPolicyDocumentOutputArgs,
  opts?: pulumi.InvokeOutputOptions,
): pulumi.Output<string> {
  return aws.iam.getPolicyDocumentOutput(args, opts).json;
}
