import { Platform, Share } from 'react-native';

/**
 * Getting a text file out of, and back into, an app that has no server.
 *
 * The web is the only target with a real file dialog, and it is also the target
 * where "save" means an actual download — so that path is written directly
 * against the DOM rather than through a native module the browser build would
 * have to shim. On a phone there is no file dialog without pulling in a native
 * picker, so saving hands the text to the share sheet (mail it, drop it in
 * Files, send it to yourself) and loading is done by pasting. The UI asks these
 * predicates what it is allowed to offer rather than branching on Platform
 * itself.
 */

const hasDom = () => Platform.OS === 'web' && typeof document !== 'undefined';

/** Whether a real file dialog is available for reading a file in. */
export const canPickFile = () => hasDom();

/** Whether saving lands as a download rather than in the share sheet. */
export const canDownloadFile = () => hasDom();

/**
 * Save `text` as `filename`, however this platform can.
 * @returns {Promise<'downloaded'|'shared'|'cancelled'>}
 */
export async function saveTextFile(filename, text, { mimeType = 'text/csv' } = {}) {
  if (hasDom()) {
    // A BOM, because the most likely destination is Excel, which reads a
    // UTF-8 file without one as the local 8-bit codepage and turns every
    // Russian value name into mojibake.
    const blob = new Blob([`\uFEFF${text}`], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on the next tick rather than immediately: Safari resolves the
    // object URL after the click handler returns, and freeing it first saves
    // an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return 'downloaded';
  }

  const result = await Share.share({ message: text, title: filename });
  return result?.action === Share.dismissedAction ? 'cancelled' : 'shared';
}

/**
 * Open a file dialog and read the chosen file as text.
 * @returns {Promise<{name: string, text: string}|null>} null if the dialog was dismissed.
 */
export function pickTextFile({ accept = '.csv,text/csv,text/plain' } = {}) {
  if (!hasDom()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    const cleanUp = () => input.remove();

    input.addEventListener('cancel', () => {
      cleanUp();
      resolve(null);
    });

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanUp();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanUp();
        resolve({ name: file.name, text: String(reader.result ?? '') });
      };
      reader.onerror = () => {
        cleanUp();
        reject(reader.error || new Error('Could not read the file'));
      };
      reader.readAsText(file);
    });

    document.body.appendChild(input);
    input.click();
  });
}
