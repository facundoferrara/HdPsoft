import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin'
import Display from './pages/Display'
import Stats from './pages/Stats'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/display" element={<Display />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="*" element={<Navigate to="/display" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
