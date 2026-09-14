import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// הגופנים נארזים עם האפליקציה ולא נטענים מ-Google Fonts: אפליקציה שמבטיחה
// שהנתונים לא יוצאים מהשרת לא צריכה לדווח לצד שלישי על כל כניסה
import '@fontsource/assistant/400.css'
import '@fontsource/assistant/500.css'
import '@fontsource/assistant/600.css'
import '@fontsource/assistant/700.css'
import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/600.css'
import './styles.css'
import { registerServiceWorker, syncThemeColor } from './lib/pwa'
import { applyLang, getLang } from './lib/i18n'

// לפני הרינדור הראשון: מסך ההזדהות מוצג עוד לפני שהאפליקציה נטענת,
// והוא צריך את הכיווניות הנכונה כבר אז
applyLang(getLang())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

registerServiceWorker()
syncThemeColor()
