from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i octopi.homelab.sapslaj.com, main.yml")
