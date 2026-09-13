#!/usr/bin/env bash
#
# גיבוי יומי של מסד הנתונים.
#
# העתקה של oshit.db לבדו אינה גיבוי: המסד עובד ב-WAL, והכתיבות האחרונות
# יושבות בקובץ נפרד לצידו. ראינו את זה בפועל — קובץ WAL של 4.2MB מול מסד
# של 200KB, שלושה ימים קדימה. לכן הגיבוי נעשה דרך ה-API של SQLite עצמו,
# שיודע לתפוס עותק עקבי בזמן שהאפליקציה כותבת.
#
# אין sqlite3 על המארח ולא בקונטיינר, אבל better-sqlite3 חשוף ל-node
# שכבר רץ שם, ו-db.backup() הוא בדיוק אותו מנגנון.
#
# העותק נכתב אל תוך ה-volume, נבדק שם, ומיד נמשך אל המארח — כדי שמחיקה
# של ה-volume או של הקונטיינר לא תיקח איתה גם את הגיבויים.
#
# הערה: המארח וה-volume יושבים על אותו דיסק פיזי. זה מגן מפני טעות שלנו,
# מפני הגירה שהשתבשה ומפני מחיקת קונטיינר — לא מפני כשל דיסק.

set -euo pipefail

CONTAINER="${CONTAINER:-oshit}"
DEST="${DEST:-$HOME/backups/oshit}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F_%H%M)"
TMP="/app/data/.backup-${STAMP}.db"
OUT="${DEST}/oshit-${STAMP}.db"

mkdir -p "$DEST"

# עותק עקבי בזמן ריצה, ומיד אחריו ספירה מתוך העותק עצמו.
# גיבוי שאי אפשר לפתוח אינו גיבוי, ועדיף שהריצה תיפול כאן מאשר שנגלה את זה
# ביום שנצטרך לשחזר.
COUNT="$(docker exec "$CONTAINER" node -e "
const Database = require('better-sqlite3')
const live = new Database('/app/data/oshit.db', { readonly: true })
live.backup('${TMP}')
  .then(() => {
    live.close()
    const copy = new Database('${TMP}', { readonly: true })
    const n = copy.prepare('SELECT COUNT(*) AS n FROM transactions').get().n
    const u = copy.prepare('SELECT COUNT(*) AS n FROM users').get().n
    copy.pragma('integrity_check')
    copy.close()
    process.stdout.write(n + ' עסקאות, ' + u + ' משתמשים')
  })
  .catch((err) => { console.error(err); process.exit(1) })
")"

docker cp "${CONTAINER}:${TMP}" "$OUT"
docker exec "$CONTAINER" rm -f "$TMP"
gzip -f "$OUT"

# חלון מתגלגל. הגיבוי הוא מפני טעות, לא ארכיון היסטורי
find "$DEST" -name 'oshit-*.db.gz' -mtime "+${KEEP_DAYS}" -delete

echo "$(date '+%F %H:%M:%S')  ${OUT}.gz — ${COUNT}"
