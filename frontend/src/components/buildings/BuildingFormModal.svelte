<script>
  import { createEventDispatcher, tick } from 'svelte';

  import Modal from '../ui/Modal.svelte';
  import { createBuilding, updateBuilding } from '../../services/buildings';
  import { locale, translate } from '../../i18n';

  /** Whether the dialog is open. Two-way bindable. */
  export let open = false;
  /** The row to edit. Pass null (or omit) to create a new building. */
  export let building = null;

  const dispatch = createEventDispatcher();

  let saving = false;
  let form = emptyForm();
  let fieldErrors = {};
  let formError = '';
  let summaryElement;
  let wasOpen = false;

  function emptyForm() {
    return { name: '', code: '', address: '', status: 'ACTIVE' };
  }

  $: isEdit = Boolean(building && building.id);

  /* The dialog is transient, so every open starts fresh from the row it was
     handed — a cancelled edit can never leak into the next one. */
  $: if (open && !wasOpen) {
    wasOpen = true;
    form = isEdit
      ? {
          name: building.name || '',
          code: building.code || '',
          address: building.address || '',
          status: building.status || 'ACTIVE'
        }
      : emptyForm();
    fieldErrors = {};
    formError = '';
  } else if (!open && wasOpen) {
    wasOpen = false;
  }

  $: errorItems = Object.keys(fieldErrors).map((field) => ({
    field,
    message: fieldErrors[field]
  }));

  function validate() {
    const errors = {};
    if (!form.name.trim()) {
      errors.name = translate('buildings.required', { field: $locale.buildings.name });
    }
    if (!form.code.trim()) {
      errors.code = translate('buildings.required', { field: $locale.buildings.code });
    }
    if (!form.address.trim()) {
      errors.address = translate('buildings.required', { field: $locale.buildings.address });
    }
    fieldErrors = errors;
    return Object.keys(errors).length === 0;
  }

  function focusField(field) {
    document.getElementById(`building-${field}`)?.focus();
  }

  /** Move focus to the summary so a failed submit is announced and reachable. */
  async function announceFailure() {
    await tick();
    summaryElement?.focus();
  }

  /* The dialog owns its own visibility, so a caller that forgets to handle
     `close` still gets a working dismiss — and the event lets callers like
     the Buildings page drop the row they were holding. */
  function close() {
    if (saving) return;
    open = false;
    dispatch('close');
  }

  async function submit() {
    if (saving) return;
    formError = '';

    if (!validate()) {
      formError = $locale.buildings.fixErrors;
      await announceFailure();
      return;
    }

    saving = true;
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      address: form.address.trim(),
      status: form.status
    };

    try {
      const response = isEdit
        ? await updateBuilding(building.id, payload)
        : await createBuilding(payload);
      saving = false;
      dispatch('saved', response?.building ?? response);
      open = false;
    } catch (error) {
      saving = false;
      if (error.data?.code === 'BUILDING_CODE_EXISTS') {
        fieldErrors = { ...fieldErrors, code: $locale.buildings.codeExists };
      } else if (Array.isArray(error.data?.errors)) {
        const nextErrors = {};
        for (const item of error.data.errors) {
          const field = item.path || item.field;
          if (field && !nextErrors[field]) nextErrors[field] = item.message;
        }
        fieldErrors = nextErrors;
      }
      formError = error.message;
      await announceFailure();
    }
  }
</script>

<Modal
  bind:open
  title={isEdit ? $locale.buildings.edit : $locale.buildings.details}
  description={$locale.buildings.detailsHint}
  busy={saving}
  size="modal-lg"
  icon="bi-building"
  closeLabel={$locale.common.close}
  on:close={close}
>
  <form id="building-form" on:submit|preventDefault={submit} novalidate>
    {#if formError}
      <div class="alert alert-danger" role="alert" tabindex="-1" bind:this={summaryElement}>
        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
        <span>{formError}</span>
        {#if errorItems.length > 1}
          <ul class="form-error-list">
            {#each errorItems as item (item.field)}
              <li>
                <button type="button" class="form-error-link" on:click={() => focusField(item.field)}>
                  {item.message}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <div class="field">
      <label class="field-label" for="building-name">
        {$locale.buildings.name}<span class="field-required" aria-hidden="true">*</span>
        <span class="visually-hidden">({$locale.common.required})</span>
      </label>
      <div class="field-control">
        <i class="bi bi-building" aria-hidden="true"></i>
        <input
          class:is-invalid={fieldErrors.name}
          class="form-control"
          id="building-name"
          placeholder={$locale.buildings.namePlaceholder}
          maxlength="191"
          bind:value={form.name}
          aria-required="true"
          aria-invalid={fieldErrors.name ? 'true' : 'false'}
          aria-describedby="building-name-hint"
        />
      </div>
      <p class="field-hint" id="building-name-hint">{$locale.buildings.nameHint}</p>
      {#if fieldErrors.name}
        <div class="invalid-feedback">{fieldErrors.name}</div>
      {/if}
    </div>

    <div class="field-grid">
      <div class="field">
        <label class="field-label" for="building-code">
          {$locale.buildings.code}<span class="field-required" aria-hidden="true">*</span>
          <span class="visually-hidden">({$locale.common.required})</span>
        </label>
        <div class="field-control">
          <i class="bi bi-upc" aria-hidden="true"></i>
          <input
            class:is-invalid={fieldErrors.code}
            class="form-control"
            id="building-code"
            placeholder={$locale.buildings.codePlaceholder}
            maxlength="64"
            bind:value={form.code}
            aria-required="true"
            aria-invalid={fieldErrors.code ? 'true' : 'false'}
            aria-describedby="building-code-hint"
          />
        </div>
        <p class="field-hint" id="building-code-hint">{$locale.buildings.codeHint}</p>
        {#if fieldErrors.code}
          <div class="invalid-feedback">{fieldErrors.code}</div>
        {/if}
      </div>

      <div class="field">
        <label class="field-label" for="building-status">{$locale.buildings.status}</label>
        <div class="field-control">
          <i class="bi bi-list-ul" aria-hidden="true"></i>
          <select class="form-select" id="building-status" bind:value={form.status}>
            <option value="ACTIVE">{$locale.buildings.active}</option>
            <option value="INACTIVE">{$locale.buildings.inactive}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="field">
      <label class="field-label" for="building-address">
        {$locale.buildings.address}<span class="field-required" aria-hidden="true">*</span>
        <span class="visually-hidden">({$locale.common.required})</span>
      </label>
      <div class="field-control">
        <i class="bi bi-geo-alt" aria-hidden="true"></i>
        <input
          class:is-invalid={fieldErrors.address}
          class="form-control"
          id="building-address"
          placeholder={$locale.buildings.addressPlaceholder}
          maxlength="500"
          bind:value={form.address}
          aria-required="true"
          aria-invalid={fieldErrors.address ? 'true' : 'false'}
          aria-describedby="building-address-hint"
        />
      </div>
      <p class="field-hint" id="building-address-hint">{$locale.buildings.addressHint}</p>
      {#if fieldErrors.address}
        <div class="invalid-feedback">{fieldErrors.address}</div>
      {/if}
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={close} disabled={saving}>
      {$locale.buildings.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="building-form" disabled={saving}>
      {saving
        ? $locale.buildings.loading
        : isEdit
          ? $locale.buildings.update
          : $locale.buildings.create}
    </button>
  </div>
</Modal>
