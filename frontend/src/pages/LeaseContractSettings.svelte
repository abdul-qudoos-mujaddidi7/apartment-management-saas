<script>
  
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';

  import PageHeader from '../components/ui/PageHeader.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import ImageUpload from '../components/ui/ImageUpload.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import EmptyState from '../components/ui/EmptyState.svelte';
  import { locale } from '../i18n';
  import { notifySuccess } from '../stores/toasts';
  import {
    createContractClause,
    deleteContractClause,
    getContractSettings,
    reorderContractClauses,
    updateContractClause,
    updateContractSettings,
  } from '../services/leaseContracts';

  const LANGUAGES = ['en', 'fa', 'ps'];
  const BODY_LIMIT = 8000;

  const blankForm = () => ({
    officeName: '',
    officeAddress: '',
    officePhone: '',
    officeEmail: '',
    licenseNumber: '',
    logoUrl: null,
    defaultLanguage: 'fa',
    titleEn: '',
    titleFa: '',
    titlePs: '',
    lessorName: '',
    lessorPhone: '',
    lessorNationalId: '',
    lessorAddress: '',
    lessorPhotoUrl: null,
    contractNumberPrefix: '',
    footerText: '',
    lessorSignatureLabel: '',
    tenantSignatureLabel: '',
    witnessSignatureLabel: '',
    showTenantPhoto: true,
    showLessorPhoto: false,
  });

  const blankClause = () => ({
    titleEn: '', titleFa: '', titlePs: '',
    bodyEn: '', bodyFa: '', bodyPs: '',
    isEnabled: true,
  });

  let loading = true;
  let saving = false;
  let errorMessage = '';
  let formErrors = {};
  let form = blankForm();

  let clauses = [];
  let placeholders = [];
  let clauseError = '';
  let busyClauseId = '';

  let clauseOpen = false;
  let clauseEditing = null;
  let clauseForm = blankClause();
  let clauseFormErrors = {};
  let clauseSaving = false;

  let placeholdersOpen = false;

  onMount(load);

  async function load() {
    loading = true;
    errorMessage = '';
    try {
      const response = await getContractSettings();
      const settings = response.settings || {};
      form = {
        ...blankForm(),
        ...Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value ?? ''])),
        // Booleans survive as booleans; everything else is a text field.
        showTenantPhoto: Boolean(settings.showTenantPhoto),
        showLessorPhoto: Boolean(settings.showLessorPhoto),
        logoUrl: settings.logoUrl || null,
        lessorPhotoUrl: settings.lessorPhotoUrl || null,
      };
      clauses = (response.clauses || []).map((clause) => ({ ...clause, isEnabled: Boolean(clause.isEnabled) }));
      placeholders = response.placeholders || [];
    } catch (error) {
      errorMessage = error?.message || $locale.leaseContract.loadError;
    } finally {
      loading = false;
    }
  }

  /** Field messages straight from the API's `{ field: [message] }` shape. */
  function serverFieldErrors(error) {
    const errors = error?.data?.errors;
    if (!errors || Array.isArray(errors)) return {};
    return Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, messages[0]]));
  }

  async function saveSettings() {
    saving = true;
    errorMessage = '';
    formErrors = {};
    try {
      const response = await updateContractSettings({
        ...form,
        // An emptied optional field clears the stored value; the API turns the
        // blank into NULL. The required titles are sent as typed.
        titleEn: form.titleEn.trim(),
        titleFa: form.titleFa.trim(),
        titlePs: form.titlePs.trim(),
        showTenantPhoto: form.showTenantPhoto,
        showLessorPhoto: form.showLessorPhoto,
      });
      notifySuccess($locale.leaseContract.saved);
      // Keep whatever the server normalized (trimmed values, cleared fields).
      const saved = response.settings || {};
      form = {
        ...form,
        ...Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, value ?? ''])),
        showTenantPhoto: Boolean(saved.showTenantPhoto),
        showLessorPhoto: Boolean(saved.showLessorPhoto),
        logoUrl: saved.logoUrl || null,
        lessorPhotoUrl: saved.lessorPhotoUrl || null,
      };
    } catch (error) {
      if (error.status === 401) return;
      formErrors = serverFieldErrors(error);
      errorMessage = error?.message || $locale.leaseContract.saveError;
    } finally {
      saving = false;
    }
  }

  function openNewClause() {
    clauseEditing = null;
    clauseForm = blankClause();
    clauseFormErrors = {};
    clauseError = '';
    clauseOpen = true;
  }

  function openEditClause(clause) {
    clauseEditing = clause;
    clauseForm = {
      titleEn: clause.titleEn || '',
      titleFa: clause.titleFa || '',
      titlePs: clause.titlePs || '',
      bodyEn: clause.bodyEn || '',
      bodyFa: clause.bodyFa || '',
      bodyPs: clause.bodyPs || '',
      isEnabled: Boolean(clause.isEnabled),
    };
    clauseFormErrors = {};
    clauseError = '';
    clauseOpen = true;
  }

  function closeClause() {
    if (clauseSaving) return;
    clauseOpen = false;
    clauseEditing = null;
    clauseError = '';
    clauseFormErrors = {};
  }

  async function saveClause() {
    clauseSaving = true;
    clauseError = '';
    clauseFormErrors = {};

    const payload = {
      titleEn: clauseForm.titleEn.trim(),
      titleFa: clauseForm.titleFa.trim(),
      titlePs: clauseForm.titlePs.trim(),
      bodyEn: clauseForm.bodyEn.trim(),
      bodyFa: clauseForm.bodyFa.trim(),
      bodyPs: clauseForm.bodyPs.trim(),
      isEnabled: clauseForm.isEnabled,
    };

    try {
      const response = clauseEditing
        ? await updateContractClause(clauseEditing.id, payload)
        : await createContractClause(payload);

      notifySuccess($locale.leaseContract.clauseSaved);
      closeClause();

      if (clauseEditing) {
        clauses = clauses.map((clause) => (clause.id === response.clause.id ? response.clause : clause));
      } else {
        clauses = [...clauses, response.clause];
      }
    } catch (error) {
      if (error.status === 401) return;
      clauseFormErrors = serverFieldErrors(error);
      clauseError = error?.message || $locale.leaseContract.clauseSaveError;
    } finally {
      clauseSaving = false;
    }
  }

  async function toggleClause(clause) {
    busyClauseId = clause.id;
    clauseError = '';
    try {
      const response = await updateContractClause(clause.id, { isEnabled: !clause.isEnabled });
      clauses = clauses.map((entry) => (entry.id === response.clause.id ? response.clause : entry));
    } catch (error) {
      if (error.status !== 401) clauseError = error?.message || $locale.leaseContract.clauseSaveError;
    } finally {
      busyClauseId = '';
    }
  }

  async function removeClause(clause) {
    if (!window.confirm($locale.leaseContract.confirmDeleteClause)) return;
    busyClauseId = clause.id;
    clauseError = '';
    try {
      await deleteContractClause(clause.id);
      clauses = clauses.filter((entry) => entry.id !== clause.id);
      notifySuccess($locale.leaseContract.clauseDeleted);
    } catch (error) {
      if (error.status !== 401) clauseError = error?.message || $locale.leaseContract.clauseDeleteError;
    } finally {
      busyClauseId = '';
    }
  }

  /**
   * Move one clause one step. The whole order is sent, so what is on screen is
   * what is stored — and the list is only re-drawn once the server agrees.
   */
  async function moveClause(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= clauses.length) return;

    const order = clauses.map((clause) => clause.id);
    [order[index], order[target]] = [order[target], order[index]];

    busyClauseId = clauses[index].id;
    clauseError = '';
    try {
      // The server answers with the stored list, so the page shows what was
      // actually saved rather than the order it asked for.
      const response = await reorderContractClauses(order);
      clauses = response.clauses;
    } catch (error) {
      if (error.status !== 401) clauseError = error?.message || $locale.leaseContract.reorderError;
    } finally {
      busyClauseId = '';
    }
  }

  $: enabledCount = clauses.filter((clause) => clause.isEnabled).length;

  const languageLabel = (code) => $locale.languageNames[code] || code;
