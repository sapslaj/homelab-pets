import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export type SupportedGoarch = "amd64" | "386" | "armv5" | "armv6" | "armv7" | "arm64" | "riscv64";

export function unameMachineToGoarch(arch: string): SupportedGoarch {
  switch (arch) {
    case "x86_64":
    case "x86-64":
    case "x64":
    case "amd64":
      return "amd64";
    case "i386":
    case "i486":
    case "i686":
    case "i786":
    case "x86":
      return "386";
    case "armv5l":
      return "armv5";
    case "armv6l":
      return "armv6";
    case "armv7l":
    case "armv8l":
      return "armv7";
    case "aarch64":
    case "arm64":
      return "arm64";
    case "riscv64":
      return "riscv64";
  }
  throw new Error(`unsupported architecture: ${arch}`);
}

export async function getGoarch(
  args: Omit<mid.agent.ExecArgs, "command">,
  opts?: pulumi.InvokeOptions,
): Promise<string> {
  const output = await mid.agent.exec({
    ...args,
    command: ["uname", "-m"],
  }, opts);
  return unameMachineToGoarch(output.stdout.trim());
}

export function getGoarchOutput(
  args: Omit<mid.agent.ExecOutputArgs, "command">,
  opts?: pulumi.InvokeOutputOptions,
): pulumi.Output<SupportedGoarch> {
  return pulumi.unsecret(
    mid.agent.execOutput({
      ...args,
      command: ["uname", "-m"],
    }, opts).apply((arch) => {
      if (arch === undefined || arch.stdout === undefined) {
        return undefined as any as SupportedGoarch; // special case for `unknown` values
      }
      return unameMachineToGoarch(arch.stdout.trim());
    }),
  );
}

export async function latestGithubRelease(repo: string): Promise<string> {
  return fetch(`https://api.github.com/repos/${repo}/releases/latest`)
    .then((res) => res.json())
    .then((res) => res["tag_name"]);
}

export function latestGithubReleaseOutput(repo: pulumi.Input<string>): pulumi.Output<string> {
  return pulumi.output(repo).apply(latestGithubRelease);
}

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
