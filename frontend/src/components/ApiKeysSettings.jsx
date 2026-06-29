import { useState, useEffect, useCallback } from 'react';
import { KeyRound, X, Plus, Copy, Check, Trash2, ShieldAlert, Loader2, Eye, EyeOff } from 'lucide-react';
import { listApiKeys, createApiKey, revokeApiKey } from '../services/api';
import ConfirmModal from './ConfirmModal';

// Human-friendly labels for the named models a key can be scoped to.
const MODEL_LABELS = {
  'ap_analysis': { label: 'ap_analysis', desc: 'AP process analysis (text / audio / video / docx)' },
  'ap_pdd-sdd': { label: 'ap_pdd-sdd', desc: 'PDD / SDD document generation (incl. BPMN + diagrams)' },
  'ap_bpmn': { label: 'ap_bpmn', desc: 'BPMN 2.0 diagram generation' },
};
const ALL_MODELS = ['ap_analysis', 'ap_pdd-sdd', 'ap_bpmn'];

export default function ApiKeysSettings({ isOpen, onClose, onOpenDocs }) {
  const [keys, setKeys] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Create-form state
  const [name, setName] = useState('');
  const [selectedModels, setSelectedModels] = useState([...ALL_MODELS]);
  const [creating, setCreating] = useState(false);

  // Newly-created secret (shown exactly once)
  const [newSecret, setNewSecret] = useState(null);
  const [copied, setCopied] = useState(false);

  // Eye reveal and individual copy state
  const [showSecretMap, setShowSecretMap] = useState({});
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  // Revoke modal state
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const toggleShowSecret = (keyId) => {
    setShowSecretMap((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const handleCopyKey = async (keyId, textToCopy) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch {
      /* clipboard fallback */
    }
  };

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listApiKeys();
      setKeys(res.keys || []);
      setUsage(res.usage || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadKeys();
      setNewSecret(null);
      setCopied(false);
      setName('');
      setSelectedModels([...ALL_MODELS]);
      setError(null);
      setRevokeTarget(null);
    }
  }, [isOpen, loadKeys]);

  const toggleModel = (model) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await createApiKey(name.trim() || 'Untitled key', selectedModels);
      setNewSecret(res.secret);
      setName('');
      setSelectedModels([...ALL_MODELS]);
      await loadKeys();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; user can copy manually */
    }
  };

  const openRevokeModal = (keyItem) => {
    setRevokeTarget(keyItem);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await revokeApiKey(revokeTarget.id);
      setRevokeTarget(null);
      await loadKeys();
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRevoking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-xl h-full bg-slate-900 border-l border-white/10 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 h-16 bg-slate-900/95 backdrop-blur border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <KeyRound size={18} className="text-indigo-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">API Keys</h2>
              <p className="text-[11px] text-slate-500">Programmatic access to AlphaFold models</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-8">
          {/* Rate limit banner */}
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-0.5">Daily Request Limit</h4>
              <p className="text-xs text-slate-300">Each user can send or hit the API up to <strong>7 requests per day</strong>.</p>
            </div>
            {usage && (
              <div className="text-right shrink-0">
                <span className="text-lg font-bold text-white">{usage.used_today}</span>
                <span className="text-xs text-slate-400"> / {usage.limit_per_day} used</span>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Newly created secret (shown once) */}
          {newSecret && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-start gap-2 mb-3">
                <ShieldAlert size={18} className="text-emerald-300 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-200">
                  Copy your secret now \u2014 this is the <strong>only</strong> time it will be shown.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-emerald-300 text-xs break-all font-mono">
                  {newSecret}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold transition-colors"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}

          {/* Create form */}
          <form onSubmit={handleCreate} className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Create a new key</h3>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Key name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Zapier integration"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Allowed models</label>
              <div className="space-y-2">
                {ALL_MODELS.map((model) => (
                  <label
                    key={model}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/60 border border-white/5 cursor-pointer hover:border-white/15 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model)}
                      onChange={() => toggleModel(model)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div>
                      <div className="text-sm font-mono text-indigo-300">{MODEL_LABELS[model].label}</div>
                      <div className="text-xs text-slate-500">{MODEL_LABELS[model].desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {creating ? 'Creating...' : 'Create key'}
            </button>
          </form>

          {/* Existing keys */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Your keys</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 size={15} className="animate-spin" /> Loading...
              </div>
            ) : keys.length === 0 ? (
              <p className="text-sm text-slate-500">No API keys yet. Create one above to get started.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className={`p-4 rounded-xl border ${k.active ? 'bg-slate-800/40 border-white/10' : 'bg-slate-800/20 border-white/5 opacity-60'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">{k.name}</span>
                          {!k.active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">REVOKED</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <code className="text-xs text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded-lg border border-white/10 break-all select-all">
                            {showSecretMap[k.id] ? (k.secret || k.display) : k.display}
                          </code>
                          {k.active && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleShowSecret(k.id)}
                                title={showSecretMap[k.id] ? "Hide full secret" : "Reveal full secret"}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                              >
                                {showSecretMap[k.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyKey(k.id, k.secret || k.display)}
                                title="Copy key to clipboard"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors flex items-center gap-1"
                              >
                                {copiedKeyId === k.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(k.allowed_models || []).map((m) => (
                            <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-mono">{m}</span>
                          ))}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-2">
                          Created {k.created_at ? new Date(k.created_at).toLocaleDateString() : '\u2014'}
                          {k.last_used_at ? ` \u00b7 Last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' \u00b7 Never used'}
                        </div>
                      </div>
                      {k.active && (
                        <button
                          onClick={() => openRevokeModal(k)}
                          title="Revoke key"
                          className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Usage hint */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-white/5">
            <h4 className="text-xs font-semibold text-slate-300 mb-2">Using your key</h4>
            {onOpenDocs && (
              <button onClick={onOpenDocs} className="mb-3 text-xs font-semibold text-indigo-300 hover:text-indigo-200 underline">View full API documentation →</button>
            )}
            <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap break-all">{`curl -X POST <your-host>/v1/run \\
  -H "Authorization: Bearer ap_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model":"ap_analysis","input":{"text":"Our AP process..."}}'`}</pre>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        title="Revoke API Key?"
        message={`Are you sure you want to revoke "${revokeTarget?.name || 'this API key'}"? Any applications or integrations using this key will stop working immediately.`}
        confirmText="Yes, Revoke Key"
        cancelText="Cancel"
        variant="danger"
        isLoading={isRevoking}
      />
    </div>
  );
}
