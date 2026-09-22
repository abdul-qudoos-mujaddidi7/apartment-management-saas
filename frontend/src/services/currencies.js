import { api } from './api';

/** The organization's currency catalogue, including each currency's rate history. */
export const listCurrencies = async (options = {}) => {
  const query = new URLSearchParams();
  if (options.search) query.set('search', options.search);
  if (options.includeInactive) query.set('includeInactive', 'true');

  const response = await api.get(`/currencies${query.toString() ? `?${query.toString()}` : ''}`);
  return { baseCurrency: response.baseCurrency, items: response.items || [] };
};

/**
 * Every currency code the service knows, with the name and symbol to fill in.
 * `refresh` asks the server to re-read its upstream list instead of its cache.
 */
export const listCatalogue = async ({ search, refresh } = {}) => {
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (refresh) query.set('refresh', 'true');

  const response = await api.get(`/currencies/catalogue${query.toString() ? `?${query.toString()}` : ''}`);
  return {
    items: response.items || [],
    source: response.source || 'bundled',
    total: response.total || (response.items || []).length,
  };
};

export const createCurrency = async (data) => {
  const response = await api.post('/currencies', data);
  return response.currency;
};

export const updateCurrency = async (id, data) => {
  const response = await api.patch(`/currencies/${id}`, data);
  return response.currency;
};

export const addExchangeRate = async (id, data) => {
  const response = await api.post(`/currencies/${id}/rates`, data);
  return response.currency;
};

export const deleteCurrency = (id) => api.delete(`/currencies/${id}`);

/** Make one of the catalogue's currencies the organization's reporting currency. */
export const setBaseCurrency = async (code) => {
  const response = await api.post('/currencies/base', { code });
  return response.baseCurrency;
};

/** The rate in force for a currency on a date, as the server would price it. */
export const getRate = async (currency, date) => {
  const query = new URLSearchParams();
  if (currency) query.set('currency', currency);
  if (date) query.set('date', date);
  const response = await api.get(`/currencies/rate?${query.toString()}`);
  return response;
};

/**
 * Convert an amount between two of the organization's currencies.
 * The server applies the same rule it will use when the document is posted, so
 * a preview here and the saved amount always agree.
 */
export const convertAmount = async ({ amount, from, to, date }) => {
  const query = new URLSearchParams({ amount: String(amount) });
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (date) query.set('date', date);
  const response = await api.get(`/currencies/convert?${query.toString()}`);
  return response;
};
