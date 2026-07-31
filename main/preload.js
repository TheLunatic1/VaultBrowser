const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (name, password) => ipcRenderer.invoke('create-profile', name, password),
  importProfile: (name, password) => ipcRenderer.invoke('import-profile', name, password),
  launchProfile: (profileId, password) => ipcRenderer.invoke('launch-profile', profileId, password),
  deleteProfile: (name) => ipcRenderer.invoke('delete-profile', name),
  renameProfile: (oldName, newName) => ipcRenderer.invoke('rename-profile', oldName, newName),
  changePassword: (name, oldPassword, newPassword) => ipcRenderer.invoke('change-password', name, oldPassword, newPassword),
  getAvailableBrowsers: () => ipcRenderer.invoke('get-available-browsers'),
  getProfileSettings: (name) => ipcRenderer.invoke('get-profile-settings', name),
  saveProfileSettings: (name, settings) => ipcRenderer.invoke('save-profile-settings', name, settings),
  lockProfile: (name) => ipcRenderer.invoke('lock-profile', name),
  getActiveProfiles: () => ipcRenderer.invoke('get-active-profiles'),
  checkOrphanedProfiles: () => ipcRenderer.invoke('check-orphaned-profiles'),
  resolveOrphanedProfile: (profileId, folderPath, action, password) => ipcRenderer.invoke('resolve-orphaned-profile', profileId, folderPath, action, password),
  onProgressUpdate: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('progress-update', listener);
    return () => ipcRenderer.removeListener('progress-update', listener);
  }
});
