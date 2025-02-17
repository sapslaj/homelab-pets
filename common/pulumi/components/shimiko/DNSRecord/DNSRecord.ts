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
}

export interface DNSRecordOutputs {
  name: pulumi.Output<string>;
  type: pulumi.Output<DNSRecordType>;
  records: pulumi.Output<string[]>;
  ttl: pulumi.Output<number | undefined>;
  createdAt: pulumi.Output<string>;
  updatedAt: pulumi.Output<string>;
}

export class DNSRecord extends pulumi.dynamic.Resource {
  constructor(name: string, props: DNSRecordInputs, opts?: pulumi.CustomResourceOptions) {
    const provider = opts?.provider as any as DNSRecordProvider ?? new DNSRecordProvider();
    super(provider, name, props, opts);
  }
}
