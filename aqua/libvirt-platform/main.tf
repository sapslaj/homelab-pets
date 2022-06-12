terraform {
  required_providers {
    libvirt = {
      source = "dmacvicar/libvirt"
    }
  }

  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "sapslaj"

    workspaces {
      name = "homelab-pets-aqua-libvirt-platform"
    }
  }
}

locals {
  cloudinit = {
    base = {
      users = [
        {
          name                = "sapslaj"
          sudo                = "ALL=(ALL) NOPASSWD:ALL"
          lock_passwd         = false
          passwd              = "$6$HKmDQSk/$prBGGB/SR0Kw5VTyquE3gfiHhYcy7xOr2yUpVIPdfZy./DC2BYljx0KYhqTX.d5ELFcf7mrQk2KeP0nuIaXCz1"
          ssh_authorized_keys = ["ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDALIs2j0FT1nlmRdIoaGt+gzyn8iOgHDQS1lg5ivSYDpU3tKsLQgFB9l+q0zB0hODNaVSiJfekMi43gkULnUf20g5M0ysAgjowDKIeGsFQIKWifO9J7aXSEdAaupIcPDZt8oWqJysxqpxL5pICbQzU1+f7yk2L8bC5rd1mQGgoDWvRkwUCtAdL5pGndDpZ7xke2eYvTwglDEjr32F0zQf1u2t7XNGWPJhIbvvipEsRZY68W0HAgNKo3qWA/Q2jdbFvgNWXeEvvHKT+13exjhZrXFUaA3XCkZx0WZanCn5MMShENhVgn01HGGrKOLCm5jk49lJIesYHRkYfx5PzZT6B saps.laj@gmail.com"]
        },
        {
          name                = "ci"
          sudo                = "ALL=(ALL) NOPASSWD:ALL"
          ssh_authorized_keys = ["ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCmJsCb5da9gTwpettT9ba8cGQwlnKDUNZuwr64KnaLufzCkRaiSBFgsLC3UvFCrmnONZFnwXYruaQXRukKxThOvfRvCPz/ieiD/udzvgXRR/BHyhWUcLSs3IthNF7ic5EAqStL1Fo6Y6oEot43MvD/5W0IonF70J6bjjgxq5kajaubW7EKNUdhbzmycNc0orkEHO4NQSr7OWOULuXd9asVi/W4xG2kOqKEkZ9i5HtHcYsdHW8sbYVVQy/JlXm0I+UdpCQ6XrlasW/QuUrdT/qPKYC4b8a1jvyY1z8I8TMFahQq0UMCdm+QubMWKJCwkc0GskvezfwRO0GCmaNYKFus04qDzk6d5fAji1P8xJsmbm2I0GDD0snxNQ/+1cY+4Dc9g86Hh50HjeR6rCX+fvH5LG/m9G1uT7VbBxRQCpl0QfcKMn0U6w5FcGZIb/SfdXU8erKalAoPow3kCBZ8bwGc7SdWaBEpxpz4SorcDWn5wso+o/AH8dlY42fv7D81yrk= ci@sapslaj.com"]
        }
      ]
    }
  }
  networks = {
    br0_vlan4 = {
      bridge = "vm.br0.4"
    }
    br0_vlan5 = {
      bridge = "vm.br0.5"
    }
  }
}

resource "libvirt_volume" "ubuntu_20_04_qcow2" {
  name   = "ubuntu-20.04-server-cloudimg-amd64.img"
  pool   = "default"
  source = "https://cloud-images.ubuntu.com/releases/focal/release/ubuntu-20.04-server-cloudimg-amd64.img"
  format = "qcow2"
}
