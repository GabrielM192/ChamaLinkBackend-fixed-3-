import type { LucideIcon } from 'lucide-react';

// Lightweight tab navigation — no external dependency. The pill style
// matches the NavLink pattern used in DashboardPage's sidebar so the
// Reports page feels like the same app, not a different UI bolted on.
// On mobile the tabs wrap naturally (flex-wrap), which is fine for 6
// short labels.
export interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b border-ink-100 pb-3">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-ink-800 text-ink-50'
                : 'text-ink-600 hover:text-ink-950 hover:bg-ink-50'
            }`}
          >
            <Icon size={15} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
