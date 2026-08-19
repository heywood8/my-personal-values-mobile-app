import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  seedDefaultValues,
  retireRemovedValues,
  alignCatalogueOrder,
  getAllValues,
  setValueArchived as dbSetValueArchived,
} from '../services/ValuesDB';
import { appEvents, EVENTS } from '../services/eventEmitter';

const ValuesContext = createContext({
  values: [],
  activeValues: [],
  isLoading: true,
  error: null,
  reload: async () => {},
});

export const ValuesProvider = ({ children }) => {
  const [values, setValues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      // Seeding is idempotent and additive, so running it on every load is what
      // makes a release that ships new catalogue entries pick them up without a
      // migration — and without touching anything the user has already rated.
      await seedDefaultValues();
      // The other half of that: a release that *drops* entries would otherwise
      // leave both decks in play, because seeding never removes anything.
      await retireRemovedValues();
      // And a release that *reorders* them would otherwise change nothing here,
      // because seeding numbers only the rows it inserts.
      await alignCatalogueOrder();
      setValues(await getAllValues());
      setError(null);
    } catch (e) {
      console.error('[Values] Failed to load the catalogue:', e);
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const unsubReset = appEvents.on(EVENTS.DATABASE_RESET, reload);
    const unsubChanged = appEvents.on(EVENTS.VALUES_CHANGED, reload);
    return () => {
      unsubReset();
      unsubChanged();
    };
  }, [reload]);

  const activeValues = useMemo(() => values.filter((v) => !v.archived), [values]);

  const setValueArchived = useCallback(async (id, archived) => {
    await dbSetValueArchived(id, archived);
    await reload();
  }, [reload]);

  const value = useMemo(() => ({
    values,
    activeValues,
    isLoading,
    error,
    reload,
    setValueArchived,
  }), [values, activeValues, isLoading, error, reload, setValueArchived]);

  return (
    <ValuesContext.Provider value={value}>
      {children}
    </ValuesContext.Provider>
  );
};

ValuesProvider.propTypes = {
  children: PropTypes.node,
};

export const useValues = () => useContext(ValuesContext);
