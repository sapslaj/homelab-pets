import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export function mergeTriggers(
  ...triggers: (pulumi.Input<mid.types.input.TriggersInputArgs> | undefined)[]
): pulumi.Input<mid.types.input.TriggersInputArgs> {
  const filtered = triggers.filter((t) => t !== undefined);
  return pulumi.all(filtered).apply((triggers) => {
    let result: pulumi.UnwrappedObject<mid.types.input.TriggersInputArgs> = {};
    for (const conf of triggers) {
      if (conf.refresh !== undefined) {
        result.refresh = [
          ...(result.refresh ?? []),
          ...conf.refresh,
        ];
      }
      if (conf.replace !== undefined) {
        result.replace = [
          ...(result.replace ?? []),
          ...conf.replace,
        ];
      }
    }
    return result;
  });
}
