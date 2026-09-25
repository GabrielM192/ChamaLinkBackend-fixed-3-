import { LogOut, Settings, FileSpreadsheet } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useMyGroups } from '../hooks/useMyGroups';
import { GroupSwitcher } from '../components/GroupSwitcher';

// Stage 1: this went from a single placeholder page (just MkobaUpload)
// to a real layout shell with two destinations - the member's own
// financial profile (the default) and M-Koba import (a leader's tool,
// kept separate rather than crowding the profile view). More
// destinations (Reports Engine, Loan Portfolio) will join this same
// nav as later stages land - see the project roadmap.
const NAV_LINK_CLASSES =
  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors';

// NOTE: the backend's Reports Engine endpoints only require group
// membership, not a leadership role (ChamaLink is "transparent to
// every member" by design - see the login screen's tagline). This nav
// link is a UI-level convenience aimed at the screen's primary
// audience, not real access control - a Member who navigates to
// /ripoti directly still sees it, same as the backend allows.
const LEADER_ROLES = new Set(['Chairperson', 'Treasurer']);

export function DashboardPage() {
  const { user, logout } = useAuth();
  const { groups } = useMyGroups();
  const isLeader = groups.some((g) => LEADER_ROLES.has(g.role));

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink-900 text-ink-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold tracking-tight text-gold-500">ChamaLink</span>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${NAV_LINK_CLASSES} ${
                  isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-100/70 hover:text-ink-50'
                }`
              }
            >
              Wasifu Wangu
            </NavLink>
            <NavLink
              to="/mkoba"
              className={({ isActive }) =>
                `${NAV_LINK_CLASSES} ${
                  isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-100/70 hover:text-ink-50'
                }`
              }
            >
              M-Koba
            </NavLink>
            {isLeader && (
              <NavLink
                to="/hazina"
                className={({ isActive }) =>
                  `${NAV_LINK_CLASSES} ${
                    isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-100/70 hover:text-ink-50'
                  }`
                }
              >
                <span className="inline-flex items-center gap-1">
                  <FileSpreadsheet size={14} />
                  Hazina
                </span>
              </NavLink>
            )}
            {isLeader && (
              <NavLink
                to="/ripoti"
                className={({ isActive }) =>
                  `${NAV_LINK_CLASSES} ${
                    isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-100/70 hover:text-ink-50'
                  }`
                }
              >
                Ripoti
              </NavLink>
            )}
            {isLeader && (
              <NavLink
                to="/mipangilio"
                className={({ isActive }) =>
                  `${NAV_LINK_CLASSES} ${
                    isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-100/70 hover:text-ink-50'
                  }`
                }
              >
                <span className="inline-flex items-center gap-1">
                  <Settings size={14} />
                  Mipangilio
                </span>
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-sm">
          <GroupSwitcher />
          <span className="hidden text-ink-100/80 sm:inline">{user?.fullName}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-ink-100/80 hover:text-ink-50 transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Toka</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
