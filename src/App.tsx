import { Route, Routes } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Bills from './pages/Bills'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import UsageHistory from './pages/UsageHistory'
import AdminBills from './pages/admin/AdminBills'
import AdminDashboard from './pages/admin/AdminDashboard'
import AlertsPanel from './pages/admin/AlertsPanel'
import MeterDetail from './pages/admin/MeterDetail'
import Meters from './pages/admin/Meters'
import Settings from './pages/admin/Settings'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/usage-history"
        element={
          <ProtectedRoute>
            <Layout>
              <UsageHistory />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bills"
        element={
          <ProtectedRoute>
            <Layout>
              <Bills />
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout>
              <AdminDashboard />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/meters"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout>
              <Meters />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/meters/:meterId"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout>
              <MeterDetail />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/alerts"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout>
              <AlertsPanel />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/bills"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout>
              <AdminBills />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout>
              <Settings />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
