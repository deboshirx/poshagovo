#!/usr/bin/env bash
# Собирает версию для обычного PHP-хостинга (без Node.js) в build/hosting:
# фронтенд из client/dist + PHP-версия API из php/ + демо-база.
# С флагом --publish заливает результат в ветку hosting, откуда её забирает install.php.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=build/hosting

npm run build
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R client/dist/. "$OUT"/
cp -R php/. "$OUT"/
cp server/src/schema.sql "$OUT"/server/schema.sql

# демо-база генерируется тем же сидом, что и для Node-версии
DB_PATH="$OUT/server/demo.db" node --disable-warning=ExperimentalWarning server/src/seed.js --reset
node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('$OUT/server/demo.db');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE; VACUUM;');
"
rm -f "$OUT"/server/demo.db-wal "$OUT"/server/demo.db-shm

echo "Собрано в $OUT"

if [[ "${1:-}" == "--publish" ]]; then
  REMOTE=$(git remote get-url origin)
  cd "$OUT"
  git init -q -b hosting
  git add -A
  git -c user.name="$(git -C ../.. config user.name)" -c user.email="$(git -C ../.. config user.email)" \
    commit -qm "Сборка для хостинга $(date +%Y-%m-%d)"
  git push -qf "$REMOTE" hosting
  rm -rf .git
  echo "Опубликовано в ветку hosting"
fi
