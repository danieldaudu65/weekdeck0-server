import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { MotionConfig } from 'motion/react';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './components/Toast';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { WelcomePage } from './pages/WelcomePage';
import { SetupPage } from './pages/SetupPage';
import { WeekPage } from './pages/WeekPage';
import { SlidesPage } from './pages/SlidesPage';
import { PrintPage } from './pages/PrintPage';
import { TeamPage } from './pages/TeamPage';
import { PresentPage } from './pages/PresentPage';
import { PreviewPage } from './pages/PreviewPage';
import { takeAfterLogin } from './lib/afterLogin';
import { RegionPage } from './pages/RegionPage';
import { RegionPresentPage } from './pages/RegionPresentPage';
import { AccountsApp } from './pages/accounts/AccountsApp';

/** Signed-in only. A team without members goes to setup first. */
function RequireTeam() {
  const { team, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Opening WeekDeck…" />;
  if (!team) return <Navigate to="/welcome" replace />;
  if (!team.members.length && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { team, loading } = useAuth();
  if (loading) return <Spinner label="Opening WeekDeck…" />;
  // After logging in: where the manager chose to go (edit the week, or preview & present).
  return team ? <Navigate to={takeAfterLogin()} replace /> : <Outlet />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<PublicOnly />}>
                <Route path="/welcome" element={<WelcomePage />} />
              </Route>
              <Route element={<RequireTeam />}>
                <Route path="/setup" element={<SetupPage />} />
                <Route path="/print" element={<PrintPage />} />
                <Route path="/present" element={<PresentPage />} />
                <Route path="/preview" element={<PreviewPage />} />
                <Route element={<Shell />}>
                  <Route index element={<WeekPage />} />
                  <Route path="/slides" element={<SlidesPage />} />
                  <Route path="/team" element={<TeamPage />} />
                </Route>
              </Route>
              {/* Region heads have their own login, separate from teams. */}
              <Route path="/region" element={<RegionPage />} />
              <Route path="/region/present/:teamId" element={<RegionPresentPage />} />
              {/* Accountants have their own login too: one workbook per accountant and region. */}
              <Route path="/accounts/*" element={<AccountsApp />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
