from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i eris.sapslaj.xyz, --vault-password-file=vault_password main.yml")
