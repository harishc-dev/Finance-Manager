const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vaultAPI', {
  exists:            ()          => ipcRenderer.invoke('vault:exists'),
  open:              (password)  => ipcRenderer.invoke('vault:open', password),
  create:            (password)  => ipcRenderer.invoke('vault:create', password),
  save:              (pw, vault) => ipcRenderer.invoke('vault:save', { password: pw, vault }),
  pickFiles:         ()          => ipcRenderer.invoke('file:pick'),
  readBytes:         (filePath)  => ipcRenderer.invoke('file:readBytes', filePath),
  analyzeFile:       (payload)   => ipcRenderer.invoke('file:analyze', payload),
  analyzeWithAI:     (payload)   => ipcRenderer.invoke('ai:analyze', payload),
  saveEncryptedFile:   (payload)   => ipcRenderer.invoke('file:saveEncrypted', payload),
  openEncryptedFile:   (payload)   => ipcRenderer.invoke('file:openEncrypted', payload),
  deleteEncryptedFile: (payload)   => ipcRenderer.invoke('file:deleteEncrypted', payload),
  purgeExpiredFiles:   (payload)   => ipcRenderer.invoke('file:purgeExpired', payload),
  backup:              (password)  => ipcRenderer.invoke('app:backup', { password }),
  exportBackup:        (password)  => ipcRenderer.invoke('app:backup', { password }),
  importBackup:        (password)  => ipcRenderer.invoke('app:import', { password }),
  restoreVaultFile:    (payload)   => ipcRenderer.invoke('app:restore', payload),
});

contextBridge.exposeInMainWorld('marketAPI', {
  search:      (query, market) => ipcRenderer.invoke('market:search',      { query, market }),
  quote:       (symbol)        => ipcRenderer.invoke('market:quote',       { symbol }),
  mfSearch:    (query)         => ipcRenderer.invoke('market:mfSearch',    { query }),
  mfNav:       (schemeCode)    => ipcRenderer.invoke('market:mfNav',       { schemeCode }),
  batchQuotes: (items)         => ipcRenderer.invoke('market:batchQuotes', { items }),
  getRates:    ()              => ipcRenderer.invoke('market:getRates'),
});
