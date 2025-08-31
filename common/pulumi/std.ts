import * as pulumi from "@pulumi/pulumi";
import * as pstd from "@pulumi/std";
import * as YAML from "yaml";

export function jsonencode(input: pulumi.Input<any>): pulumi.Output<string> {
  return pulumi.output(input).apply((v) => JSON.stringify(v));
}

export function md5(input: pulumi.Input<string>): pulumi.Output<string> {
  return pstd.md5Output({
    input,
  }).result;
}

export function sha1(input: pulumi.Input<string>): pulumi.Output<string> {
  return pstd.sha1Output({
    input,
  }).result;
}

export function sha256(input: pulumi.Input<string>): pulumi.Output<string> {
  return pstd.sha256Output({
    input,
  }).result;
}

export function sha512(input: pulumi.Input<string>): pulumi.Output<string> {
  return pstd.sha512Output({
    input,
  }).result;
}

export function yamlencode(input: pulumi.Input<any>): pulumi.Output<string> {
  return pulumi.output(input).apply((v) => YAML.stringify(v));
}
