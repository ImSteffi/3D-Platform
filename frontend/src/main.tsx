import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import './shared/styles/global.css'
import App from './app/App'
import { PLATFORM_NAME } from './shared/brand'
document.title = PLATFORM_NAME
createRoot(document.getElementById('root')!).render(
 <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
)
