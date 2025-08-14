import * as pulumi from "@pulumi/pulumi";

import { DNSRecordProvider } from "./DNSRecordProvider";

export const domainName = "sapslaj.xyz";

export type DNSRecordType = "A" | "AAAA" | "CNAME" | "NS";

export const supportedRecordTypes = [
  "A",
  "AAAA",
  "CNAME",
  "NS",
];

export interface DNSRecordInputs {
  name: pulumi.Input<string>;
  type: pulumi.Input<DNSRecordType>;
  records: pulumi.Input<pulumi.Input<string>[]>;
  ttl?: pulumi.Input<number>;
  noopOnEmpty?: pulumi.Input<boolean>;
}

export interface DNSRecordOutputs {
  name: pulumi.Output<string>;
  type: pulumi.Output<DNSRecordType>;
  records: pulumi.Output<string[]>;
  ttl: pulumi.Output<number | undefined>;
  createdAt: pulumi.Output<string>;
  updatedAt: pulumi.Output<string>;
}

export class DNSRecord extends pulumi.dynamic.Resource implements DNSRecordOutputs {
  public readonly name!: pulumi.Output<string>;
  public readonly type!: pulumi.Output<DNSRecordType>;
  public readonly records!: pulumi.Output<string[]>;
  public readonly ttl!: pulumi.Output<number | undefined>;
  public readonly createdAt!: pulumi.Output<string>;
  public readonly updatedAt!: pulumi.Output<string>;

  constructor(name: string, props: DNSRecordInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = opts?.provider as any as DNSRecordProvider ?? new DNSRecordProvider();
    super(provider, name, props, opts);
  }

  get fullname(): pulumi.Output<string> {
    return this.name.apply((name) => name.endsWith(".sapslaj.xyz") ? name : `${name}.sapslaj.xyz`);
  }
}
