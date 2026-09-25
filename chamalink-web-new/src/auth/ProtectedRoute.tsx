import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { GroupProvider } from '../groups/GroupContext';

// Redirects to /login for any route nested under this one when there is
// no signed-in user - the token interceptor in api/client.ts handles the
// case where a token exists but the backend has since rejected it.
//
// GroupProvider wraps the outlet so the active-group state is shared by
// every protected screen (Dashboard, MemberProfile, M-Koba, Reports)
// rather than each page fetching and guessing its own. See
// groups/GroupContext.tsx for why that matters.
export function ProtectedRoute() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <GroupProvider>
      <Outlet />
    </GroupProvider>
  );
}
