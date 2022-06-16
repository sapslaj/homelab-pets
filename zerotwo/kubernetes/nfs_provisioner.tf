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
