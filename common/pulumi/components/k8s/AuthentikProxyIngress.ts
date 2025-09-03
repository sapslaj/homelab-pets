import * as kubernetes from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as std from "@pulumi/std";

import * as authentik from "../../sdks/authentik";
import { IngressDNS } from "./IngressDNS";

export interface AuthentikProxyIngressProps {
  name: pulumi.Input<string>;
  namespace: pulumi.Input<string>;
  slug?: pulumi.Input<string>;
  hostname: pulumi.Input<string>;
  service: {
    kind: pulumi.Input<string>;
    name: pulumi.Input<string>;
    port: pulumi.Input<number>;
  };
  additionalMiddlewares?: any[];
  enableAnubis?: boolean;
  enableIngressRoute?: boolean;
}

export class AuthentikProxyIngress extends pulumi.ComponentResource {
  providerProxy: authentik.ProviderProxy;
  application: authentik.Application;
  accessGroup: authentik.Group;
  accessGroupPolicyBinding: authentik.PolicyBinding;
  outpost: authentik.Outpost;
  forwardAuthMiddleware: kubernetes.apiextensions.CustomResource;
  ingressRoute?: kubernetes.apiextensions.CustomResource;
  ingressDNS: IngressDNS;

  constructor(name: string, props: AuthentikProxyIngressProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:nekopara:AuthentikProxyIngress", name, {}, opts);

    const slug = props.slug ?? pulumi.output(props.name).apply((name) => {
      return name
        .replace(/['\"!@#$%^&\*\(\)\[\]\{\};:\,\./<>\?\|`~=_\-+ ]/g, "")
        .toLowerCase()
        .replace(/\-+$/, "")
        .replace(/^\-+/, "");
    });

    this.ingressDNS = new IngressDNS(name, {
      hostname: props.hostname,
    }, {
      parent: this,
    });

    this.providerProxy = new authentik.ProviderProxy(name, {
      name: props.name,
      mode: "forward_single",
      externalHost: this.ingressDNS.hostname.apply((hostname) => `https://${hostname}`),
      authorizationFlow: authentik.getFlowOutput({
        slug: "default-provider-authorization-implicit-consent",
      }).id,
      invalidationFlow: authentik.getFlowOutput({
        slug: "default-provider-invalidation-flow",
      }).id,
    }, {
      parent: this,
    });

    this.application = new authentik.Application(name, {
      name: props.name,
      slug,
      protocolProvider: this.providerProxy.providerProxyId.apply((id) => parseInt(id)),
    }, {
      parent: this,
    });

    this.accessGroup = new authentik.Group(name, {
      name: pulumi.interpolate`${props.name} Access`,
    }, {
      parent: this,
    });

    this.accessGroupPolicyBinding = new authentik.PolicyBinding(name, {
      order: 100,
      target: this.application.uuid,
      group: this.accessGroup.id,
    }, {
      parent: this,
    });

    this.outpost = new authentik.Outpost(name, {
      name: props.name,
      protocolProviders: [
        this.providerProxy.providerProxyId.apply((id) => parseInt(id)),
      ],
      type: "proxy",
      serviceConnection: authentik.getServiceConnectionKubernetesOutput({
        name: "Local Kubernetes Cluster",
      }).id,
      config: std.jsonencodeOutput({
        input: {
          authentik_host: "https://login.sapslaj.cloud",
          kubernetes_namespace: "authentik",
        },
      }).result,
    }, {
      parent: this,
    });

    this.forwardAuthMiddleware = new kubernetes.apiextensions.CustomResource(`${name}-forward-auth`, {
      apiVersion: "traefik.io/v1alpha1",
      kind: "Middleware",
      metadata: {
        name: pulumi.output(slug).apply((name) => `${name}-authentik-forward-auth`),
        namespace: props.namespace,
      },
      spec: {
        forwardAuth: {
          address: pulumi
            .interpolate`http://ak-outpost-${slug}.authentik.svc.cluster.local:9000/outpost.goauthentik.io/auth/traefik`,
          trustForwardHeader: true,
          authResponseHeaders: [
            "X-authentik-username",
            "X-authentik-groups",
            "X-authentik-entitlements",
            "X-authentik-email",
            "X-authentik-name",
            "X-authentik-uid",
            "X-authentik-jwt",
            "X-authentik-meta-jwks",
            "X-authentik-meta-outpost",
            "X-authentik-meta-provider",
            "X-authentik-meta-app",
            "X-authentik-meta-version",
          ],
        },
      },
    }, {
      parent: this,
    });

    if (props.enableIngressRoute !== false) {
      this.ingressRoute = new kubernetes.apiextensions.CustomResource(`${name}-ingressroute`, {
        apiVersion: "traefik.io/v1alpha1",
        kind: "IngressRoute",
        metadata: {
          name: slug,
          namespace: props.namespace,
        },
        spec: {
          routes: [
            {
              match: pulumi.concat("Host(`", props.hostname, "`)"),
              kind: "Rule",
              middlewares: [
                {
                  name: this.forwardAuthMiddleware.metadata.name,
                  namespace: this.forwardAuthMiddleware.metadata.namespace,
                },
                ...(props.enableAnubis === false ? [] : [
                  {
                    name: "anubis",
                    namespace: "traefik",
                  },
                ]),
                ...(props.additionalMiddlewares ?? []),
              ],
              priority: 10,
              services: [
                {
                  namespace: props.namespace,
                  ...props.service,
                },
              ],
            },
            {
              match: pulumi.concat("Host(`", props.hostname, "`)  && PathPrefix(`/outpost.goauthentik.io/`)"),
              kind: "Rule",
              priority: 15,
              services: [
                {
                  name: pulumi.interpolate`ak-outpost-${slug}`,
                  namespace: "authentik",
                  kind: "Service",
                  port: 9000,
                },
              ],
            },
          ],
        },
      }, {
        parent: this,
      });
    }
  }
}
