import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      navigate(redirectTo, { replace: true });
    } catch {
      setError('Barua pepe au neno la siri si sahihi.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel - the ledger. Ruled horizontal lines echo a physical
          contribution register; this is the one deliberate visual idea
          the whole login screen is built around. */}
      <div className="relative lg:w-[44%] bg-ink-900 text-ink-50 px-8 py-12 lg:px-14 lg:py-16 flex flex-col justify-between overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 47px, currentColor 47px, currentColor 48px)',
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <span className="font-semibold text-lg tracking-tight text-gold-500">ChamaLink</span>
        </div>
        <div className="relative max-w-sm">
          <p className="text-2xl lg:text-[28px] leading-snug font-medium text-ink-50">
            Usimamizi wa fedha za kikundi, wazi kwa kila mwanachama.
          </p>
          <p className="mt-4 text-sm text-ink-100/80 leading-relaxed">
            Michango, faini, mikopo na matukio ya ustawi — yote kwenye kumbukumbu moja
            ambayo Mwenyekiti, Mtunza Hazina na wanachama wanaweza kuiona.
          </p>
        </div>
        <div className="relative text-xs text-ink-100/50">© {new Date().getFullYear()} ChamaLink</div>
      </div>

      {/* Right panel - the form */}
      <div className="flex-1 flex items-center justify-center bg-paper px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          <h1 className="text-2xl font-semibold text-ink-950 mb-1">Karibu tena</h1>
          <p className="text-sm text-ink-700 mb-8">Ingia kuona hali ya kikundi chako.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-900 mb-1.5">
                Barua pepe
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-ink-100 bg-paper-raised px-3.5 py-2.5 text-ink-950 placeholder:text-ink-500/60 focus:outline-none focus:ring-2 focus:ring-ink-700 focus:border-transparent"
                placeholder="wewe@mfano.co.tz"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-900 mb-1.5">
                Neno la siri
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-ink-100 bg-paper-raised px-3.5 py-2.5 text-ink-950 placeholder:text-ink-500/60 focus:outline-none focus:ring-2 focus:ring-ink-700 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-standing-overdue bg-standing-overdue-bg rounded-lg px-3.5 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-ink-900 text-ink-50 font-medium py-2.5 hover:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink-700 disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? 'Inaingia...' : 'Ingia'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
