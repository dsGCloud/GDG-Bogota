# KUBERNETES HANDS-ON

As part of the event hosted by the GDG Bogotá we had an introduction to kubernetes in wich the QWikLab [Hello Node Kubernetes](https://run.qwiklab.com/focuses/6475) was developed with the variant of creating the cluster and the pod using Deployment Manager.

### How to run it

##### Clone the repo in your local machine
##### Initialize your gcloud credentials
```
gcloud init
```
##### Create the cluster
```
gcloud deployment-manager deployments create [deployment_name] --config cluster.yaml
```
##### Deploy the service and Load balancer
```
gcloud deployment-manager deployments create [deployment_name] --config replicatedservice.yaml
```
##### Fetch credentials to access the cluster
```
gcloud container cluster get-credentials [CLUSTER_NAME] --zone [ZONE]
```
##### Check the deployment
Go to your GCP console and check your deployments under Deployment Manager.
```
kubectl get rc
kubectl get services
```

Your external IP will be shown now to check your deploy.
##### Update your service
Upload a new version on your image in Container registry and update your service. Do not forget to edit the version on
the replicatedservice.yaml
```
gcloud deployment-manager deployments update [deployment_name] --config replicatedservice.yaml
```