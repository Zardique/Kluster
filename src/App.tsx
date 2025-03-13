import React from 'react'
import './App.css'
import Game from './components/Game'
import { MultiplayerProvider } from './context/MultiplayerContext'

function App() {
  return (
    <div className="app">
      <MultiplayerProvider>
        <Game />
      </MultiplayerProvider>
    </div>
  )
}

export default App
