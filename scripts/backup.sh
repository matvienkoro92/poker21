#!/usr/bin/env bash
# Резервная копия проекта (вызывается из pre-push хука или вручную)
set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKUP_PARENT="${REPO_ROOT}/../poker-club-miniapp-backups"
STAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="${BACKUP_PARENT}/${STAMP}"
mkdir -p "$BACKUP_DIR"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='poker-club-miniapp-backups' "$REPO_ROOT/" "$BACKUP_DIR/"
echo "Резервная копия: $BACKUP_DIR"
