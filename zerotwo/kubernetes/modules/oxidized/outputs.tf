output "namespace" {
  value = local.namespace
}

output "labels" {
  value = local.labels
}

output "config" {
  value = local.config
}

output "data_pvc_name" {
  value = kubernetes_persistent_volume_claim_v1.data.metadata[0].name
}

output "config_configmap_name" {
  value = kubernetes_config_map_v1.config.metadata[0].name
}
