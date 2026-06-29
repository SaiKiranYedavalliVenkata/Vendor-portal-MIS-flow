import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './LoginPage'
import OtpPage from './OtpPage'
import Dashboard from './Dashboard'
import AgentLogin from './AgentLogin'
import AgentOtp from './AgentOtp'
import AgentDashboard from './AgentDashboard'
import AdminLogin from './AdminLogin'
import AdminOtp from './AdminOtp'
import AdminDashboard from './AdminDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/otp" element={<OtpPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/agent" element={<AgentLogin />} />
        <Route path="/agent/otp" element={<AgentOtp />} />
        <Route path="/agent/dashboard" element={<AgentDashboard />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/otp" element={<AdminOtp />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}