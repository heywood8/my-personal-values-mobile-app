import { useCallback, useState } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import { useDialog } from '../contexts/DialogContext';
import { useAssessment } from '../contexts/AssessmentContext';
import { useAlignment } from '../contexts/AlignmentContext';
import { buildSharePayload, encodeShareCode } from '../services/ResultsShare';
import { buildShareUrl, shareLink } from '../utils/linkSharing';
import { valueName } from '../utils/valueNames';

/**
 * "Share this with a friend", wired to the screen that offers it.
 *
 * The link is built from what the results screen is showing — the latest
 * completed calibration — and handed to whatever this platform sends things
 * with. Four outcomes come back and three of them need something said: a share
 * sheet has already spoken for itself, a copy has to be announced or it looks
 * like nothing happened, and a browser that would allow neither has to be told
 * where the link is instead.
 *
 * The wheel goes only when it is asked for, at the moment of sharing, and the
 * answer is not remembered anywhere: `includeAlignment` is an argument rather
 * than state precisely so that "how far I am from living this" cannot end up in
 * a link because of a switch left on weeks ago. `latestCheckin` is the one that
 * travels — the most recent day that carries answers — since a comparison of two
 * wheels is a comparison of where each person is now.
 *
 * The link is also kept, and the screen shows it. That is not a fallback: the
 * whole ranking is *inside* that string, and an app whose first promise is that
 * nothing leaves the device should show exactly what is about to leave it.
 */
export function useResultsShare() {
  const { t } = useLocalization();
  const { showDialog } = useDialog();
  const { latest, results } = useAssessment();
  const { latestCheckin } = useAlignment();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);

  const shareResults = useCallback(async ({ includeAlignment = false } = {}) => {
    if (!latest || results.length === 0) {
      showDialog(t('share_empty_title'), t('share_empty_body'), [{ text: t('ok') }]);
      return null;
    }

    setBusy(true);
    try {
      const payload = buildSharePayload(
        latest,
        results,
        (value) => valueName(value, t),
        includeAlignment ? latestCheckin : null,
      );
      const url = buildShareUrl(encodeShareCode(payload));
      setLink(url);

      const outcome = await shareLink(url, { subject: t('share_subject') });

      if (outcome === 'copied') {
        showDialog(t('share_copied_title'), t('share_copied_body'), [{ text: t('ok') }]);
      } else if (outcome === 'unavailable') {
        showDialog(t('share_manual_title'), t('share_manual_body'), [{ text: t('ok') }]);
      }

      return url;
    } catch (e) {
      console.error('[Share] Could not share the results:', e);
      showDialog(t('error'), String(e?.message || e), [{ text: t('ok') }]);
      return null;
    } finally {
      setBusy(false);
    }
  }, [latest, results, latestCheckin, showDialog, t]);

  return { busy, link, shareResults };
}

export default useResultsShare;
