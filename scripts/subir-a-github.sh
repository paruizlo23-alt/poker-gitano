#!/usr/bin/env bash
# Sube el proyecto a GitHub. Antes crea en github.com un repositorio VACÍO llamado "poker-gitano" (sin README).
# Uso: bash scripts/subir-a-github.sh TU-USUARIO TU-ID+TU-USUARIO@users.noreply.github.com
# El correo noreply está en GitHub → Settings → Emails (activa "Keep my email private").
set -euo pipefail
[ $# -eq 2 ] || { echo "Uso: bash scripts/subir-a-github.sh USUARIO_GITHUB CORREO_NOREPLY"; exit 1; }
GH_USER="$1"; MAIL="$2"
[[ "$MAIL" == *@users.noreply.github.com ]] || { echo "Usa tu correo noreply de GitHub (termina en @users.noreply.github.com) para no publicar tu correo real."; exit 1; }
cd "$(dirname "$0")/.."
[ -d .git ] || git init -b main
git config user.name "Pablo Ruiz Lozano"
git config user.email "$MAIL"
git add .
if git ls-files --error-unmatch .env >/dev/null 2>&1; then echo "ERROR: .env está incluido; no se sube."; exit 1; fi
git diff --cached --quiet || git commit -m "Poker Gitano"
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$GH_USER/poker-gitano.git"
echo "Se subirá a: $(git remote get-url origin)  ($(git ls-files | wc -l) archivos)"
read -r -p "¿Continuar? [s/N] " r; [[ "$r" =~ ^[sS]$ ]] || { echo "Cancelado (el commit local se ha hecho)."; exit 0; }
git push -u origin main
