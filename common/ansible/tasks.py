from invoke import task


@task
def apply(c):
    c.run("ansible-playbook -i inventory main.yml")


@task
def update(c):
    c.run("ansible-playbook -i inventory update.yml")
