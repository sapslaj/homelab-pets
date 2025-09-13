import * as aws from "@pulumi/aws";
import * as cloudflare from "@pulumi/cloudflare";
import * as pulumi from "@pulumi/pulumi";

import { DNSRecord } from "../shimiko/DNSRecord";

export interface IngressDNSProps {
  hostname?: pulumi.Input<string>;
  ttl?: pulumi.Input<number>;
}

export class IngressDNS extends pulumi.ComponentResource {
  hostname: pulumi.Output<string>;

  constructor(name: string, props: IngressDNSProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:nekopara:IngressDNS", name, {}, opts);

    this.hostname = pulumi.output(props.hostname ?? name).apply((hostname) => {
      if (!hostname.includes(".")) {
        hostname += ".sapslaj.xyz";
      }

      if (hostname.endsWith(".sapslaj.xyz")) {
        new DNSRecord(name, {
          name: hostname.replace(/\.sapslaj\.xyz$/, ""),
          type: "CNAME",
          records: ["sapslaj.xyz."],
        }, {
          parent: this,
        });
      } else if (hostname.endsWith(".sapslaj.cloud")) {
        new aws.route53.Record(name, {
          name: hostname,
          ttl: props.ttl ?? 300,
          type: "CNAME",
          records: ["sapslaj.xyz."],
          zoneId: aws.route53.getZoneOutput({
            name: "sapslaj.cloud",
          }).zoneId,
        }, {
          parent: this,
        });
      } else if (hostname.endsWith(".cloud.sapslaj.com")) {
        new aws.route53.Record(name, {
          name: hostname,
          ttl: props.ttl ?? 300,
          type: "CNAME",
          records: ["sapslaj.xyz."],
          zoneId: aws.route53.getZoneOutput({
            name: "cloud.sapslaj.com",
          }).zoneId,
        }, {
          parent: this,
        });
      } else if (hostname.endsWith(".sapslaj.com")) {
        new cloudflare.DnsRecord(name, {
          name: hostname.replace(/\.sapslaj\.com$/, ""),
          type: "CNAME",
          ttl: props.ttl ?? 300,
          content: "sapslaj.xyz",
          zoneId: cloudflare.getZoneOutput({
            filter: {
              name: "sapslaj.com",
            },
          }).id,
        }, {
          parent: this,
        });
      } else {
        throw new Error(`unsupported zone for hostname ${hostname}`);
      }

      return hostname;
    });
  }
}
