import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { downloadAndInstallApk } from '../services/AppUpdateService';

/**
 * One APK download, for the whole app.
 *
 * The download outlives the surface that started it. It can begin in the update
 * prompt on the deck and finish while the user is reading their results, and
 * tens of megabytes must not restart because a panel closed — so the progress
 * lives above every screen and both the prompt and the settings panel report the
 * same one.
 *
 * `phase` names the two stages after the transfer that have no byte count of
 * their own: 'verifying' (hashing the file against the release checksum) and
 * 'backing_up' (writing the pre-update CSV snapshot). Progress is reset to 0 on
 * entering 'verifying' so a bar does not sit full while work is still going on.
 */
const UpdateDownloadContext = createContext(null);

export function UpdateDownloadProvider({ children }) {
  const [progress, setProgress] = useState(null);
  const [phase, setPhase] = useState(null);
  // A ref rather than the state above: two taps in the same tick would both see
  // `progress === null` and start the same download twice.
  const runningRef = useRef(false);

  const startDownload = useCallback(async (downloadUrl, { checksumUrl = null, onError } = {}) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase('downloading');
    setProgress(0);

    try {
      await downloadAndInstallApk(downloadUrl, setProgress, {
        checksumUrl,
        onPhaseChange: (next) => {
          setPhase(next);
          if (next === 'verifying') setProgress(0);
        },
      });
    } catch (error) {
      onError?.(error);
    } finally {
      runningRef.current = false;
      setProgress(null);
      setPhase(null);
    }
  }, []);

  const value = useMemo(() => ({
    progress,
    phase,
    isDownloading: phase !== null,
    startDownload,
  }), [progress, phase, startDownload]);

  return (
    <UpdateDownloadContext.Provider value={value}>
      {children}
    </UpdateDownloadContext.Provider>
  );
}

UpdateDownloadProvider.propTypes = {
  children: PropTypes.node,
};

export const useUpdateDownload = () => {
  const context = useContext(UpdateDownloadContext);
  if (!context) {
    throw new Error('useUpdateDownload must be used inside an UpdateDownloadProvider');
  }
  return context;
};
