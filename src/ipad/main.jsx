import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ipad.css'
import IpadBoardApp from './IpadBoardApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <IpadBoardApp />
  </StrictMode>,
)
