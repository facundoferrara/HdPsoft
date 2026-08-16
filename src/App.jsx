import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin'
import Display from './pages/Display'
import Stats from './pages/Stats'
import Corte from './pages/Corte'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin"   element={<Admin />} />
        <Route path="/display" element={<Display />} />
        <Route path="/stats"   element={<Stats />} />
        <Route path="/corte"   element={<Corte />} />
        <Route path="*"        element={<Navigate to="/display" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
