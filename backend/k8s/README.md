# Kubernetes Manifests for SIE Backend
# Implements SRE Plan §3.3 and Phase 2 requirements

This directory contains Kubernetes manifests for deploying SIE to a K8s cluster.

## Quick Deploy

```bash
# Create namespace and secrets
kubectl apply -f namespace.yaml
kubectl apply -f secrets.yaml   # Create your own from secrets.yaml.example

# Deploy core services
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Enable auto-scaling
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
```

## Files

| File | Description |
|------|-------------|
| `namespace.yaml` | SIE namespace with labels |
| `deployment.yaml` | API and worker deployments |
| `service.yaml` | ClusterIP service and Ingress |
| `hpa.yaml` | HorizontalPodAutoscaler for API and workers |
| `pdb.yaml` | PodDisruptionBudget for HA |
| `secrets.yaml.example` | Template for secrets |

## Requirements

- Kubernetes 1.25+
- Ingress controller (nginx recommended)
- cert-manager for TLS (optional)
- Prometheus Operator for custom metrics HPA (optional)
