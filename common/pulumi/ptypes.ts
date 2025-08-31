import * as pulumi from "@pulumi/pulumi";

export type PulumiInputWrapper<T> = {
  [P in keyof T]: pulumi.Input<T[P]>;
};

export type PulumiOutputWrapper<T> = {
  [P in keyof T]: pulumi.Output<T[P]>;
};