</script>

<svelte:head><title>{$locale.leaseContract.settingsTitle} | {$locale.common.apartmentPro}</title></svelte:head>

<div class="settings-page">
  <PageHeader
    icon="bi-file-earmark-ruled"
    title={$locale.leaseContract.settingsTitle}
    description={$locale.leaseContract.settingsDescription}
  >
    <svelte:fragment slot="actions">
      <button class="btn btn-primary" type="button" on:click={saveSettings} disabled={saving || loading}>
        <i class="bi bi-check2" aria-hidden="true"></i>
        {saving ? $locale.leaseContract.saving : $locale.leaseContract.save}
      </button>
    </svelte:fragment>
  </PageHeader>

  {#if errorMessage}
    <div class="alert alert-danger" role="alert">{errorMessage}</div>
  {/if}

  {#if loading}
    <div class="page-loader" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <span>{$locale.leaseContract.loading}</span>
    </div>
  {:else}
    <form on:submit|preventDefault={saveSettings} novalidate>
      <!-- Office letterhead -------------------------------------------------- -->
      <section class="section-card">
        <header class="section-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-building"></i></span>
          <div>
            <h2>{$locale.leaseContract.officeTitle}</h2>
            <p>{$locale.leaseContract.officeHint}</p>
          </div>
        </header>

        <div class="field-grid">
          <div class="field">
            <label class="field-label" for="contract-office-name">{$locale.leaseContract.officeName}</label>
            <div class="field-control">
              <i class="bi bi-shop" aria-hidden="true"></i>
              <input id="contract-office-name" class="form-control" bind:value={form.officeName} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-office-phone">{$locale.leaseContract.officePhone}</label>
            <div class="field-control">
              <i class="bi bi-telephone" aria-hidden="true"></i>
              <input id="contract-office-phone" class="form-control" bind:value={form.officePhone} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-office-email">{$locale.leaseContract.officeEmail}</label>
            <div class="field-control">
              <i class="bi bi-envelope" aria-hidden="true"></i>
              <input id="contract-office-email" class="form-control" type="email" bind:value={form.officeEmail} />
            </div>
            {#if formErrors.officeEmail}<p class="field-error" role="alert">{formErrors.officeEmail}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="contract-office-license">{$locale.leaseContract.licenseNumber}</label>
            <div class="field-control">
              <i class="bi bi-patch-check" aria-hidden="true"></i>
              <input id="contract-office-license" class="form-control" bind:value={form.licenseNumber} />
            </div>
          </div>
          <div class="field field-wide">
            <label class="field-label" for="contract-office-address">{$locale.leaseContract.officeAddress}</label>
            <textarea class="form-control" id="contract-office-address" rows="2" bind:value={form.officeAddress}></textarea>
            <p class="field-hint">{$locale.leaseContract.officeAddressHint}</p>
          </div>
          <div class="field field-wide">
            <ImageUpload
              kind="contract-logo"
              label={$locale.leaseContract.logo}
              hint={$locale.leaseContract.logoHint}
              bind:value={form.logoUrl}
            />
          </div>
        </div>
      </section>

      <!-- The document itself ----------------------------------------------- -->
      <section class="section-card">
        <header class="section-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-translate"></i></span>
          <div>
            <h2>{$locale.leaseContract.documentTitle}</h2>
            <p>{$locale.leaseContract.documentHint}</p>
          </div>
        </header>

        <div class="field-grid">
          <div class="field">
            <label class="field-label" for="contract-language">{$locale.leaseContract.defaultLanguage}</label>
            <div class="field-control">
              <i class="bi bi-translate" aria-hidden="true"></i>
              <select class="form-select" id="contract-language" bind:value={form.defaultLanguage}>
                {#each LANGUAGES as code (code)}
                  <option value={code}>{languageLabel(code)}</option>
                {/each}
              </select>
            </div>
            <p class="field-hint">{$locale.leaseContract.defaultLanguageHint}</p>
          </div>
          <div class="field">
            <label class="field-label" for="contract-number-prefix">{$locale.leaseContract.numberPrefix}</label>
            <div class="field-control">
              <i class="bi bi-hash" aria-hidden="true"></i>
              <input id="contract-number-prefix" class="form-control" maxlength="32" bind:value={form.contractNumberPrefix} />
            </div>
            <p class="field-hint">{$locale.leaseContract.numberPrefixHint}</p>
          </div>
          <div class="field">
            <label class="field-label" for="contract-title-en">{$locale.leaseContract.titleEn}</label>
            <div class="field-control">
              <i class="bi bi-type" aria-hidden="true"></i>
              <input id="contract-title-en" class="form-control" dir="ltr" bind:value={form.titleEn} />
            </div>
            {#if formErrors.titleEn}<p class="field-error" role="alert">{formErrors.titleEn}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="contract-title-fa">{$locale.leaseContract.titleFa}</label>
            <div class="field-control">
              <i class="bi bi-type" aria-hidden="true"></i>
              <input id="contract-title-fa" class="form-control" dir="rtl" bind:value={form.titleFa} />
            </div>
            {#if formErrors.titleFa}<p class="field-error" role="alert">{formErrors.titleFa}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="contract-title-ps">{$locale.leaseContract.titlePs}</label>
            <div class="field-control">
              <i class="bi bi-type" aria-hidden="true"></i>
              <input id="contract-title-ps" class="form-control" dir="rtl" bind:value={form.titlePs} />
            </div>
            {#if formErrors.titlePs}<p class="field-error" role="alert">{formErrors.titlePs}</p>{/if}
          </div>
          <div class="field">
            <label class="field-label" for="contract-footer-text">{$locale.leaseContract.footerText}</label>
            <textarea class="form-control" id="contract-footer-text" rows="3" bind:value={form.footerText}></textarea>
            <p class="field-hint">{$locale.leaseContract.footerTextHint}</p>
          </div>
        </div>
      </section>

      <!-- Lessor / owner ---------------------------------------------------- -->
      <section class="section-card">
        <header class="section-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-person-vcard"></i></span>
          <div>
            <h2>{$locale.leaseContract.lessorTitle}</h2>
            <p>{$locale.leaseContract.lessorHint}</p>
          </div>
        </header>

        <div class="field-grid">
          <div class="field">
            <label class="field-label" for="contract-lessor-name">{$locale.leaseContract.lessorName}</label>
            <div class="field-control">
              <i class="bi bi-person" aria-hidden="true"></i>
              <input id="contract-lessor-name" class="form-control" bind:value={form.lessorName} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-lessor-phone">{$locale.leaseContract.lessorPhone}</label>
            <div class="field-control">
              <i class="bi bi-telephone" aria-hidden="true"></i>
              <input id="contract-lessor-phone" class="form-control" bind:value={form.lessorPhone} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-lessor-national-id">{$locale.leaseContract.lessorNationalId}</label>
            <div class="field-control">
              <i class="bi bi-person-badge" aria-hidden="true"></i>
              <input id="contract-lessor-national-id" class="form-control" bind:value={form.lessorNationalId} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-lessor-address">{$locale.leaseContract.lessorAddress}</label>
            <textarea class="form-control" id="contract-lessor-address" rows="2" bind:value={form.lessorAddress}></textarea>
          </div>
          <div class="field field-wide">
            <ImageUpload
              kind="contract-lessor-photo"
              label={$locale.leaseContract.lessorPhoto}
              hint={$locale.leaseContract.lessorPhotoHint}
              shape="avatar"
              bind:value={form.lessorPhotoUrl}
            />
          </div>
        </div>
      </section>

      <!-- Photos and signatures --------------------------------------------- -->
      <section class="section-card">
        <header class="section-heading">
          <span class="section-icon" aria-hidden="true"><i class="bi bi-vector-pen"></i></span>
          <div>
            <h2>{$locale.leaseContract.signatureTitle}</h2>
            <p>{$locale.leaseContract.signatureHint}</p>
          </div>
        </header>

        <div class="field-grid">
          <div class="field">
            <label class="field-label" for="contract-lessor-signature">{$locale.leaseContract.lessorSignatureLabel}</label>
            <div class="field-control">
              <i class="bi bi-pen" aria-hidden="true"></i>
              <input id="contract-lessor-signature" class="form-control" bind:value={form.lessorSignatureLabel} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-tenant-signature">{$locale.leaseContract.tenantSignatureLabel}</label>
            <div class="field-control">
              <i class="bi bi-pen" aria-hidden="true"></i>
              <input id="contract-tenant-signature" class="form-control" bind:value={form.tenantSignatureLabel} />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="contract-witness-signature">{$locale.leaseContract.witnessSignatureLabel}</label>
            <div class="field-control">
              <i class="bi bi-pen" aria-hidden="true"></i>
              <input id="contract-witness-signature" class="form-control" bind:value={form.witnessSignatureLabel} />
            </div>
          </div>
          <div class="field">
            <span class="field-label">{$locale.leaseContract.photos}</span>
            <div class="switch-stack">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="contract-show-tenant-photo" bind:checked={form.showTenantPhoto} />
                <label class="form-check-label" for="contract-show-tenant-photo">{$locale.leaseContract.showTenantPhoto}</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="contract-show-lessor-photo" bind:checked={form.showLessorPhoto} />
                <label class="form-check-label" for="contract-show-lessor-photo">{$locale.leaseContract.showLessorPhoto}</label>
              </div>
            </div>
            <p class="field-hint">{$locale.leaseContract.photosHint}</p>
          </div>
        </div>
      </section>
    </form>

    <!-- Clauses -------------------------------------------------------------- -->
    <section class="section-card">
      <header class="section-heading">
        <span class="section-icon" aria-hidden="true"><i class="bi bi-list-ol"></i></span>
        <div>
          <h2>{$locale.leaseContract.clausesTitle}</h2>
          <p>{$locale.leaseContract.clausesHint.replace('{count}', enabledCount)}</p>
        </div>
        <div class="section-heading-actions">
          <button class="btn btn-outline-secondary btn-sm" type="button" on:click={() => (placeholdersOpen = !placeholdersOpen)} aria-expanded={placeholdersOpen}>
            <i class="bi bi-braces" aria-hidden="true"></i>
            {$locale.leaseContract.placeholdersTitle}
          </button>
          <button class="btn btn-primary btn-sm" type="button" on:click={openNewClause}>
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
            {$locale.leaseContract.addClause}
          </button>
        </div>
      </header>

      {#if clauseError}
        <div class="alert alert-danger" role="alert">{clauseError}</div>
      {/if}

      {#if placeholdersOpen}
        <div class="placeholder-panel">
          <p class="placeholder-lead">{$locale.leaseContract.placeholdersHint}</p>
          {#each placeholders as group (group.key)}
            <div class="placeholder-group">
              <p class="placeholder-group-title">{$locale.leaseContract.groups[group.key] || group.key}</p>
              <div class="placeholder-chips">
                {#each group.tokens as [token, description] (token)}
                  <span class="placeholder-chip" title={description}>{`{{${token}}}`}</span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if clauses.length === 0}
        <EmptyState
          icon="bi-list-ol"
          title={$locale.leaseContract.noClauses}
          description={$locale.leaseContract.noClausesHint}
        >
          <svelte:fragment slot="action">
            <button class="btn btn-primary" type="button" on:click={openNewClause}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              {$locale.leaseContract.addClause}
            </button>
          </svelte:fragment>
        </EmptyState>
      {:else}
        <ol class="clause-list">
          {#each clauses as clause, index (clause.id)}
            <li class="clause-row" class:is-disabled={!clause.isEnabled}>
              <span class="clause-number">{index + 1}</span>
              <div class="clause-copy">
                <p class="clause-title">
                  {clause.titleEn || clause.titleFa || clause.titlePs || $locale.leaseContract.untitledClause}
                  {#if !clause.isEnabled}
                    <StatusBadge label={$locale.leaseContract.disabled} tone="neutral" />
                  {/if}
                </p>
                <p class="clause-body">{clause.bodyEn}</p>
              </div>
              <div class="clause-actions">
                <button
                  class="icon-btn"
                  type="button"
                  title={$locale.leaseContract.moveUp}
                  aria-label={$locale.leaseContract.moveUp}
                  disabled={index === 0 || busyClauseId === clause.id}
                  on:click={() => moveClause(index, -1)}
                >
                  <i class="bi bi-arrow-up" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn"
                  type="button"
                  title={$locale.leaseContract.moveDown}
                  aria-label={$locale.leaseContract.moveDown}
                  disabled={index === clauses.length - 1 || busyClauseId === clause.id}
                  on:click={() => moveClause(index, 1)}
                >
                  <i class="bi bi-arrow-down" aria-hidden="true"></i>
                </button>
                <button
                  class="icon-btn"
                  type="button"
                  title={clause.isEnabled ? $locale.leaseContract.disable : $locale.leaseContract.enable}
                  aria-label={clause.isEnabled ? $locale.leaseContract.disable : $locale.leaseContract.enable}
                  disabled={busyClauseId === clause.id}
                  on:click={() => toggleClause(clause)}
                >
                  <i class={clause.isEnabled ? 'bi bi-toggle-on' : 'bi bi-toggle-off'} aria-hidden="true"></i>
                </button>
                <button class="icon-btn" type="button" title={$locale.common.actions.edit} aria-label={$locale.common.actions.edit} on:click={() => openEditClause(clause)}>
                  <i class="bi bi-pencil" aria-hidden="true"></i>
                </button>
                <button class="icon-btn is-danger" type="button" title={$locale.common.actions.delete} aria-label={$locale.common.actions.delete} disabled={busyClauseId === clause.id} on:click={() => removeClause(clause)}>
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  {/if}
</div>

<!-- Add / edit one clause -->
<Modal
  bind:open={clauseOpen}
  icon="bi-list-ol"
  title={clauseEditing ? $locale.leaseContract.editClause : $locale.leaseContract.newClause}
  description={$locale.leaseContract.clauseHint}
  busy={clauseSaving}
  size="modal-lg"
  closeLabel={$locale.common.close}
  on:close={closeClause}
>
  <form id="contract-clause-form" on:submit|preventDefault={saveClause} novalidate>
    {#if clauseError}
      <div class="alert alert-danger" role="alert">{clauseError}</div>
    {/if}

    <div class="field-grid">
      <div class="field">
        <label class="field-label" for="clause-title-en">{$locale.leaseContract.clauseTitleEn}</label>
        <div class="field-control">
          <i class="bi bi-type" aria-hidden="true"></i>
          <input id="clause-title-en" class="form-control" dir="ltr" bind:value={clauseForm.titleEn} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="clause-title-fa">{$locale.leaseContract.clauseTitleFa}</label>
        <div class="field-control">
          <i class="bi bi-type" aria-hidden="true"></i>
          <input id="clause-title-fa" class="form-control" dir="rtl" bind:value={clauseForm.titleFa} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="clause-title-ps">{$locale.leaseContract.clauseTitlePs}</label>
        <div class="field-control">
          <i class="bi bi-type" aria-hidden="true"></i>
          <input id="clause-title-ps" class="form-control" dir="rtl" bind:value={clauseForm.titlePs} />
        </div>
      </div>
      <div class="field">
        <span class="field-label">{$locale.leaseContract.clauseEnabled}</span>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="clause-enabled" bind:checked={clauseForm.isEnabled} />
          <label class="form-check-label" for="clause-enabled">{$locale.leaseContract.clauseEnabledLabel}</label>
        </div>
        <p class="field-hint">{$locale.leaseContract.clauseEnabledHint}</p>
      </div>

      <div class="field field-wide">
        <label class="field-label" for="clause-body-en">{$locale.leaseContract.clauseBodyEn}</label>
        <textarea class="form-control" id="clause-body-en" dir="ltr" rows="4" maxlength={BODY_LIMIT} bind:value={clauseForm.bodyEn}></textarea>
        {#if clauseFormErrors.bodyEn}<p class="field-error" role="alert">{clauseFormErrors.bodyEn}</p>{/if}
      </div>
      <div class="field field-wide">
        <label class="field-label" for="clause-body-fa">{$locale.leaseContract.clauseBodyFa}</label>
        <textarea class="form-control" id="clause-body-fa" dir="rtl" rows="4" maxlength={BODY_LIMIT} bind:value={clauseForm.bodyFa}></textarea>
        <p class="field-hint">{$locale.leaseContract.clauseTranslationHint}</p>
        {#if clauseFormErrors.bodyFa}<p class="field-error" role="alert">{clauseFormErrors.bodyFa}</p>{/if}
      </div>
      <div class="field field-wide">
        <label class="field-label" for="clause-body-ps">{$locale.leaseContract.clauseBodyPs}</label>
        <textarea class="form-control" id="clause-body-ps" dir="rtl" rows="4" maxlength={BODY_LIMIT} bind:value={clauseForm.bodyPs}></textarea>
        {#if clauseFormErrors.bodyPs}<p class="field-error" role="alert">{clauseFormErrors.bodyPs}</p>{/if}
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeClause} disabled={clauseSaving}>{$locale.invoices.cancel}</button>
    <button class="btn btn-primary" type="submit" form="contract-clause-form" disabled={clauseSaving}>
      {clauseSaving ? $locale.leaseContract.saving : $locale.leaseContract.saveClause}
    </button>
  </div>
</Modal>

<style>
  .settings-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 76rem;
  }

  .page-loader {
    display: grid;
    place-items: center;
    gap: var(--space-3);
    min-height: 14rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
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

  .section-heading-actions { display: flex; gap: var(--space-2); margin-inline-start: auto; flex-wrap: wrap; }

  .field-error { margin: 4px 0 0; color: var(--danger); font-size: var(--text-xs); font-weight: var(--weight-semibold); }

  .switch-stack { display: grid; gap: var(--space-2); }
  .switch-stack .form-check { margin: 0; }

  .placeholder-panel {
    margin-block-end: var(--space-4);
    padding: var(--space-4);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-muted);
  }

  .placeholder-lead { margin: 0 0 var(--space-3); color: var(--text-secondary); font-size: var(--text-sm); }
  .placeholder-group + .placeholder-group { margin-block-start: var(--space-3); }
  .placeholder-group-title { margin: 0 0 6px; color: var(--text-muted); font-size: var(--text-xs); font-weight: var(--weight-heavy); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .placeholder-chips { display: flex; flex-wrap: wrap; gap: 6px; }

  .placeholder-chip {
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    direction: ltr;
    white-space: nowrap;
  }

  .clause-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }

  .clause-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .clause-row.is-disabled { background: var(--surface-muted); }
  .clause-row.is-disabled .clause-body { color: var(--text-muted); }

  .clause-number {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-weight: var(--weight-heavy);
  }

  .clause-copy { flex: 1 1 auto; min-width: 0; }
  .clause-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; color: var(--text-strong); font-size: var(--text-sm); font-weight: var(--weight-bold); }

  /* The English body is the one every contract can always print, so it is the
     line the list shows; the translations are edited in the dialog. */
  .clause-body {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .clause-actions { display: flex; gap: 2px; flex: 0 0 auto; }

  .icon-btn {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.95rem;
    cursor: pointer;
    transition: color var(--transition), background var(--transition);
  }

  .icon-btn:hover:not(:disabled) { color: var(--text-strong); background: var(--surface-hover); }
  .icon-btn.is-danger:hover:not(:disabled) { color: var(--danger); }
  .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  @media (max-width: 767.98px) {
    .clause-row { flex-wrap: wrap; }
    .clause-actions { margin-inline-start: auto; }
    .section-heading-actions { margin-inline-start: 0; width: 100%; }
  }
</style>
