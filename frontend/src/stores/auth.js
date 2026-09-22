import { get, writable } from 'svelte/store';
import { getCurrentUser, logout as logoutRequest } from '../services/auth';
import { resetCurrencies } from './currency';

export const user = writable(null);
export const authLoading = writable(false);
export const authReady = writable(false);

let sessionPromise = null;
let logoutPromise = null;
let sessionVersion = 0;

export function loadSession(force = false) {
  if (sessionPromise) return sessionPromise;
  if (!force && get(authReady)) return Promise.resolve(get(user));

  const version = sessionVersion;
  authLoading.set(true);
  sessionPromise = (async () => {
    try {
      const response = await getCurrentUser();
      // A response from before logout/reset must never restore that session.
      if (version !== sessionVersion) return null;
      user.set(response.user || null);
      authReady.set(true);
      return response.user || null;
    } catch (error) {
      if (version !== sessionVersion) return null;
      user.set(null);
      authReady.set(error.status === 401);
      if (error.status !== 401) throw error;
      return null;
    } finally {
      if (version === sessionVersion) {
        authLoading.set(false);
        sessionPromise = null;
      }
    }
  })();

  return sessionPromise;
}

export function resetAuth() {
  sessionVersion += 1;
  sessionPromise = null;
  user.set(null);
  authReady.set(false);
  authLoading.set(false);
  // Currency rates are organization data, so they never survive a sign-out.
  resetCurrencies();
}

export function signOut() {
  if (logoutPromise) return logoutPromise;
  logoutPromise = (async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // An expired cookie is already signed out; other failures remain retryable.
      if (error.status !== 401) throw error;
    }
    resetAuth();
    authReady.set(true);
  })().finally(() => {
    logoutPromise = null;
  });
  return logoutPromise;
}
