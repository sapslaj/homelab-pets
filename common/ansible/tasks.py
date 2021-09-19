from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i eris.homelab.sapslaj.com, main.yml")
