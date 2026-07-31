import { HashRouter, Routes, Route } from 'react-router-dom';
import ProfileSelection from './views/ProfileSelection';
import Authentication from './views/Authentication';
import { useState, useEffect } from 'react';
import { ShieldAlert, Trash2, ShieldCheck, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import logo from './assets/logo.png';

function App() {
  const [orphanedProfiles, setOrphanedProfiles] = useState([]);
  const [resolvingIndex, setResolvingIndex] = useState(0);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(-1);

  useEffect(() => {
    const checkOrphaned = async () => {
      if (window.api && window.api.checkOrphanedProfiles) {
        const orphaned = await window.api.checkOrphanedProfiles();
        if (orphaned.length > 0) {
          setOrphanedProfiles(orphaned);
        }
      }
    };
    checkOrphaned();

    let unsubscribe;
    if (window.api && window.api.onProgressUpdate) {
      unsubscribe = window.api.onProgressUpdate((data) => {
        if (data.type === 'encrypt') {
          setProgressPercent(data.percent);
        }
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleResolve = async (action) => {
    const current = orphanedProfiles[resolvingIndex];
    if (action === 'recover' && !password) {
      setErrorMsg('Password is required to recover the profile.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');
    setProgressPercent(action === 'recover' ? 0 : -1);

    try {
      const result = await window.api.resolveOrphanedProfile(current.profileId, current.path, action, password);
      
      if (result.success) {
        setPassword('');
        setProgressPercent(-1);
        if (resolvingIndex + 1 < orphanedProfiles.length) {
          setResolvingIndex(resolvingIndex + 1);
        } else {
          setOrphanedProfiles([]); // All resolved
          // Reload page to refresh profile list
          window.location.reload();
        }
      } else {
        setErrorMsg(result.error || 'Failed to resolve profile. Password might be incorrect.');
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasOrphaned = orphanedProfiles.length > 0 && resolvingIndex < orphanedProfiles.length;
  const currentOrphan = hasOrphaned ? orphanedProfiles[resolvingIndex] : null;

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col">
        <header className="bg-slate-800 p-4 shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="VaultBrowser Logo" className="w-8 h-8 object-contain" />
            <h1 className="text-xl font-bold text-blue-400 tracking-wide">VaultBrowser</h1>
          </div>
          <div className="text-sm text-slate-400">Encrypted Environment</div>
        </header>
        
        <main className="flex-1 overflow-auto p-6 flex justify-center items-center">
          <Routes>
            <Route path="/" element={<ProfileSelection />} />
            <Route path="/auth/:profileId" element={<Authentication />} />
          </Routes>
        </main>
      </div>

      {hasOrphaned && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-xl border border-red-500/50 w-full max-w-lg shadow-2xl relative">
            <div className="flex items-center gap-4 mb-6 text-red-400 border-b border-slate-700 pb-4">
              <ShieldAlert className="w-10 h-10 shrink-0" />
              <div>
                <h3 className="text-xl font-bold text-white">Improper Shutdown Detected</h3>
                <p className="text-sm">Found unencrypted data for: <span className="font-bold text-white">{currentOrphan.profileId}</span></p>
              </div>
            </div>
            
            <p className="text-slate-300 mb-6 text-sm leading-relaxed">
              It looks like your computer shut down unexpectedly while the <span className="font-bold text-white">"{currentOrphan.profileId}"</span> vault was unlocked. 
              The unencrypted temporary files are still on your system. 
              <br/><br/>
              Would you like to securely delete these leftover files (you will lose the browsing session), or recover and re-encrypt them into your vault?
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-200 leading-tight">{errorMsg}</p>
              </div>
            )}

            <div className="bg-slate-900 p-4 rounded-lg border border-slate-700 mb-6">
              <label className="block text-sm text-slate-300 mb-2 font-semibold">To Recover, enter Vault Password:</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Vault Password"
                  disabled={isProcessing}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {isProcessing && progressPercent >= 0 && (
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-400 mb-1 font-semibold">
                  <span>Recovering...</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button 
                onClick={() => handleResolve('delete')}
                disabled={isProcessing}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isProcessing && progressPercent < 0 ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Securely Delete
              </button>
              <button 
                onClick={() => handleResolve('recover')}
                disabled={isProcessing || !password}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isProcessing && progressPercent >= 0 ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Recovering... {progressPercent}%
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Recover & Encrypt
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </HashRouter>
  );
}

export default App;
