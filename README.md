[![Build Docker Image](https://github.com/clowa/microk8s-backup/actions/workflows/docker-buildx.yaml/badge.svg)](https://github.com/clowa/microk8s-backup/actions/workflows/docker-buildx.yaml)

# Overview

Docker image to backup microk8s dqlite database to AWS s3. This docker image contains [go-migrator](https://github.com/canonical/go-migrator) and a wrapper script inspired by the [python script](https://github.com/ubuntu/microk8s/blob/master/scripts/wrappers/dbctl.py) of [microk8s dbctl](https://microk8s.io/docs/command-reference#heading--microk8s-dbctl).

### Supported platforms:

- `linux/amd64`
- `linux/arm64/v8`
- `linux/arm/v7`

# Usage

_Whole code examples are at `./kubernetes/`._

First of all store your configuration as a `Secret` and `ConfigMap`.

```yaml
---
# Secret containing all sensitive data.
apiVersion: v1
kind: Secret
metadata:
  name: microk8s-backup-aws
type: Opaque
stringData:
  AWS_REGION: eu-central-1 # Change me
  AWS_ACCESS_KEY_ID: XXXXXXXXXXXXXXXXXXXX # Change me
  AWS_SECRET_ACCESS_KEY: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX # Change me
---
# ConfigMap with unsensitive configuration information.
apiVersion: v1
kind: ConfigMap
metadata:
  name: microk8s-backup-config
data:
  BUCKET: my-bucket # Change me
  KEY: "backup/microk8s/"
  DEBUG: "false"
```

Now you can decide if you want to do a [onetime backup](#onetime-backup) or to [schedule the backup](#scheduled-backup)

## Onetime backup

To run a onetime backup of your microk8s cluster you can simply run a pod to get the backup done.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: microk8s-backup
spec:
  restartPolicy: OnFailure
  securityContext:
    runAsUser: 1000
    runAsGroup: 998 # You may have to adjust this to fit the file permissions of the kine socket.
    fsGroup: 1000
  volumes:
    - name: kine
      hostPath:
        path: /var/snap/microk8s/current/var/kubernetes/backend/kine.sock
        type: Socket
  containers:
    - name: backup
      image: clowa/microk8s-backup:v0.0.2
      imagePullPolicy: Always
      env:
        - name: KINE_ENDPOINT
          value: "/kine.sock"
        - name: AWS_ACCESS_KEY_ID
          valueFrom:
            secretKeyRef:
              name: microk8s-backup-aws
              key: AWS_ACCESS_KEY_ID
        - name: AWS_SECRET_ACCESS_KEY
          valueFrom:
            secretKeyRef:
              name: microk8s-backup-aws
              key: AWS_SECRET_ACCESS_KEY
        - name: AWS_REGION
          valueFrom:
            secretKeyRef:
              name: microk8s-backup-aws
              key: AWS_REGION
        - name: BUCKET
          valueFrom:
            configMapKeyRef:
              name: microk8s-backup-config
              key: BUCKET
        - name: KEY
          valueFrom:
            configMapKeyRef:
              name: microk8s-backup-config
              key: KEY
        - name: DEBUG
          valueFrom:
            configMapKeyRef:
              name: microk8s-backup-config
              key: DEBUG
      volumeMounts:
        - name: kine
          mountPath: /kine.sock
      securityContext:
        allowPrivilegeEscalation: false
      resources:
        requests:
          cpu: "20m"
          memory: "20Mi"
        limits:
          cpu: "100m"
          memory: "64Mi"
```

## Scheduled backup

If you want to schedule the backup you can use kubernetes `CronJob`.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-microk8s
spec:
  schedule: "0 21 * * *" # Adjust this as needed.
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          securityContext:
            runAsUser: 1000
            runAsGroup: 998
            fsGroup: 1000
          volumes:
            - name: kine
              hostPath:
                path: /var/snap/microk8s/current/var/kubernetes/backend/kine.sock
                type: Socket
          containers:
            - name: backup
              image: clowa/microk8s-backup:v0.0.2
              imagePullPolicy: Always
              securityContext:
                allowPrivilegeEscalation: false
              volumeMounts:
                - name: kine
                  mountPath: /kine.sock
              env:
                - name: KINE_ENDPOINT
                  value: "/kine.sock"
                - name: AWS_ACCESS_KEY_ID
                  valueFrom:
                    secretKeyRef:
                    name: microk8s-backup-aws
                    key: AWS_ACCESS_KEY_ID
                - name: AWS_SECRET_ACCESS_KEY
                  valueFrom:
                    secretKeyRef:
                    name: microk8s-backup-aws
                    key: AWS_SECRET_ACCESS_KEY
                - name: AWS_REGION
                  valueFrom:
                    secretKeyRef:
                    name: microk8s-backup-aws
                    key: AWS_REGION
                - name: BUCKET
                  valueFrom:
                    configMapKeyRef:
                    name: microk8s-backup-config
                    key: BUCKET
                - name: KEY
                  valueFrom:
                    configMapKeyRef:
                    name: microk8s-backup-config
                    key: KEY
                - name: DEBUG
                  valueFrom:
                    configMapKeyRef:
                    name: microk8s-backup-config
                    key: DEBUG
              resources:
                requests:
                  cpu: "20m"
                  memory: "20Mi"
                limits:
                  cpu: "100m"
                  memory: "64Mi"
```
