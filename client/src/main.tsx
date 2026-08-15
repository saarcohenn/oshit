import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
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
