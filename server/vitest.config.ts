import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

/*
 * db.ts פותח את המסד כבר בייבוא. בלי תיקייה זמנית, הרצת הבדיקות הייתה
 * כותבת לתוך ./data של סביבת הפיתוח — ומוחקת שם ריצות סוכנים אמיתיות.
 */
export default defineConfig({
  test: {
    env: { DATA_DIR: mkdtempSync(join(tmpdir(), 'oshit-test-')) },
    // כל הקבצים חולקים את אותו מסד זמני, וכל אחד מנקה טבלאות אחרי בדיקה —
    // במקביל, קובץ אחד היה מוחק נתונים שקובץ אחר באמצע לבדוק
    fileParallelism: false,
  },
})
