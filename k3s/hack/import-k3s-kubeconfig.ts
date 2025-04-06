import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { parseArgs } from "util";

import { dirname, join } from "path";
import * as YAML from "yaml";

function mergeList(list: any[], append: any, name: string) {
  const result: any[] = [];
  for (const item of list) {
    if (item.name !== name) {
      result.push(item);
    }
  }
  result.push(append);
  return result;
}

(async () => {
  const { values } = parseArgs({
    options: {
      inventory: {
        type: "string",
        short: "i",
      },
      host_pattern: {
        type: "string",
        default: "all",
      },
      no_become: {
        type: "boolean",
      },
      path: {
        type: "string",
        default: "/etc/rancher/k3s/k3s.yaml",
      },
      kubeconfig: {
        type: "string",
      },
      master_host: {
        type: "string",
      },
      name: {
        type: "string",
      },
      stdout: {
        type: "boolean",
      },
    },
  });

  if (!values.inventory) {
    throw new Error("-i inventory must be specified");
  }

  const ansibleArgs = [
    values.host_pattern,
    "-i",
    values.inventory,
    "-m",
    "slurp",
    "-a",
    `src=${values.path}`,
  ];
  if (!values.no_become) {
    ansibleArgs.push("-b");
  }

  const subprocess = spawnSync("ansible", ansibleArgs, {
    env: {
      ...process.env,
      ANSIBLE_LOAD_CALLBACK_PLUGINS: "1",
      ANSIBLE_STDOUT_CALLBACK: "json",
    },
    encoding: "utf8",
  });
  if (subprocess.error) {
    throw subprocess.error;
  }
  const output = JSON.parse(subprocess.stdout);

  let newKubeconfig: any = undefined;
  let masterHost: string | undefined = undefined;
  let content: string | undefined = undefined;
  let name: string | undefined = undefined;
  for (const play of output.plays) {
    for (const task of play.tasks) {
      for (const [host, _result] of Object.entries(task.hosts)) {
        const result = _result as any;
        if (result.msg) {
          console.log(`${host}: ${result.msg}`);
        }
        content = result.content;
        if (!content) {
          continue;
        }
        const encoding = result.encoding;
        if (encoding !== "base64") {
          throw new Error(`Unknown encoding ${encoding}`);
        }
        content = Buffer.from(content, "base64").toString("utf8");
        name = host;
        if (values.name) {
          name = values.name;
        }
        masterHost = host;
        if (values.master_host) {
          masterHost = values.master_host;
        }
        content = content.replace("127.0.0.1", masterHost);
        break;
      }
      if (content) {
        break;
      }
    }
    if (content) {
      break;
    }
  }

  if (!content) {
    throw new Error(`Could not read ${values.path}`);
  }

  newKubeconfig = YAML.parse(content);
  newKubeconfig.users[0].name = name;
  newKubeconfig.clusters[0].name = name;
  newKubeconfig.contexts[0].name = name;
  newKubeconfig.contexts[0].context.cluster = newKubeconfig.clusters[0].name;
  newKubeconfig.contexts[0].context.user = newKubeconfig.users[0].name;

  const kubeconfigPath = values.kubeconfig ?? join(process.env.HOME!, ".kube", "config");
  let kubeconfig: any;
  if (existsSync(kubeconfigPath)) {
    kubeconfig = YAML.parse(readFileSync(kubeconfigPath, {
      encoding: "utf8",
    }));
  } else {
    kubeconfig = {
      "apiVersion": "v1",
      "kind": "Config",
      "preferences": {},
      "clusters": [],
      "contexts": [],
      "users": [],
    };
  }

  kubeconfig.clusters = mergeList(kubeconfig.clusters ?? [], newKubeconfig.clusters[0], name!);
  kubeconfig.contexts = mergeList(kubeconfig.contexts ?? [], newKubeconfig.contexts[0], name!);
  kubeconfig.users = mergeList(kubeconfig.users ?? [], newKubeconfig.users[0], name!);

  if (!kubeconfig["current-context"]) {
    kubeconfig["current-context"] = name;
  }
  if (values.stdout) {
    console.log(YAML.stringify(kubeconfig));
  } else {
    if (!existsSync(dirname(kubeconfigPath))) {
      mkdirSync(dirname(kubeconfigPath));
    }
    writeFileSync(kubeconfigPath, YAML.stringify(kubeconfig));
  }
})();
