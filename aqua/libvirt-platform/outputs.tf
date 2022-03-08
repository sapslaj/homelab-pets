output "cloudinit" {
  value = local.cloudinit
}

output "networks" {
  value = local.networks
}

output "ubuntu_20_04_qcow2_id" {
  value = libvirt_volume.ubuntu_20_04_qcow2.id
}

output "ubuntu_20_04_qcow2_name" {
  value = libvirt_volume.ubuntu_20_04_qcow2.name
}
