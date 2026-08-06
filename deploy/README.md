# פריסה להומלאב

הכתובת הסופית: **http://<SERVER_IP>:8082**

## מודל הפריסה — משיכה, לא דחיפה

```
  push ל-main
       │
       ▼
  GitHub Actions ──build──► ghcr.io/saarcohenn/oshit:latest
                                      │
                        (ההומלאב מושך בעצמו, כל 5 דקות)
                                      ▼
                        <SERVER_IP>  cron ──► docker compose up -d oshit
```

**ל-GitHub אין שום גישה לרשת הביתית.** אין מפתח SSH בסודות המאגר, אין פורט פתוח
החוצה, ואין runner בבית. הפעולה היחידה ש-GitHub מבצע היא דחיפת תמונה ל-registry
ציבורי; ההומלאב הוא זה שיוזם את החיבור החוצה ומושך אותה.

זה חשוב במיוחד בפרויקט קוד פתוח: גם בתרחיש הגרוע שבו מישהו הצליח להשחית את
התמונה, מה שהוא מקבל הוא קונטיינר — לא shell על השרת ולא דריסת רגל ברשת הביתית.
פריסה מבוססת SSH מ-GitHub הייתה נותנת בדיוק את זה.

## התקנה ראשונה

1. הוסיפו את השירות מ-`homelab-compose.snippet.yml` לתוך ה-`services` של
   `docker-compose.yml` בשרת.

2. צרו את תיקיית הנתונים לפני ההרצה:

```bash
mkdir -p ./oshit/data
```

3. הרימו:

```bash
docker compose up -d oshit
```

4. התקינו את סקריפט העדכון:

```bash
sudo install -m 755 oshit-update.sh /usr/local/bin/oshit-update
```

והוסיפו ל-crontab (`crontab -e`), עם הנתיב לתיקייה שבה יושב ה-compose:

```bash
*/5 * * * * STACK_DIR=/path/to/stack /usr/local/bin/oshit-update >> /var/log/oshit-update.log 2>&1
```

5. ודאו שהכול עלה:

```bash
curl -s http://<SERVER_IP>:8082/api/health
```

התשובה הצפויה: `{"ok":true,"version":1}`

## שהתמונה תהיה ציבורית

חבילות ב-GHCR נוצרות כפרטיות. אחרי ה-build הראשון:

**GitHub → Your profile → Packages → oshit → Package settings → Change visibility → Public**

בלי זה ההומלאב יקבל `denied` בניסיון המשיכה, ותצטרכו `docker login ghcr.io` עם
Personal Access Token בעל הרשאת `read:packages`.

## מה מגן על השרת

הדרישה "שאף אחד לא יוכל לדחוף למאגר ובעקבות זה לעדכן לי את השרת" מתפרקת לשלוש
שכבות, ורק אחת מהן היא קוד:

### 1. בקוד — כבר מוגדר

- `release.yml` רץ **רק** על `push` ל-`main`. אין בו `pull_request` ואין
  `pull_request_target`. האחרון הוא החור הקלאסי: הוא מריץ קוד מ-fork עם ההרשאות
  והסודות של המאגר הראשי, כלומר כל זר היה יכול לדחוף תמונה בשם שלכם.
- `if: github.repository_owner == 'saarcohenn'` — אם מישהו יעשה fork, ה-workflow
  לא ידחוף לחבילה שלכם.
- `ci.yml` הוא זה שרץ על PR, והוא בונה בלבד: `permissions: contents: read`,
  בלי סודות, בלי `push`.
- `CODEOWNERS` מחייב את האישור שלכם על כל קובץ.

### 2. בהגדרות GitHub — צריך להגדיר ידנית פעם אחת

**Settings → Branches → Add branch ruleset** על `main`:

- ✅ Require a pull request before merging
- ✅ Require review from Code Owners
- ✅ Dismiss stale approvals when new commits are pushed
- ✅ Require status checks to pass → בחרו את `check` מתוך CI
- ✅ Block force pushes
- ✅ Restrict deletions
- ❌ אל תסמנו "Allow specified actors to bypass" אלא אם באמת צריך

**Settings → Actions → General:**

- Fork pull request workflows: **Require approval for all external contributors**
  (כך workflow לא רץ בכלל על PR מזר עד שתאשרו)
- Workflow permissions: **Read repository contents and packages permissions**

בלי ה-ruleset הזה, `git push` ישיר ל-`main` יעקוף את כל ה-PR ויגיע לשרת. זו
ההגדרה הכי חשובה כאן, והיא לא ניתנת להגדרה מתוך הקוד.

### 3. בהומלאב

- העדכון הוא cron על המארח ולא קונטיינר עם `docker.sock`. כלי עדכון אוטומטי
  מצמיד את ה-socket, וזו ההרשאה הגבוהה ביותר בכל השרשרת — מי ששולט בו שולט
  בכל הקונטיינרים בשרת. הסקריפט לעומת זאת נוגע בשירות אחד בלבד.
- הסקריפט לא מפיל את מה שרץ אם המשיכה נכשלה, ומאמת `healthy` אחרי העדכון.

> **למה לא Watchtower:** נבדק מול Docker 29 והוא לא עובד —
> `client version 1.25 is too old. Minimum supported API version is 1.40`.
> הפרויקט הרשמי (containrrr) אינו מתוחזק, ומצב `--run-once` שלו קורס ב-segfault.
> יש fork מתוחזק (`nickfedor/watchtower`) אם מעדיפים כלי מוכן על פני cron.

## החזרה לגרסה קודמת

כל build מתייג גם ב-SHA מלא, ולכן אפשר להצמיד גרסה ספציפית:

```bash
docker compose down oshit
```

שנו זמנית ב-compose ל-`image: ghcr.io/saarcohenn/oshit:sha-<המזהה>` והרימו מחדש.
כל עוד התג אינו `latest`, ה-cron לא יחזיר אתכם קדימה.

## גיבוי

כל הנתונים יושבים בקובץ SQLite אחד:

```bash
tar czf oshit-backup-$(date +%F).tar.gz ./oshit/data
```

אפשר גם לייצא משק בית בודד כ-JSON מתוך האפליקציה, או דרך
`GET /api/households/<id>/export`.
