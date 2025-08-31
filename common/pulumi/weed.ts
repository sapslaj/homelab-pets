import { CreateBucketCommand, DeleteBucketCommand, S3Client } from "@aws-sdk/client-s3";
import * as pulumi from "@pulumi/pulumi";

export interface WeedBucketProviderInputs {
  bucket: string;
}

export interface WeedBucketProviderOutputs extends WeedBucketProviderInputs {
  endpoint: string;
}

export class WeedBucketProvider
  implements pulumi.dynamic.ResourceProvider<WeedBucketProviderInputs, WeedBucketProviderOutputs>
{
  constructor() {}

  newS3Client() {
    return new S3Client({
      bucketEndpoint: false,
      endpoint: "http://172.24.4.10:8333",
    });
  }

  async create(inputs: WeedBucketProviderInputs): Promise<pulumi.dynamic.CreateResult<WeedBucketProviderOutputs>> {
    const client = this.newS3Client();
    const res = await client.send(
      new CreateBucketCommand({
        Bucket: inputs.bucket,
      }),
    );
    return {
      id: inputs.bucket,
      outs: {
        ...inputs,
        endpoint: "http://172.24.4.10:8333",
      },
    };
  }

  // async update(
  //   id: pulumi.ID,
  //   olds: WeedBucketProviderOutputs,
  //   news: WeedBucketProviderInputs,
  // ): Promise<pulumi.dynamic.UpdateResult<WeedBucketProviderOutputs>> {
  // }

  async delete(id: pulumi.ID, props: WeedBucketProviderOutputs): Promise<void> {
    const client = this.newS3Client();
    client.send(
      new DeleteBucketCommand({
        Bucket: id,
      }),
    );
  }
}

export interface WeedBucketArgs {
  bucket: pulumi.Input<string>;
}

export interface WeedBucketState {
  bucket: pulumi.Output<string>;
  endpoint: pulumi.Output<string>;
}

export class WeedBucket extends pulumi.dynamic.Resource implements WeedBucketState {
  public readonly bucket!: pulumi.Output<string>;
  public readonly endpoint: pulumi.Output<string>;

  constructor(name: string, props: WeedBucketArgs, opts?: pulumi.CustomResourceOptions) {
    const provider = opts?.provider as any as WeedBucketProvider ?? new WeedBucketProvider();
    super(
      provider,
      name,
      props,
      pulumi.mergeOptions(opts, {
        replaceOnChanges: [
          "bucket",
        ],
      }),
    );
  }
}
