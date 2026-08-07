#!/usr/bin/env bash
#
# מושך את התמונה האחרונה של Osh.it ומרים מחדש רק אם באמת השתנה משהו.
#
# זו כל מנגנון הפריסה. אין כאן גישה ל-docker socket מתוך קונטיינר,
# אין תלות בכלי צד שלישי, וכל מה שהסקריפט יכול לעשות הוא לעדכן שירות אחד.
#
# התקנה:
#   sudo cp oshit-update.sh /usr/local/bin/oshit-update
#   sudo chmod +x /usr/local/bin/oshit-update
#   crontab -e
#     */5 * * * * STACK_DIR=/path/to/stack /usr/local/bin/oshit-update >> /var/log/oshit-update.log 2>&1

set -euo pipefail

STACK_DIR="${STACK_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SERVICE="${SERVICE:-oshit}"
IMAGE="${IMAGE:-ghcr.io/saarcohenn/oshit:latest}"

log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }

cd "$STACK_DIR"

# משיכה שנכשלת (אין רשת, ה-registry למטה) לא אמורה להפיל את מה שרץ
if ! docker compose pull --quiet "$SERVICE" 2>/dev/null; then
  log "משיכה נכשלה — משאירים את הגרסה הרצה על כנה"
  exit 0
fi

# ההשוואה היא בין התמונה שיושבת על הדיסק לבין זו שהקונטיינר באמת רץ עליה,
# ולא בין לפני ואחרי המשיכה. כך גם תמונה שהתעדכנה בדרך אחרת — משיכה ידנית,
# תהליך אחר — עדיין תגרור הרמה מחדש, ולא תישאר תלויה באוויר.
pulled="$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo none)"
running="$(docker inspect --format '{{.Image}}' "$SERVICE" 2>/dev/null || echo none)"

if [ "$pulled" = "$running" ]; then
  log "אין גרסה חדשה"
  exit 0
fi

log "נמצאה גרסה חדשה — מרימים מחדש"
docker compose up -d "$SERVICE"

# מוודאים שהשירות באמת חזר, ולא רק שהקונטיינר נוצר
for _ in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' "$SERVICE" 2>/dev/null)" = "healthy" ]; then
    log "עודכן בהצלחה"
    docker image prune -f --filter "label=org.opencontainers.image.title" >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

log "אזהרה: השירות לא הגיע למצב healthy תוך 60 שניות"
docker compose logs --tail 40 "$SERVICE"
exit 1
