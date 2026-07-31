import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, X, Eye, EyeOff, Edit2, Trash2, Loader2, AlertCircle } from 'lucide-react';

export default function ProfileSelection() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  
  // Modal states
  const [modalType, setModalType] = useState(null); // 'choose', 'create', 'import', 'delete', 'edit'
  const [inputName, setInputName] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [editTab, setEditTab] = useState('rename'); // 'rename', 'password', 'settings'
  const [availableBrowsers, setAvailableBrowsers] = useState([]);
  const [selectedBrowser, setSelectedBrowser] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [importProgress, setImportProgress] = useState(-1);
  const [launchProgress, setLaunchProgress] = useState({ id: null, percent: -1, type: '' });
  const [activeProfiles, setActiveProfiles] = useState([]);

  useEffect(() => {
    refreshProfiles();
    
    // Poll active profiles
    const pollInterval = setInterval(async () => {
      if (window.api && window.api.getActiveProfiles) {
        const active = await window.api.getActiveProfiles();
        setActiveProfiles(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(active)) return active;
          return prev;
        });
      }
    }, 1000);

    let unsubscribe;
    if (window.api && window.api.onProgressUpdate) {
      unsubscribe = window.api.onProgressUpdate((data) => {
        console.log('Received progress IPC in ProfileSelection:', data);
        if (data.type === 'import') {
          setImportProgress(data.percent);
        } else if (data.type === 'decrypt' || data.type === 'encrypt') {
          setLaunchProgress(prev => ({ ...prev, percent: data.percent, type: data.type }));
        }
      });
    }

    return () => {
      clearInterval(pollInterval);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const refreshProfiles = async () => {
    if (window.api) {
      const updated = await window.api.getProfiles();
      setProfiles(updated);
      
      if (window.api.getActiveProfiles) {
        const active = await window.api.getActiveProfiles();
        setActiveProfiles(active);
      }
    } else {
      setProfiles(['Personal', 'Work', 'Finance']);
    }
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    if (!window.api) return;

    setErrorMsg('');
    setIsProcessing(true);

    try {
      if (modalType === 'create') {
        if (!inputName || !inputPassword) return setIsProcessing(false);
        await window.api.createProfile(inputName, inputPassword);
        await refreshProfiles();
      } else if (modalType === 'import') {
        if (!inputName || !inputPassword) return setIsProcessing(false);
        
        setImportProgress(0);
        // Wait for user to select a folder from the OS dialog and for encryption to finish
        const result = await window.api.importProfile(inputName, inputPassword);
        setImportProgress(-1);
        
        if (result && result.canceled) {
          setIsProcessing(false);
          return; // Do nothing, keep the modal open
        }
        
        if (result && result.success) {
          await refreshProfiles();
        } else {
          setErrorMsg(result?.error || 'Import failed unexpectedly.');
          setIsProcessing(false);
          return; // Don't close modal, show error
        }
      } else if (modalType === 'delete') {
        await window.api.deleteProfile(selectedProfile);
        await refreshProfiles();
      } else if (modalType === 'edit') {
        if (editTab === 'rename') {
          if (!inputName) return setIsProcessing(false);
          const success = await window.api.renameProfile(selectedProfile, inputName);
          if (success) await refreshProfiles();
          else {
            setErrorMsg('Rename failed. Name might already exist.');
            setIsProcessing(false);
            return;
          }
        } else if (editTab === 'password') {
          if (!oldPassword || !inputPassword) return setIsProcessing(false);
          const success = await window.api.changePassword(selectedProfile, oldPassword, inputPassword);
          if (!success) {
            setErrorMsg('Failed to change password. Make sure the old password is correct.');
            setIsProcessing(false);
            return;
          }
        } else if (editTab === 'settings') {
          await window.api.saveProfileSettings(selectedProfile, { browserPath: selectedBrowser || null });
        }
      }
      
      closeModal();
    } catch (err) {
      setErrorMsg('An unexpected error occurred.');
      setIsProcessing(false);
    }
  };

  const closeModal = () => {
    setModalType(null);
    setInputName('');
    setInputPassword('');
    setOldPassword('');
    setShowPassword(false);
    setShowOldPassword(false);
    setSelectedProfile('');
    setEditTab('rename');
    setIsProcessing(false);
    setErrorMsg('');
  };

  const openDeleteModal = (e, profile) => {
    e.stopPropagation(); // prevent launching profile
    setSelectedProfile(profile);
    setModalType('delete');
  };

  const openEditModal = async (e, profile) => {
    e.stopPropagation(); // prevent launching profile
    setSelectedProfile(profile);
    setInputName(profile); // pre-fill for rename
    
    if (window.api) {
      const browsers = await window.api.getAvailableBrowsers();
      setAvailableBrowsers(browsers);
      const settings = await window.api.getProfileSettings(profile);
      setSelectedBrowser(settings.browserPath || '');
    }
    
    setModalType('edit');
  };

  return (
    <div className="w-full max-w-4xl relative">
      <h2 className="text-2xl font-bold mb-6 text-center">Select Vault Profile</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {profiles.map((profile) => {
          const isActive = activeProfiles.includes(profile);
          const isEncryptingThis = launchProgress.id === profile && launchProgress.type === 'encrypt';

          return (
          <div
            key={profile}
            onClick={() => !isActive && !isEncryptingThis && navigate(`/auth/${encodeURIComponent(profile)}`)}
            className={`flex flex-col items-center justify-start pt-12 pb-8 h-72 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-all shadow-lg hover:shadow-blue-900/20 group relative ${(!isActive && !isEncryptingThis) ? 'cursor-pointer' : ''}`}
          >
            {/* Quick Actions (Hover) */}
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button 
                onClick={(e) => openEditModal(e, profile)}
                className="p-2 bg-slate-700 hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg transition-colors"
                title="Edit Profile"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={(e) => openDeleteModal(e, profile)}
                className="p-2 bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white rounded-lg transition-colors"
                title="Delete Profile"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-900 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform relative">
              <Shield className={`w-12 h-12 ${isActive ? 'text-green-400' : 'text-blue-400'}`} />
              {isActive && (
                <div className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border-2 border-slate-800 shadow-sm">
                  🔓 Unlocked
                </div>
              )}
            </div>
            <span className="text-lg font-semibold mb-3">{profile}</span>

            {isEncryptingThis ? (
              <div className="flex flex-col w-full mt-3 px-2">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-semibold">
                  <span className="flex items-center uppercase tracking-wider"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Encrypting</span>
                  <span>{launchProgress.percent >= 0 ? `${launchProgress.percent}%` : '...'}</span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-1.5 border border-slate-700 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${launchProgress.percent >= 0 ? launchProgress.percent : 0}%` }}
                  ></div>
                </div>
              </div>
            ) : isActive ? (
              <div className="flex flex-col gap-2 w-full mt-2 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    await window.api.launchProfile(profile, ''); // Launch unlocked
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                >
                  Open Browser
                </button>
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    setLaunchProgress({ id: profile, percent: 0, type: 'encrypt' });
                    await window.api.lockProfile(profile);
                    setLaunchProgress({ id: null, percent: -1, type: '' });
                    refreshProfiles();
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-500 text-slate-200 text-sm font-semibold py-2 rounded-lg transition-colors"
                >
                  Lock Vault
                </button>
              </div>
            ) : null}
          </div>
          );
        })}

        <button
          onClick={() => setModalType('choose')}
          className="flex flex-col items-center justify-start pt-12 pb-8 h-72 bg-slate-800/50 hover:bg-slate-800 border border-dashed border-slate-500 hover:border-slate-400 rounded-xl transition-all group"
        >
          <div className="bg-slate-900/50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
            <Plus className="w-12 h-12 text-slate-400 group-hover:text-white" />
          </div>
          <span className="text-lg font-semibold text-slate-400 group-hover:text-white">Add Profile</span>
        </button>
      </div>

      <footer className="py-6 text-center text-xs text-slate-500 font-medium w-full">
        Made by <a href="https://github.com/TheLunatic1" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 transition-colors">TheLunatic1 (Salman Toha)</a>
        <span className="ml-2 text-slate-600 font-mono">v1.0.0</span>
      </footer>

      {/* Modals */}
      {modalType && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 w-full max-w-md shadow-2xl relative">
            <button onClick={closeModal} className="absolute top-6 right-6 text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>

            {modalType === 'choose' && (
              <>
                <h3 className="text-xl font-bold mb-6">Add a Profile</h3>
                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => setModalType('create')}
                    className="p-4 bg-slate-900 hover:bg-slate-700 border border-slate-600 rounded-lg text-left transition-colors"
                  >
                    <div className="font-semibold text-white mb-1">Create Empty Profile</div>
                    <div className="text-sm text-slate-400">Start with a completely fresh, encrypted browser environment.</div>
                  </button>
                  <button 
                    onClick={() => setModalType('import')}
                    className="p-4 bg-slate-900 hover:bg-slate-700 border border-slate-600 rounded-lg text-left transition-colors"
                  >
                    <div className="font-semibold text-white mb-1">Import Existing Profile</div>
                    <div className="text-sm text-slate-400">Encrypt and import an existing Google Chrome profile folder.</div>
                  </button>
                </div>
              </>
            )}

            {(modalType === 'create' || modalType === 'import') && (
              <>
                <h3 className="text-xl font-bold mb-6">
                  {modalType === 'create' ? 'Create New Profile' : 'Import Profile'}
                </h3>
                
                {errorMsg && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200 leading-tight">{errorMsg}</p>
                  </div>
                )}

                <form onSubmit={handleModalSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Profile Name</label>
                    <input 
                      type="text" 
                      required
                      value={inputName}
                      onChange={e => setInputName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Work, Banking"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Vault Password</label>
                    <div className="relative">
                      <input 
                        type={showPassword ? "text" : "password"} 
                        required
                        value={inputPassword}
                        onChange={e => setInputPassword(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter a strong password"
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
                  
                  {isProcessing && importProgress >= 0 && (
                    <div className="mb-2 mt-2">
                      <div className="flex justify-between text-xs text-slate-400 mb-1 font-semibold">
                        <span>Importing & Encrypting...</span>
                        <span>{importProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-900 rounded-full h-3 border border-slate-700 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                          style={{ width: `${importProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {modalType === 'import' && importProgress >= 0 
                          ? `Importing... ${importProgress}%` 
                          : 'Processing...'}
                      </>
                    ) : (
                      modalType === 'create' ? 'Create Vault' : 'Select Folder & Import'
                    )}
                  </button>
                </form>
              </>
            )}

            {modalType === 'delete' && (
              <>
                <h3 className="text-xl font-bold mb-4 text-red-500">Delete Profile</h3>
                
                {errorMsg && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200 leading-tight">{errorMsg}</p>
                  </div>
                )}

                <p className="text-slate-300 mb-6">
                  Are you sure you want to permanently delete the <span className="font-bold text-white">"{selectedProfile}"</span> profile? 
                  This will destroy the encrypted vault file. This action cannot be undone.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={closeModal}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleModalSubmit}
                    disabled={isProcessing}
                    className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-red-800 disabled:text-red-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete Profile'
                    )}
                  </button>
                </div>
              </>
            )}

            {modalType === 'edit' && (
              <>
                <h3 className="text-xl font-bold mb-4">Edit "{selectedProfile}"</h3>
                
                {errorMsg && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200 leading-tight">{errorMsg}</p>
                  </div>
                )}

                <div className="flex gap-2 mb-6 border-b border-slate-700 pb-2">
                  <button 
                    onClick={() => setEditTab('rename')}
                    className={`pb-2 px-2 text-sm font-semibold transition-colors ${editTab === 'rename' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    Rename
                  </button>
                  <button 
                    onClick={() => setEditTab('password')}
                    type="button"
                    className={`pb-2 px-2 text-sm font-semibold transition-colors ${editTab === 'password' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    Change Password
                  </button>
                  <button 
                    onClick={() => setEditTab('settings')}
                    type="button"
                    className={`pb-2 px-2 text-sm font-semibold transition-colors ${editTab === 'settings' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
                  >
                    Browser Settings
                  </button>
                </div>

                <form onSubmit={handleModalSubmit} className="flex flex-col gap-4">
                  {editTab === 'rename' && (
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">New Profile Name</label>
                      <input 
                        type="text" 
                        required
                        value={inputName}
                        onChange={e => setInputName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="New Name"
                        autoFocus
                      />
                    </div>
                  )}

                  {editTab === 'password' && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-300 mb-1">Current Password</label>
                        <div className="relative">
                          <input 
                            type={showOldPassword ? "text" : "password"} 
                            required
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Current Password"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowOldPassword(!showOldPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          >
                            {showOldPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm text-slate-300 mb-1">New Password</label>
                        <div className="relative">
                          <input 
                            type={showPassword ? "text" : "password"} 
                            required
                            value={inputPassword}
                            onChange={e => setInputPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="New Password"
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
                    </>
                  )}

                  {editTab === 'settings' && (
                    <div>
                      <label className="block text-sm text-slate-300 mb-2">Preferred Browser</label>
                      <select
                        value={selectedBrowser}
                        onChange={(e) => setSelectedBrowser(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Default (Auto-detect)</option>
                        {availableBrowsers.map((b, i) => (
                          <option key={i} value={b.path}>{b.name}</option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-400 mt-2">
                        Select which browser this profile should open in. If set to Default, the app will try to use the first available supported browser.
                      </p>
                    </div>
                  )}
                  
                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </form>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
