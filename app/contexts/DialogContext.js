import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Dialog, Portal, Button, Text } from 'react-native-paper';
import { useLocalization } from './LocalizationContext';
import { useThemeColors } from './ThemeColorsContext';

/**
 * Confirmation dialogs, rendered rather than delegated to the OS.
 *
 * React Native's `Alert` is a no-op on web — the call returns and nothing is
 * shown, so a "delete?" confirmation silently never appears and the destructive
 * action's confirm callback never fires. Since web is a first-class target here,
 * every confirmation goes through this Paper-backed dialog, which behaves the
 * same on all three platforms.
 */
const DialogContext = createContext({
  showDialog: () => {},
  hideDialog: () => {},
});

export const DialogProvider = ({ children }) => {
  const { t } = useLocalization();
  const { colors } = useThemeColors();
  const [dialog, setDialog] = useState(null);

  const hideDialog = useCallback(() => setDialog(null), []);

  /**
   * @param {string} title
   * @param {string} message
   * @param {Array<{text: string, onPress?: Function, style?: 'default'|'cancel'|'destructive'}>} actions
   */
  const showDialog = useCallback((title, message, actions) => {
    setDialog({
      title,
      message,
      actions: actions?.length ? actions : [{ text: t('ok') }],
    });
  }, [t]);

  const value = useMemo(() => ({ showDialog, hideDialog }), [showDialog, hideDialog]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Portal>
        <Dialog visible={!!dialog} onDismiss={hideDialog} testID="app-dialog">
          {!!dialog?.title && <Dialog.Title>{dialog.title}</Dialog.Title>}
          {!!dialog?.message && (
            <Dialog.Content>
              <Text variant="bodyMedium">{dialog.message}</Text>
            </Dialog.Content>
          )}
          <Dialog.Actions>
            {dialog?.actions?.map((action, index) => (
              <Button
                key={`${action.text}-${index}`}
                testID={`dialog-action-${index}`}
                onPress={() => {
                  // Close first: an action that navigates or unmounts the caller
                  // would otherwise leave the dialog orphaned on screen.
                  hideDialog();
                  action.onPress?.();
                }}
                textColor={action.style === 'destructive' ? colors.destructive : undefined}
              >
                {action.text}
              </Button>
            ))}
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </DialogContext.Provider>
  );
};

DialogProvider.propTypes = {
  children: PropTypes.node,
};

export const useDialog = () => useContext(DialogContext);
