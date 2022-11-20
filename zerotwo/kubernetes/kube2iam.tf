resource "aws_iam_user" "kube2iam" {
  name = "k3s-kube2iam"
}

data "aws_iam_policy_document" "kube2iam" {
  statement {
    actions   = ["sts:AssumeRole"]
    resources = ["*"] # yolo
  }
}

data "aws_iam_policy_document" "assume_from_k8s" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_user.kube2iam.arn]
    }
  }
}

resource "aws_iam_user_policy" "kube2iam" {
  name   = "kube2iam"
  user   = aws_iam_user.kube2iam.name
  policy = data.aws_iam_policy_document.kube2iam.json
}

resource "aws_iam_access_key" "kube2iam" {
  user = aws_iam_user.kube2iam.name
}

resource "helm_release" "kube2iam" {
  name      = "kube2iam"
  namespace = "kube-system"

  repository = "https://jtblin.github.io/kube2iam/"
  chart      = "kube2iam"
  version    = "2.6.0"

  values = [yamlencode({
    aws = {
      access_key = aws_iam_access_key.kube2iam.id
      secret_key = aws_iam_access_key.kube2iam.secret
      region     = "us-east-1"
    }
    rbac = {
      create = true
    }
    updateStrategy = "RollingUpdate"
    # probes disabled due to not being able to disable IMDS checking in kube2iam currently
    livenessProbe = {
      enabled = false
    }
    readinessProbe = {
      enabled = false
    }
    extraArgs = {
      log-level = "debug"
      debug     = true
    }
    host = {
      iptables  = true
      interface = "cni0"
    }
  })]
}
