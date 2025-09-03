import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export function getClusterStack(
  name?: string,
  args?: pulumi.StackReferenceArgs,
  opts?: pulumi.CustomResourceOptions,
): pulumi.StackReference {
  return new pulumi.StackReference(
    name ?? `organization/nekopara.cluster/prod`,
    args,
    opts,
  );
}

let defaultClusterStack: pulumi.StackReference | undefined = undefined;

export function getDefaultClusterStack(): pulumi.StackReference {
  if (!defaultClusterStack) {
    defaultClusterStack = getClusterStack();
  }
  return defaultClusterStack;
}

export function getDnsHostName(): pulumi.Output<string> {
  return getDefaultClusterStack().getOutput("dnsHostName") as pulumi.Output<string>;
}

export function getKubeconfig(): pulumi.Output<string> {
  return getDefaultClusterStack().getOutput("kubeconfig") as pulumi.Output<string>;
}

export function getK3sToken(): pulumi.Output<string> {
  return getDefaultClusterStack().getOutput("k3sToken") as pulumi.Output<string>;
}

export function getDnsFullName(): pulumi.Output<string> {
  return getDefaultClusterStack().getOutput("dnsFullName") as pulumi.Output<string>;
}

export function getServerUri(): pulumi.Output<string> {
  return getDefaultClusterStack().getOutput("serverUri") as pulumi.Output<string>;
}

let defaultK3sProviders: Record<string, kubernetes.Provider> = {};

export function newK3sProvider(
  name: string = "k3s",
  args: Partial<kubernetes.ProviderArgs> = {},
  opts: pulumi.ResourceOptions = {},
): kubernetes.Provider {
  if (!(name in defaultK3sProviders)) {
    defaultK3sProviders[name] = new kubernetes.Provider(name, {
      kubeconfig: getKubeconfig(),
      clusterIdentifier: getDnsHostName(),
      deleteUnreachable: true,
      ...args,
    }, opts);
  }
  return defaultK3sProviders[name];
}

export function transformSkipIngressAwait(): pulumi.ResourceTransform {
  return (args) => {
    if (args.type === "kubernetes:networking.k8s.io/v1:Ingress" || args.props.kind === "Ingress") {
      return {
        props: {
          ...args.props,
          metadata: {
            ...args.props.metadata,
            annotations: {
              ...args.props.metadata?.annotations,
              "pulumi.com/skipAwait": "true",
            },
          },
        },
        opts: args.opts,
      };
    }
  };
}

export function transformPatchForce(): pulumi.ResourceTransform {
  return (args) => {
    if (args.type.startsWith("kubernetes:")) {
      if (args.type.startsWith("kubernetes:helm") || args.type.startsWith("kubernetes:kustomize")) {
        return {
          ...args,
        };
      }

      return {
        props: {
          ...args.props,
          metadata: {
            ...args.props.metadata,
            annotations: {
              ...args.props.metadata?.annotations,
              "pulumi.com/patchForce": "true",
            },
          },
        },
        opts: args.opts,
      };
    }
  };
}
