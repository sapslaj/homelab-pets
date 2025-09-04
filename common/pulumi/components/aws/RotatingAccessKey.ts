import * as crypto from "crypto";

import { CreateAccessKeyCommand, DeleteAccessKeyCommand, IAMClient, NoSuchEntityException } from "@aws-sdk/client-iam";
import * as pulumi from "@pulumi/pulumi";
import { PulumiInputWrapper, PulumiOutputWrapper } from "../ptypes";

export function generateSesSmtpPassword(secretAccessKey: string): string {
  const key = secretAccessKey;
  const region = "us-east-1";
  const date = "11111111";
  const service = "ses";
  const terminal = "aws4_request";
  const message = "SendRawEmail";
  const version = 0x04;

  const kDate = crypto.createHmac("sha256", "AWS4" + key).update(date).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
  const kTerminal = crypto.createHmac("sha256", kService).update(terminal).digest();
  const kMessage = crypto.createHmac("sha256", kTerminal).update(message).digest();

  const signatureAndVersion = Buffer.concat([Buffer.from([version]), kMessage]);
  const smtpPassword = signatureAndVersion.toString("base64");

  return smtpPassword;
}

export interface RotatingAccessKeyProviderInputs {
  user: string;
  trigger?: any;
}

export interface RotatingAccessKeyProviderOutputs extends RotatingAccessKeyProviderInputs {
  expiresAt: string;
  createDate: string;
  secret: string;
  sesSmtpPassword: string;
}

export const RotatingAccessKeyProvider: pulumi.dynamic.ResourceProvider<
  RotatingAccessKeyProviderInputs,
  RotatingAccessKeyProviderOutputs
> = {
  // async diff(
  //   id: pulumi.ID,
  //   olds: RotatingAccessKeyProviderOutputs,
  //   news: RotatingAccessKeyProviderInputs,
  // ): Promise<pulumi.dynamic.DiffResult> {
  //   let result: pulumi.dynamic.DiffResult = {
  //     changes: false,
  //   };
  //
  //   if (olds.expiresAt) {
  //     const ts = new Date(olds.expiresAt);
  //     if (ts < new Date()) {
  //       if (result.replaces === undefined) {
  //         result = {
  //           changes: true,
  //           replaces: [
  //             ...(result.replaces ?? []),
  //             "timestamp",
  //           ],
  //         };
  //       }
  //     }
  //   }
  //
  //   if (olds.user !== news.user) {
  //     result = {
  //       changes: true,
  //       replaces: [
  //         ...(result.replaces ?? []),
  //         "user",
  //       ],
  //     };
  //   }
  //
  //   if (olds.trigger !== news.trigger) {
  //     result = {
  //       changes: true,
  //       replaces: [
  //         ...(result.replaces ?? []),
  //         "trigger",
  //       ],
  //     };
  //   }
  //
  //   return result;
  // },

  async create(
    inputs: RotatingAccessKeyProviderInputs,
  ): Promise<pulumi.dynamic.CreateResult<RotatingAccessKeyProviderOutputs>> {
    let expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const client = new IAMClient();
    const result = await client.send(
      new CreateAccessKeyCommand({
        UserName: inputs.user,
      }),
    );

    if (result.AccessKey === undefined) {
      throw new Error("no access key returned from AWS");
    }
    if (result.AccessKey.AccessKeyId === undefined) {
      throw new Error("no access key ID returned from AWS");
    }
    if (result.AccessKey.SecretAccessKey === undefined) {
      throw new Error("no secret access key returned from AWS");
    }
    if (result.AccessKey.CreateDate === undefined) {
      throw new Error("no create date returned from AWS");
    }

    const sesSmtpPassword = generateSesSmtpPassword(result.AccessKey.SecretAccessKey);

    return {
      id: result.AccessKey.AccessKeyId,
      outs: {
        user: inputs.user,
        trigger: inputs.trigger ?? null,
        createDate: result.AccessKey.CreateDate.toISOString(),
        expiresAt: expiresAt.toISOString(),
        secret: result.AccessKey.SecretAccessKey,
        sesSmtpPassword,
      },
    };
  },

  // async read(
  //   id: pulumi.ID,
  //   props?: RotatingAccessKeyProviderOutputs | undefined,
  // ): Promise<pulumi.dynamic.ReadResult<RotatingAccessKeyProviderOutputs>> {
  //
  // }

  // async update(
  //   id: pulumi.ID,
  //   olds: RotatingAccessKeyProviderOutputs,
  //   news: RotatingAccessKeyProviderInputs,
  // ): Promise<pulumi.dynamic.UpdateResult<RotatingAccessKeyProviderOutputs>> {
  //
  // }

  async delete(id: pulumi.ID, props: RotatingAccessKeyProviderOutputs): Promise<void> {
    const client = new IAMClient();
    // TODO: catch if the key has already been deleted or the user doesn't
    // exist and don't error out.
    try {
      await client.send(
        new DeleteAccessKeyCommand({
          AccessKeyId: id,
          UserName: props.user,
        }),
      );
    } catch (error) {
      if (!(error instanceof NoSuchEntityException)) {
        throw error;
      }
    }
  },
};

export type RotatingAccessKeyArgs = PulumiInputWrapper<RotatingAccessKeyProviderInputs>;
export type RotatingAccessKeyState = PulumiOutputWrapper<RotatingAccessKeyProviderOutputs>;

export class RotatingAccessKey extends pulumi.dynamic.Resource implements RotatingAccessKeyState {
  public readonly user!: pulumi.Output<string>;
  public readonly trigger?: pulumi.Output<string>;
  public readonly expiresAt!: pulumi.Output<string>;
  public readonly createDate!: pulumi.Output<string>;
  public readonly secret!: pulumi.Output<string>;
  public readonly sesSmtpPassword!: pulumi.Output<string>;

  constructor(name: string, props: RotatingAccessKeyArgs, opts?: pulumi.CustomResourceOptions) {
    super(
      RotatingAccessKeyProvider,
      name,
      {
        ...props,
        expiresAt: undefined,
        createDate: undefined,
        secret: undefined,
        sesSmtpPassword: undefined,
      },
      pulumi.mergeOptions(opts, {
        replaceOnChanges: [
          "user",
          "trigger",
        ],
        additionalSecretOutputs: [
          "secret",
          "sesSmtpPassword",
        ],
      }),
      "sapslaj:aws",
      "RotatingAccessKey",
    );
  }
}
