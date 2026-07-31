import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react';

export default function Authentication() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [decryptProgress, setDecryptProgress] = useState(-1);

  useEffect(() => {
    let unsubscribe;
    if (window.api && window.api.onProgressUpdate) {
      unsubscribe = window.api.onProgressUpdate((data) => {
        if (data.type === 'decrypt') {
          setDecryptProgress(data.percent);
        }
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!password) {
      setError('Password is required');
      return;
    }

    setIsLaunching(true);

    try {
      if (window.api) {
        const success = await window.api.launchProfile(profileId, password);
        if (!success) {
          setError('Decryption failed. Incorrect password or corrupted vault.');
        } else {
          // Keep it spinning while Chrome is running?
          // Actually, we can return to profile selection when browser closes.
          navigate('/');
        }
      } else {
        // Mock delay
        await new Promise(r => setTimeout(r, 1000));
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during launch');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
      <button 
        onClick={() => navigate('/')}
        className="flex items-center text-sm text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Profiles
      </button>

      <div className="flex flex-col items-center mb-8">
        <div className="bg-blue-500/10 p-4 rounded-full mb-4">
          <Lock className="w-10 h-10 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold">Unlock {profileId}</h2>
        <p className="text-slate-400 text-sm mt-2 text-center">
          Enter your password to decrypt the vault and launch the browser.
        </p>
      </div>

      <form onSubmit={handleUnlock} className="space-y-4">
        <div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Vault Password"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              disabled={isLaunching}
              autoFocus
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20">
            {error}
          </div>
        )}

        {isLaunching && decryptProgress >= 0 && (
          <div className="mb-4 mt-2">
            <div className="flex justify-between text-xs text-slate-400 mb-1 font-semibold">
              <span>Decrypting Vault...</span>
              <span>{decryptProgress}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                style={{ width: `${decryptProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isLaunching}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg px-4 py-3 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLaunching ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {decryptProgress >= 0 ? `Decrypting... ${decryptProgress}%` : 'Launching...'}
            </>
          ) : (
            'Unlock Vault'
          )}
        </button>
      </form>
    </div>
  );
}
