import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MemberProfilePage } from './pages/MemberProfilePage';
import { MkobaPage } from './pages/MkobaPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TreasuryPage } from './pages/TreasuryPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardPage />}>
              <Route index element={<MemberProfilePage />} />
              <Route path="mkoba" element={<MkobaPage />} />
              <Route path="hazina" element={<TreasuryPage />} />
              <Route path="ripoti" element={<ReportsPage />} />
              <Route path="mipangilio" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
