<script>
  import PageHeader from '../components/ui/PageHeader.svelte';
  import { locale } from '../i18n';
  import { applyUser, user } from '../stores/auth';
  import { changePassword, updateProfile } from '../services/auth';
  import { notifySuccess } from '../stores/toasts';

  /**
   * The signed-in user's own account: who they are in this workspace, the name
   * their work is signed with, and the password that gets them in.
   *
   * Everything here acts on the session's account — the API reads the user from
   * the cookie and never from the body — so the page has no id to get wrong and
   * no way to edit somebody else's record.
   */

  $: username = $user?.username || '';

  let nameForm = { firstName: $user?.firstName || '', lastName: $user?.lastName || '' };
  let nameErrors = {};
  let savingName = false;

  let passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  let passwordErrors = {};
  let savingPassword = false;

  /* The API answers a rejected field with `{ errors: { field: [message] } }`,
     the same shape the other forms in this app read. One message per field is
     enough to say what is wrong, so the first one is the one shown. */
  function fieldErrors(error) {
    const fields = error?.data?.errors || {};
    const messages = {};
    for (const [field, value] of Object.entries(fields)) {
      messages[field] = Array.isArray(value) ? value[0] : String(value);
    }
    return messages;
  }

  async function saveName() {
    const errors = {};
    if (!nameForm.firstName.trim()) errors.firstName = $locale.account.firstNameRequired;
    if (!nameForm.lastName.trim()) errors.lastName = $locale.account.lastNameRequired;
    nameErrors = errors;
    if (Object.keys(errors).length) return;

    savingName = true;
    try {
      const response = await updateProfile({
        firstName: nameForm.firstName.trim(),
        lastName: nameForm.lastName.trim(),
      });
      applyUser(response.user);
      nameErrors = {};
      notifySuccess($locale.account.saved);
    } catch (error) {
      if (error.status === 401) {
        nameErrors = { form: $locale.account.sessionExpired };
      } else {
        const fields = fieldErrors(error);
        nameErrors = Object.keys(fields).length ? fields : { form: error.message || $locale.account.saveError };
      }
    } finally {
      savingName = false;
    }
  }

  async function savePassword() {
    const errors = {};
    if (!passwordForm.currentPassword) errors.currentPassword = $locale.account.currentPasswordRequired;
    if (passwordForm.newPassword.length < 8) errors.newPassword = $locale.account.passwordTooShort;
    else if (passwordForm.newPassword === passwordForm.currentPassword) errors.newPassword = $locale.account.passwordUnchanged;
    if (passwordForm.confirmPassword !== passwordForm.newPassword) errors.confirmPassword = $locale.account.passwordMismatch;
    passwordErrors = errors;
    if (Object.keys(errors).length) return;

    savingPassword = true;
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
      passwordErrors = {};
      notifySuccess($locale.account.passwordSaved);
    } catch (error) {
      if (error.status === 401 && error.data?.errors?.currentPassword) {
        passwordErrors = { currentPassword: error.data.errors.currentPassword[0] };
      } else if (error.status === 401) {
        passwordErrors = { form: $locale.account.sessionExpired };
      } else {
        const fields = fieldErrors(error);
        passwordErrors = Object.keys(fields).length ? fields : { form: error.message || $locale.account.passwordSaveError };
      }
    } finally {
      savingPassword = false;
    }
  }
</script>

<svelte:head><title>{$locale.account.title} | {$locale.common.apartmentPro}</title></svelte:head>

