#!/usr/bin/env bash
# Сброс счётчика призов «Найди Пиханину» через API (остаток снова 15).
# Секрет берётся из настроек Vercel (тот же, что для напоминаний).
#
# Использование:
#   chmod +x scripts/reset-pikhanina.sh   # один раз
#   ./scripts/reset-pikhanina.sh ВАШ_СЕКРЕТ
# или с указанием домена:
#   ./scripts/reset-pikhanina.sh ВАШ_СЕКРЕТ https://ваш-домен.vercel.app
set -e
SECRET="${1:?Укажите секрет из настроек Vercel: ./scripts/reset-pikhanina.sh ВАШ_СЕКРЕТ}"
BASE="${2:-https://poker-app-ebon.vercel.app}"
URL="${BASE%/}/api/pikhanina?reset=1&secret=${SECRET}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl не найден. Открой в браузере:"
  echo "  $URL"
  exit 1
fi

echo "Вызов API..."
RESP=$(curl -s -w "\n%{http_code}" "$URL")
HTTP_CODE=$(echo "$RESP" | tail -n1)
BODY=$(echo "$RESP" | sed '$d')
if [ "$HTTP_CODE" = "200" ]; then
  echo "$BODY" | head -c 300
  echo ""
  echo "Готово. Обнови мини-приложение — остаток призов обнулён."
else
  echo "Ошибка HTTP $HTTP_CODE"
  echo "$BODY"
  echo ""
  if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
    echo "Секрет не подошёл. Проверь в Vercel → Settings значение секрета (без пробелов, скопируй целиком)."
  fi
  exit 1
fi
