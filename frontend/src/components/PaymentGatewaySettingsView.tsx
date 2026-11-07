import React, { useState, useEffect, useCallback } from 'react';
import {
  paymentGatewayApi,
  PaymentGatewayConfig,
  VerifyGatewayResult,
} from '../services/api';
import {
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Power,
  Key,
  Lock,
  Info,
  Building,
} from 'lucide-react';

export const PaymentGatewaySettingsView: React.FC = () => {
  const [config, setConfig] = useState<PaymentGatewayConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);

  // Notifications
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Form state
  const [keyId, setKeyId] = useState<string>('');
  const [keySecret, setKeySecret] = useState<string>('');
  const [merchantName, setMerchantName] = useState<string>('');
  const [webhookSecret, setWebhookSecret] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const fetchConfig = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setErrorBanner(null);
    }
    try {
      const data = await paymentGatewayApi.getConfig();
      setConfig(data);
      if (data) {
        setKeyId(data.keyId || '');
        setMerchantName(data.merchantName || '');
        // Do not pre-fill secret fields with secrets; leave blank to indicate keeping existing
        setKeySecret('');
        setWebhookSecret('');
      } else {
        setKeyId('');
        setKeySecret('');
        setMerchantName('');
        setWebhookSecret('');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to load payment gateway configuration';
      setErrorBanner(msg);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrorBanner(null);
    setSuccessBanner(null);

    // Validation
    const trimmedKeyId = keyId.trim();
    if (!trimmedKeyId) {
      setFormError('Key ID is required.');
      return;
    }

    if (trimmedKeyId.startsWith('rzp_live_')) {
      setFormError('Live Mode credentials are not permitted in this phase. Please provide Razorpay Test credentials starting with rzp_test_.');
      return;
    }

    if (!trimmedKeyId.startsWith('rzp_test_')) {
      setFormError('Key ID must start with "rzp_test_". Only Razorpay Test accounts are supported.');
      return;
    }

    if (!config?.hasKeySecret && !keySecret.trim()) {
      setFormError('Key Secret is required for initial configuration.');
      return;
    }

    setIsSaving(true);
    try {
      const updated = await paymentGatewayApi.configure({
        keyId: trimmedKeyId,
        keySecret: keySecret.trim() ? keySecret.trim() : undefined,
        merchantName: merchantName.trim() || undefined,
        webhookSecret: webhookSecret.trim() ? webhookSecret.trim() : undefined,
      });

      setConfig(updated);
      setKeySecret('');
      setWebhookSecret('');
      setSuccessBanner('Payment gateway credentials saved successfully. Please run "Test Connection" to verify integration with Razorpay.');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save gateway configuration';
      setFormError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsVerifying(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const result: VerifyGatewayResult = await paymentGatewayApi.verify();
      if (result.success) {
        setSuccessBanner(result.message || 'Connection verified successfully! Gateway is now ACTIVE.');
      } else {
        setErrorBanner(result.message || 'Connection test failed. Please verify your credentials.');
      }
      // Re-fetch configuration silently to preserve banner and update status/timestamps
      await fetchConfig(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Verification failed. Please check network and credentials.';
      setErrorBanner(msg);
      await fetchConfig(true);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    try {
      const res = await paymentGatewayApi.disconnect();
      setSuccessBanner(res.message || 'Payment gateway disabled successfully.');
      setShowDisconnectModal(false);
      await fetchConfig(true);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to disconnect payment gateway';
      setErrorBanner(msg);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Active & Verified
          </span>
        );
      case 'PENDING_VERIFICATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Pending Verification
          </span>
        );
      case 'DISABLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Power className="w-3.5 h-3.5 text-slate-500" />
            Disabled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Not Configured
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] p-8 space-y-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-medium text-slate-600">Loading payment gateway settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Payment Gateway Configuration</h2>
              <p className="text-sm text-slate-500">
                Configure your school's direct Razorpay merchant account for online fee collection.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full border border-purple-200">
              TEST Mode Only
            </span>
            {getStatusBadge(config?.status)}
          </div>
        </div>

        {/* Informational Architecture Callout */}
        <div className="mt-6 p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-blue-950">
            <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>Independent Merchant Settlement (RBI TSP Model)</span>
          </div>
          <p className="text-blue-800 leading-relaxed">
            All online fee payments flow directly into this school's independent Razorpay account and settle straight to your registered bank account.
            This SaaS application serves strictly as a Technical Service Provider (TSP) and never collects, holds, or pools school funds.
          </p>
        </div>
      </div>

      {/* Global Alerts */}
      {successBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Success</p>
            <p className="text-emerald-700">{successBanner}</p>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-500 hover:text-emerald-700 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-sm">
          <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Attention Required</p>
            <p className="text-rose-700">{errorBanner}</p>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-500 hover:text-rose-700 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Configuration Details & Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Status & Connection Summary */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-500" />
              Gateway Status
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Provider</span>
                <span className="font-medium text-slate-900">Razorpay</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Environment</span>
                <span className="font-semibold text-purple-700">TEST</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Merchant Name</span>
                <span className="font-medium text-slate-900 truncate max-w-[160px]" title={config?.merchantName || 'Default'}>
                  {config?.merchantName || '—'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Key ID</span>
                <span className="font-mono text-xs text-slate-800 truncate max-w-[150px]" title={config?.keyId || 'None'}>
                  {config?.keyId || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Key Secret</span>
                <span className="font-mono text-xs text-slate-600">
                  {config?.keySecretMasked || 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Webhook Secret</span>
                <span className="font-mono text-xs text-slate-600">
                  {config?.hasWebhookSecret ? (config.webhookSecretMasked || 'Configured') : 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Last Verified</span>
                <span className="text-xs text-slate-700">
                  {config?.lastVerifiedAt ? new Date(config.lastVerifiedAt).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            {/* Error callout if verification failed */}
            {config?.lastVerificationError && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1 text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Last Verification Note
                </p>
                <p className="text-amber-700">{config.lastVerificationError}</p>
              </div>
            )}

            {/* Connection Actions */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!config?.hasKeySecret || isVerifying || isSaving}
                className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition shadow-sm ${
                  !config?.hasKeySecret || isVerifying || isSaving
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
                {isVerifying ? 'Testing Connection...' : 'Test Connection'}
              </button>

              {config && config.status !== 'DISABLED' && (
                <button
                  type="button"
                  onClick={() => setShowDisconnectModal(true)}
                  disabled={isDisconnecting || isVerifying || isSaving}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition flex items-center justify-center gap-2"
                >
                  <Power className="w-3.5 h-3.5" />
                  Disable Gateway
                </button>
              )}
            </div>
          </div>

          {/* Quick Help Card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 text-xs text-slate-600 space-y-2.5">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Info className="w-4 h-4 text-indigo-500" />
              Where do I find my API Keys?
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
              <li>Log in to your <strong>Razorpay Dashboard</strong>.</li>
              <li>Toggle the switch in the header to <strong>Test Mode</strong>.</li>
              <li>Go to <strong>Settings</strong> → <strong>API Keys</strong>.</li>
              <li>Generate or copy your <strong>Key ID</strong> and <strong>Key Secret</strong>.</li>
            </ol>
            <p className="text-[11px] text-slate-500 pt-1">
              Note: Never share your Key Secret over email or unencrypted chat.
            </p>
          </div>
        </div>

        {/* Right Column: Credentials Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSave} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Configure Razorpay Credentials</h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter your Razorpay Test API keys. Sensitive secrets are encrypted using AES-256-GCM before storage.
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Merchant Display Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  School Merchant Display Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Building className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="e.g. Springfield Academy Fee Collection"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Optional friendly name to identify this merchant configuration.
                </p>
              </div>

              {/* Key ID */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Razorpay Key ID <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={keyId}
                    onChange={(e) => setKeyId(e.target.value)}
                    placeholder="rzp_test_..."
                    className="w-full pl-9 pr-3 py-2 font-mono text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Must begin with <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-700">rzp_test_</code>. Live keys (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-rose-700">rzp_live_</code>) are strictly prohibited.
                </p>
              </div>

              {/* Key Secret */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Razorpay Key Secret {!config?.hasKeySecret && <span className="text-rose-500">*</span>}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={keySecret}
                    onChange={(e) => setKeySecret(e.target.value)}
                    placeholder={
                      config?.hasKeySecret
                        ? 'Leave blank to retain current secret (••••••••)'
                        : 'Enter your Razorpay Key Secret'
                    }
                    className="w-full pl-9 pr-3 py-2 font-mono text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {config?.hasKeySecret
                    ? 'Leave blank if you do not want to modify your existing secret. Enter a new secret only to replace it.'
                    : 'Required for new configuration. Encrypted at rest using AES-256-GCM.'}
                </p>
              </div>

              {/* Webhook Secret */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Webhook Secret (Optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder={
                      config?.hasWebhookSecret
                        ? 'Leave blank to retain current webhook secret'
                        : 'Enter webhook signature secret if configured'
                    }
                    className="w-full pl-9 pr-3 py-2 font-mono text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Used in Phase G to verify Razorpay webhook signatures against HMAC SHA-256.
                </p>
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving Credentials...
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Disable Payment Gateway?</h3>
                <p className="text-xs text-slate-500">Confirm gateway deactivation</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Disabling the payment gateway will prevent parents and students from initiating online payments through Razorpay for this school. Existing records and encrypted credentials remain securely preserved.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition flex items-center gap-2"
              >
                {isDisconnecting ? 'Disabling...' : 'Confirm Disable'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