<div class="settings-page">
  <PageHeader icon="bi-person-vcard" title={$locale.account.title} description={$locale.account.description} />

  <!-- The name their work is signed with ------------------------------------- -->
  <section class="section-card">
    <header class="section-heading">
      <span class="section-icon" aria-hidden="true"><i class="bi bi-person-badge"></i></span>
      <div>
        <h2>{$locale.account.personalDetails}</h2>
        <p>{$locale.account.personalDetailsHint}</p>
      </div>
    </header>

    <form class="field-grid personal-details-grid" on:submit|preventDefault={saveName}>
      <div class="field">
        <label class="field-label" for="profile-first-name">{$locale.account.firstName}</label>
        <div class="field-control">
          <i class="bi bi-person" aria-hidden="true"></i>
          <input
            id="profile-first-name"
            class="form-control"
            autocomplete="given-name"
            bind:value={nameForm.firstName}
          />
        </div>
        {#if nameErrors.firstName}<p class="field-error" role="alert">{nameErrors.firstName}</p>{/if}
      </div>

      <div class="field">
        <label class="field-label" for="profile-last-name">{$locale.account.lastName}</label>
        <div class="field-control">
          <i class="bi bi-person" aria-hidden="true"></i>
          <input
            id="profile-last-name"
            class="form-control"
            autocomplete="family-name"
            bind:value={nameForm.lastName}
          />
        </div>
        {#if nameErrors.lastName}<p class="field-error" role="alert">{nameErrors.lastName}</p>{/if}
      </div>

      <div class="field username-field">
        <label class="field-label" for="profile-username">{$locale.account.username}</label>
        <div class="field-control">
          <i class="bi bi-at" aria-hidden="true"></i>
          <input id="profile-username" class="form-control" value={username} dir="auto" disabled />
        </div>
        <p class="field-hint">{$locale.account.usernameHint}</p>
      </div>

      {#if nameErrors.form}<p class="form-alert field-wide" role="alert">{nameErrors.form}</p>{/if}

      <div class="form-actions field-wide">
        <button class="btn btn-primary" type="submit" disabled={savingName}>
          <i class="bi bi-check2" aria-hidden="true"></i>
          {savingName ? $locale.account.saving : $locale.account.save}
        </button>
      </div>
    </form>
  </section>

  <!-- The password that gets them in ------------------------------------------ -->
  <section class="section-card">
    <header class="section-heading">
      <span class="section-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></span>
      <div>
        <h2>{$locale.account.passwordTitle}</h2>
        <p>{$locale.account.passwordHint}</p>
      </div>
    </header>

    <form class="field-grid" on:submit|preventDefault={savePassword}>
      <div class="field field-wide">
        <label class="field-label" for="profile-current-password">{$locale.account.currentPassword}</label>
        <div class="field-control">
          <i class="bi bi-key" aria-hidden="true"></i>
          <input
            id="profile-current-password"
            class="form-control"
            type="password"
            autocomplete="current-password"
            bind:value={passwordForm.currentPassword}
          />
        </div>
        {#if passwordErrors.currentPassword}<p class="field-error" role="alert">{passwordErrors.currentPassword}</p>{/if}
      </div>

      <div class="field">
        <label class="field-label" for="profile-new-password">{$locale.account.newPassword}</label>
        <div class="field-control">
          <i class="bi bi-lock" aria-hidden="true"></i>
          <input
            id="profile-new-password"
            class="form-control"
            type="password"
            autocomplete="new-password"
            bind:value={passwordForm.newPassword}
          />
        </div>
        {#if passwordErrors.newPassword}<p class="field-error" role="alert">{passwordErrors.newPassword}</p>{/if}
      </div>

      <div class="field">
        <label class="field-label" for="profile-confirm-password">{$locale.account.confirmPassword}</label>
        <div class="field-control">
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
          <input
            id="profile-confirm-password"
            class="form-control"
            type="password"
            autocomplete="new-password"
            bind:value={passwordForm.confirmPassword}
          />
        </div>
        {#if passwordErrors.confirmPassword}<p class="field-error" role="alert">{passwordErrors.confirmPassword}</p>{/if}
      </div>

      {#if passwordErrors.form}<p class="form-alert field-wide" role="alert">{passwordErrors.form}</p>{/if}

      <div class="form-actions field-wide">
        <button class="btn btn-primary" type="submit" disabled={savingPassword}>
          <i class="bi bi-shield-check" aria-hidden="true"></i>
          {savingPassword ? $locale.account.updatingPassword : $locale.account.updatePassword}
        </button>
      </div>
    </form>
  </section>
</div>

<style>
  @media (min-width: 768px) {
    .personal-details-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 767.98px) {
    .personal-details-grid { grid-template-columns: minmax(0, 1fr); }
  }
  #profile-username:disabled {
    background-color: var(--field-fill);
    border-color: var(--border);
    color: var(--text-body);
    -webkit-text-fill-color: var(--text-body);
    opacity: 1;
  }
  .username-field .field-control > i { color: var(--text-secondary); }

  .settings-page {
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    max-width: 60rem;
  }

  .section-card {
    padding: var(--space-5);
    border: 1px solid var(--card-border);
    border-radius: var(--card-radius);
    background: var(--surface);
    box-shadow: var(--card-shadow);
  }

  .section-card + .section-card { margin-block-start: var(--space-4); }

  .section-heading {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    margin-block-end: var(--space-4);
    padding-block-end: var(--space-3);
    border-block-end: 1px solid var(--border);
  }

  .section-heading h2 { margin: 0; color: var(--text-strong); font-size: var(--text-base); font-weight: var(--weight-heavy); }
  .section-heading p { margin: 4px 0 0; color: var(--text-muted); font-size: var(--text-sm); }

  .section-icon {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    border-radius: var(--radius-md);
    color: var(--accent-text);
    background: var(--accent-soft);
    font-size: 1rem;
  }

  /* --- Forms -------------------------------------------------------------- */

  .field-error { margin: 4px 0 0; color: var(--danger); font-size: var(--text-xs); font-weight: var(--weight-semibold); }

  /* A whole-form failure sits on its own line inside the grid rather than
     under one field, because it belongs to no single field. */
  .form-alert {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--danger-border);
    border-radius: var(--radius-md);
    background: var(--danger-soft);
    color: var(--danger);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .form-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }

  @media (max-width: 575.98px) {
    .section-card { padding: var(--space-4); }
    .form-actions { justify-content: stretch; }
    .form-actions .btn { width: 100%; }
  }
</style>
