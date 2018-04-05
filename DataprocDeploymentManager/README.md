# Dataproc Cluster Deploy

This example is intended to deploy a Dataproc cluster using python.

### How to run it

##### Clone the repo in your local machine
##### Initialize your gcloud credentials
```
gcloud init
```
##### Create the cluster
```
gcloud deployment-manager deployments create [deployment_name] --config cluster.yaml