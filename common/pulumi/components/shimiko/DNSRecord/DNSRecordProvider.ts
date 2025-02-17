import * as pulumi from "@pulumi/pulumi";

import { DNSRecordType, domainName, supportedRecordTypes } from "./DNSRecord";

export interface DNSRecordProviderConfig {
  shimikoEndpoint?: string;
}

export interface DNSRecordProviderInputs {
  name: string;
  type: DNSRecordType;
  records: string[];
  ttl?: number;
}

export interface DNSRecordProviderOutputs extends DNSRecordProviderInputs {
  createdAt: string;
  updatedAt: string;
}

export class DNSRecordProvider
  implements pulumi.dynamic.ResourceProvider<DNSRecordProviderInputs, DNSRecordProviderOutputs>
{
  constructor(public config: DNSRecordProviderConfig = {}) {
    if (!this.config.shimikoEndpoint) {
      this.config.shimikoEndpoint = "http://shimiko.sapslaj.xyz";
    }
  }

  get shimikoEndpoint(): string {
    let endpoint = this.config.shimikoEndpoint;
    if (!endpoint) {
      endpoint = "http://shimiko.sapslaj.xyz";
    }
    if (!endpoint.endsWith("/")) {
      endpoint += "/";
    }
    return endpoint;
  }

  recordId(inputs: Pick<DNSRecordProviderInputs, "name" | "type">): pulumi.ID {
    return `${inputs.type}/${inputs.name}`;
  }

  async configure(req: pulumi.dynamic.ConfigureRequest): Promise<void> {
    const shimikoEndpoint = req.config.get("shimiko:endpoint");
    if (shimikoEndpoint) {
      this.config.shimikoEndpoint = shimikoEndpoint;
    }
  }

  async check(
    _olds: DNSRecordProviderInputs,
    news: DNSRecordProviderInputs,
  ): Promise<pulumi.dynamic.CheckResult<DNSRecordProviderInputs>> {
    const failures: pulumi.dynamic.CheckFailure[] = [];

    if (news.name.endsWith(domainName) || news.name.endsWith(domainName + ".")) {
      failures.push({
        property: "name",
        reason: `The name '${news.name}' should not end with the zone name.`,
      });
    }

    if (news.name.endsWith(".") && !news.name.endsWith(domainName + ".")) {
      failures.push({
        property: "name",
        reason: `The name '${news.name}' should not end with a dot ('.').`,
      });
    }

    const fullHostname = `${news.name}.${domainName}`;

    if (fullHostname.length > 253) {
      failures.push({
        property: "name",
        reason:
          `The full hostname '${fullHostname}' for the record '${news.name}' exceeds the length limit (${fullHostname.length} > 253).`,
      });
    }

    if (!(/^[a-z0-9][a-z0-9\.\-]+[a-z0-9]$/.test(news.name))) {
      failures.push({
        property: "name",
        reason: `The name '${news.name}' is not a valid RFC 1123 hostname.`,
      });
    }

    if (!supportedRecordTypes.includes(news.type)) {
      failures.push({
        property: "type",
        reason: `Record type '${news.type}' is not supported.`,
      });
    }

    return {
      inputs: news,
      failures: failures,
    };
  }

  async create(inputs: DNSRecordProviderInputs): Promise<pulumi.dynamic.CreateResult<DNSRecordProviderOutputs>> {
    const req = await fetch(this.shimikoEndpoint + `v1/dns-records/${inputs.type}/${inputs.name}`, {
      method: "POST",
      body: JSON.stringify({
        record: inputs,
      }),
    });
    const body = await req.json();
    if (req.status !== 200 || body.status !== "OK") {
      throw new Error(`error creating DNS record: ${JSON.stringify(body)}`);
    }
    const record = body.record;
    const outs: DNSRecordProviderOutputs = {
      ...inputs,
      name: record.name,
      type: record.type,
      records: record.records,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
    if (record.ttl) {
      outs.ttl = record.ttl;
    }
    return {
      id: this.recordId(inputs),
      outs,
    };
  }

  async diff(
    _id: pulumi.ID,
    olds: DNSRecordProviderOutputs,
    news: DNSRecordProviderInputs,
  ): Promise<pulumi.dynamic.DiffResult> {
    let changes: boolean = false;
    let replaces: string[] = [];

    if (olds.name != news.name) {
      changes = true;
      replaces.push("name");
    }
    if (olds.type != news.type) {
      changes = true;
      replaces.push("type");
    }
    if (JSON.stringify(olds.records) != JSON.stringify(news.records)) {
      changes = true;
    }
    if (olds.ttl != news.ttl) {
      changes = true;
    }

    return {
      changes,
      replaces,
      stables: [
        "createdAt",
      ],
    };
  }

  async update(
    _id: pulumi.ID,
    _olds: DNSRecordProviderInputs,
    inputs: DNSRecordProviderInputs,
  ): Promise<pulumi.dynamic.UpdateResult<DNSRecordProviderOutputs>> {
    const req = await fetch(this.shimikoEndpoint + `v1/dns-records/${inputs.type}/${inputs.name}`, {
      method: "POST",
      body: JSON.stringify({
        record: inputs,
      }),
    });
    const body = await req.json();
    if (req.status !== 200 || body.status !== "OK") {
      throw new Error(`error updating DNS record: ${JSON.stringify(body)}`);
    }
    const record = body.record;
    const outs: DNSRecordProviderOutputs = {
      ...inputs,
      name: record.name,
      type: record.type,
      records: record.records,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
    if (record.ttl) {
      outs.ttl = record.ttl;
    }
    return {
      outs,
    };
  }

  async delete(
    id: pulumi.ID,
    inputs: DNSRecordProviderInputs,
  ): Promise<void> {
    let type = inputs.type;
    let name = inputs.name;
    if (!type) {
      type = id.split("/", 1)[0] as DNSRecordType;
    }
    if (!name) {
      name = id.split("/", 1)[1];
    }
    const req = await fetch(this.shimikoEndpoint + `v1/dns-records/${type}/${name}`, {
      method: "DELETE",
    });
    const body = await req.json();
    if (req.status !== 200 || body.status !== "OK") {
      throw new Error(`error deleting DNS record: ${JSON.stringify(body)}`);
    }
  }

  async read(
    id: pulumi.ID,
    props?: DNSRecordProviderOutputs | undefined,
  ): Promise<pulumi.dynamic.ReadResult<DNSRecordProviderOutputs>> {
    let type = props?.type;
    let name = props?.name;
    if (!type) {
      type = id.split("/", 1)[0] as DNSRecordType;
    }
    if (!name) {
      name = id.split("/", 1)[1];
    }
    const req = await fetch(this.shimikoEndpoint + `v1/dns-records/${type}/${name}`, {
      method: "GET",
    });
    if (req.status === 404) {
      return {};
    }
    const body = await req.json();
    if (req.status !== 200) {
      throw new Error(`error reading DNS record: ${JSON.stringify(body)}`);
    }
    return {
      id: this.recordId(body.record),
      props: {
        ...props,
        name: body.record.name,
        type: body.record.type,
        records: body.record.records,
        ttl: body.record.ttl,
        createdAt: body.record.created_at,
        updatedAt: body.record.updated_at,
      },
    };
  }
}
