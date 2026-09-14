import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Same chrome as MkobaUpload's card (border-ink-100, bg-paper-raised,
// rounded-xl) so Member Financial Profile and M-Koba feel like one
// app, not two different screens bolted together. `delay` staggers
// each card's entrance slightly after the last, so the page reads as
// cards "settling into place" rather than everything popping at once.
export function ProfileCard({
  title,
  icon: Icon,
  delay = 0,
  children,
}: {
  title: string;
  icon: LucideIcon;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
      className="border border-ink-100 rounded-xl bg-paper-raised p-6"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900 uppercase tracking-wide mb-4">
        <Icon size={16} className="text-ink-600" />
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

export function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <dt className="text-sm text-ink-700">{label}</dt>
      <dd className="font-medium text-ink-950">{children}</dd>
    </div>
  );
}
