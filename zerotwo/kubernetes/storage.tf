resource "kubernetes_namespace_v1" "storage" {
  metadata {
    name = "storage"
  }
}

resource "helm_release" "nfs_provisioner" {
  name = "nfs-provisioner"

  repository = "https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/"
  chart      = "nfs-subdir-external-provisioner"

  values = [yamlencode({
    nfs = {
      server = "172.24.4.10"
      path   = "/mnt/exos/volumes/k3s"
    }
    storageClass = {
      name        = "nfs"
      accessModes = "ReadWriteMany"
    }
  })]
}

resource "helm_release" "longhorn" {
  name      = "longhorn"
  namespace = kubernetes_namespace_v1.storage.metadata[0].name

  repository = "https://charts.longhorn.io"
  chart      = "longhorn"
}
