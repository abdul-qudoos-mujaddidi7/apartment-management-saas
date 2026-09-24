<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';

  import {
    completeApartmentAssets,
    getNextApartment,
    listApartmentAssets,
    listAssetCategories,
    listAssets,
    createAsset,
    createAssetCategory,
    saveApartmentAssets
  } from '../services/assets';

  import { locale, translate } from '../i18n';
  import { formatMoney } from '../utils/formatters';

  export let params = {};

  const conditionKeys = ['NEW', 'GOOD', 'FAIR', 'DAMAGED', 'BROKEN'];

  let apartmentId = null;
  let routeReady = false;

  let apartment = null;
  let rows = [];
  let assets = [];
  let categories = [];

  let loading = false;
  let saving = false;
  let allCompleted = false;

  let errorMessage = '';
  let noticeMessage = '';
  let rowErrors = {};

  let rowCounter = 0;

  let quickCreateOpen = false;
  let quickCreateForRow = null;
  let quickCreateSaving = false;
  let quickCreateError = '';
  let quickCreateErrors = {};
  let quickCreateForm = emptyQuickCreateForm();

  // The category picker inside the asset modal opens this small dialog of its own.
  let quickCategoryOpen = false;
  let quickCategorySaving = false;
  let quickCategoryError = '';
  let quickCategoryErrors = {};
  let quickCategoryNotice = '';
  let quickCategoryForm = emptyQuickCategoryForm();

  function emptyQuickCreateForm() {
    return { name: '', categoryId: '', unit: '', code: '' };
  }

  function emptyQuickCategoryForm() {
    return { name: '', description: '' };
  }

  function emptyRow() {
    rowCounter += 1;

    return {
      key: `row-${rowCounter}`,
      id: null,
      assetId: '',
      quantity: 1,
      condition: 'GOOD',
      serialNumber: '',
      modelNumber: '',
      unitValue: '',
      notes: ''
    };
  }

  function toRow(item) {
    rowCounter += 1;

    return {
      key: `row-${rowCounter}`,
      id: item.id,
      assetId: item.assetId,
      quantity: item.quantity,
      condition: item.condition,
      serialNumber: item.serialNumber || '',
      modelNumber: item.modelNumber || '',
      unitValue: item.unitValue === null || item.unitValue === undefined ? '' : item.unitValue,
      notes: item.notes || ''
    };
  }

  onMount(async () => {
    await applyRoute(params?.apartmentId || null);
    routeReady = true;
  });

  $: if (routeReady) {
    const routeApartmentId = params?.apartmentId || null;
    if (routeApartmentId && routeApartmentId !== apartmentId) applyRoute(routeApartmentId);
  }

  async function applyRoute(newApartmentId) {
    apartmentId = newApartmentId;
    apartment = null;
    rows = [];
    rowErrors = {};
    errorMessage = '';
    noticeMessage = '';
    allCompleted = false;

    if (!apartmentId) {
      errorMessage = $locale.assets.loadError;
      return;
    }

    await load();
  }

  async function load() {
    loading = true;
    errorMessage = '';

    try {
      const [assetResponse, categoryResponse, apartmentResponse] = await Promise.all([
        listAssets({ pageSize: 100 }),
        listAssetCategories({ pageSize: 100 }),
        listApartmentAssets(apartmentId)
      ]);

      assets = assetResponse.items || [];
      categories = categoryResponse.items || [];
      apartment = apartmentResponse.apartment;
      rows = (apartmentResponse.items || []).map(toRow);
    } catch (error) {
      errorMessage = error.status === 404 ? $locale.assets.loadError : error.message || $locale.assets.loadError;
    } finally {
      loading = false;
    }
  }

  /** Rows are replaced, not mutated, so totals and the option state stay live. */
  function setField(index, field, value) {
    rows = rows.map((row, position) => (position === index ? { ...row, [field]: value } : row));
  }

  function addRow() {
    rows = [...rows, emptyRow()];
  }

  function removeRow(index) {
    const row = rows[index];
    if (row?.id && !window.confirm($locale.assets.confirmDelete)) return;

    rows = rows.filter((_, position) => position !== index);

    if (rows.length === 0) {
      rowErrors = {};
      allCompleted = false;
    }
  }

  function rowTotal(row) {
    const unitValue = row.unitValue === '' ? 0 : Number(row.unitValue);
    const quantity = Number(row.quantity);
    return Number.isFinite(unitValue) && Number.isFinite(quantity) ? unitValue * quantity : 0;
  }

  $: assetGroups = groupByCategory(assets);
  $: totalQuantity = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  $: totalValue = rows.reduce((sum, row) => sum + rowTotal(row), 0);
  $: setupBadge = apartment?.assetSetupCompletedAt
    ? { label: $locale.assets.setupCompletedBadge, tone: 'success' }
    : { label: $locale.assets.setupPendingBadge, tone: 'warning' };

  function groupByCategory(list) {
    const groups = new Map();

    for (const asset of list) {
      const label = asset.category?.name || '';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(asset);
    }

    return [...groups.entries()].map(([label, items]) => ({ label, items }));
  }

  function validateRows() {
    rowErrors = {};

    rows.forEach((row) => {
      if (!row.assetId) {
        rowErrors[row.key] = translate('assets.required', { field: $locale.assets.asset });
        return;
      }

      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        rowErrors[row.key] = translate('assets.wholeQuantity', { field: $locale.assets.quantity });
        return;
      }

      if (row.unitValue !== '' && (!Number.isFinite(Number(row.unitValue)) || Number(row.unitValue) < 0)) {
        rowErrors[row.key] = translate('assets.notNegative', { field: $locale.assets.unitValue });
      }
    });

    return Object.keys(rowErrors).length === 0;
  }

  function buildPayload(complete, advance) {
    return {
      assets: rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        assetId: row.assetId,
        quantity: Number(row.quantity),
        condition: row.condition,
        serialNumber: row.serialNumber.trim() || null,
        modelNumber: row.modelNumber.trim() || null,
        unitValue: row.unitValue === '' ? null : Number(row.unitValue),
        notes: row.notes.trim() || null
      })),
      complete,
      advance
    };
  }

  function applySaved(items) {
    if (!Array.isArray(items)) return;
    rows = items.map(toRow);
    rowErrors = {};
  }

  async function save(complete, advance) {
    if (rows.length > 0 && !validateRows()) return;

    saving = true;
    errorMessage = '';
    noticeMessage = '';
    allCompleted = false;

    try {
      const response = await saveApartmentAssets(apartmentId, buildPayload(complete, advance));

      if (advance) {
        if (response.nextApartment) {
          await push(`/apartments/${response.nextApartment.id}/assets`);
          return;
        }

        applySaved(response.items);
        noticeMessage = $locale.assets.allCompleted;
        allCompleted = true;
        return;
      }

      applySaved(response.items);
      if (complete) {
        apartment = { ...apartment, assetSetupCompletedAt: new Date().toISOString() };
      }
      noticeMessage = $locale.assets.saved;
    } catch (error) {
      handleSaveError(error);
    } finally {
      saving = false;
    }
  }

  function handleSaveError(error) {
    const code = error.data?.code;

    if (code === 'SERIAL_NUMBER_EXISTS') {
      errorMessage = $locale.assets.serialExists;
    } else if (code === 'INVALID_ASSET') {
      errorMessage = $locale.assets.assetRequired;
    } else if (code === 'APARTMENT_NOT_FOUND' || code === 'APARTMENT_ASSET_NOT_FOUND') {
      errorMessage = $locale.assets.loadError;
    } else {
      errorMessage = error.message;
    }
  }

  // Navigation only: skipping never marks this apartment as completed.
  async function skip() {
    saving = true;
    errorMessage = '';
    noticeMessage = '';
    allCompleted = false;

    try {
      const response = await getNextApartment(apartmentId);

      if (response.nextApartment) {
        await push(`/apartments/${response.nextApartment.id}/assets`);
        return;
      }

      noticeMessage = $locale.assets.allCompleted;
      allCompleted = true;
    } catch (error) {
      handleSaveError(error);
    } finally {
      saving = false;
    }
  }

  // "Complete with no assets" registers the apartment without adding rows.
  async function completeWithNoAssets() {
    saving = true;
    errorMessage = '';
    noticeMessage = '';
    allCompleted = false;

    try {
      const response = await completeApartmentAssets(apartmentId, true);

      if (response.nextApartment) {
        await push(`/apartments/${response.nextApartment.id}/assets`);
        return;
      }

      apartment = { ...apartment, assetSetupCompletedAt: new Date().toISOString() };
      noticeMessage = $locale.assets.allCompleted;
      allCompleted = true;
    } catch (error) {
      handleSaveError(error);
    } finally {
      saving = false;
    }
  }

  function goBackToList() {
    push(apartment?.floor?.building?.id ? `/buildings/${apartment.floor.building.id}` : '/apartments');
  }

  // --- Quick asset creation -------------------------------------------------

  function openQuickCreate(row) {
    quickCreateForRow = row;
    quickCreateError = '';
    quickCreateErrors = {};
    quickCreateForm = { ...emptyQuickCreateForm(), categoryId: categories[0]?.id || '' };
    quickCreateOpen = true;
  }

  function closeQuickCreate() {
    if (quickCreateSaving) return;
    quickCreateOpen = false;
    quickCreateForRow = null;
    quickCreateError = '';
    quickCreateErrors = {};
  }

  async function submitQuickCreate() {
    quickCreateErrors = {};

    if (!quickCreateForm.name.trim()) {
      quickCreateErrors = { name: translate('assets.required', { field: $locale.assets.name }) };
      return;
    }

    quickCreateSaving = true;
    quickCreateError = '';

    try {
      const response = await createAsset({
        name: quickCreateForm.name.trim(),
        categoryId: quickCreateForm.categoryId || null,
        unit: quickCreateForm.unit.trim() || null,
        code: quickCreateForm.code.trim() || null
      });

      const created = response.asset;
      assets = [...assets, created].sort((a, b) => a.name.localeCompare(b.name));

      const targetRow = rows.find((row) => row.key === quickCreateForRow?.key);
      if (targetRow) {
        const index = rows.indexOf(targetRow);
        setField(index, 'assetId', created.id);
      }

      closeQuickCreate();
    } catch (error) {
      quickCreateError = error.message;
    } finally {
      quickCreateSaving = false;
    }
  }

  /**
   * New asset and new category are one flow: the category dialog opens over this
   * one, and what it creates is added to the picker and selected, so the asset
   * being typed never loses its place in the form.
   */
  function openQuickCategory() {
    quickCategoryError = '';
    quickCategoryErrors = {};
    quickCategoryNotice = '';
    quickCategoryForm = emptyQuickCategoryForm();
    quickCategoryOpen = true;
  }

  function closeQuickCategory() {
    if (quickCategorySaving) return;
    quickCategoryOpen = false;
    quickCategoryError = '';
    quickCategoryErrors = {};
  }

  async function submitQuickCategory() {
    quickCategoryErrors = {};
    quickCategoryError = '';
    quickCategoryNotice = '';

    if (!quickCategoryForm.name.trim()) {
      quickCategoryErrors = { name: translate('assets.required', { field: $locale.assets.name }) };
      return;
    }

    quickCategorySaving = true;

    try {
      const response = await createAssetCategory({
        name: quickCategoryForm.name.trim(),
        description: quickCategoryForm.description.trim() || null
      });

      const created = response.assetCategory;
      categories = [...categories, created].sort((a, b) => a.name.localeCompare(b.name));
      quickCreateForm = { ...quickCreateForm, categoryId: created.id };

      // Closed directly, not through closeQuickCategory(): the guard on that one
      // would refuse while the save it just finished is still flagged as running.
      quickCategoryOpen = false;
      quickCategoryNotice = $locale.assets.categorySaved;
    } catch (error) {
      quickCategoryError = error.message;
    } finally {
      quickCategorySaving = false;
    }
  }
</script>

<svelte:head>
  <title>{$locale.assets.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout ariaLabel={$locale.assets.apartmentTitle}>
  <svelte:fragment slot="actions">
    <button class="back-button" type="button" on:click={goBackToList}>
      <i class="bi bi-arrow-left" aria-hidden="true"></i>
      {$locale.assets.back}
    </button>
    <ActionButton
      icon="bi-plus-lg"
      label={$locale.assets.add}
      on:click={addRow}
      disabled={saving || !apartment}
    />
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}
      <div class="alert alert-danger" role="alert">{errorMessage}</div>
    {/if}
    {#if noticeMessage}
      <div class="alert alert-success" role="status">
        {noticeMessage}
        {#if allCompleted}
          <button class="alert-link-button" type="button" on:click={() => push('/apartments')}>
            {$locale.assets.back}
          </button>
        {/if}
      </div>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    {#if loading}
      <div class="panel-loader">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{$locale.assets.loading}</span>
        </div>
      </div>
    {:else if apartment}
      <div class="asset-page">
        <header class="asset-context">
          <div class="context-title">
            <span class="context-icon"><i class="bi bi-door-open" aria-hidden="true"></i></span>
            <div>
              <h1>{apartment.apartmentNumber} · {apartment.name}</h1>
              <p>
                <i class="bi bi-buildings" aria-hidden="true"></i>
                {apartment.floor?.building?.name || '—'}
                <span class="context-divider" aria-hidden="true">/</span>
                <i class="bi bi-layers" aria-hidden="true"></i>
                {apartment.floor?.name || '—'}
              </p>
            </div>
          </div>

          <div class="context-stats">
            <StatusBadge label={setupBadge.label} tone={setupBadge.tone} />
            <span class="stat"><strong>{rows.length}</strong>{$locale.assets.assetItem}</span>
            <span class="stat"><strong>{totalQuantity}</strong>{$locale.assets.quantity}</span>
            <span class="stat"><strong>{formatMoney(totalValue)}</strong>{$locale.assets.totalValue}</span>
          </div>
        </header>

      {#if rows.length === 0}
        <div class="assets-empty">
          <span class="empty-icon"><i class="bi bi-box-seam" aria-hidden="true"></i></span>
          <p>{$locale.assets.noAssetsYet}</p>
          <ActionButton icon="bi-plus-lg" label={$locale.assets.addItem} on:click={addRow} />
        </div>
      {:else}
        <ol class="asset-list">
          {#each rows as row, index (row.key)}
            <li class="asset-line" class:is-invalid={Boolean(rowErrors[row.key])}>
              <span class="line-number" aria-hidden="true">{index + 1}</span>

              <div class="line-fields">
                <div class="field asset-field">
                  <label class="field-label" for={`asset-${row.key}`}>{$locale.assets.assetItem}</label>
                  <div class="asset-control">
                    <select
                      class="form-select"
                      id={`asset-${row.key}`}
                      value={row.assetId}
                      on:change={(event) => setField(index, 'assetId', event.currentTarget.value)}
                    >
                      <option value="">{$locale.assets.selectAsset}</option>
                      {#each assetGroups as group (group.label)}
                        {#if group.label}
                          <optgroup label={group.label}>
                            {#each group.items as asset (asset.id)}
                              <option value={asset.id}>{asset.name}</option>
                            {/each}
                          </optgroup>
                        {:else}
                          {#each group.items as asset (asset.id)}
                            <option value={asset.id}>{asset.name}</option>
                          {/each}
                        {/if}
                      {/each}
                    </select>
                    <button
                      class="quick-create"
                      type="button"
                      on:click={() => openQuickCreate(row)}
                      aria-label={$locale.assets.createAsset}
                      title={$locale.assets.createAsset}
                    >
                      <i class="bi bi-plus-circle" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>

                <div class="field">
                  <label class="field-label" for={`quantity-${row.key}`}>{$locale.assets.quantity}</label>
                  <input
                    class="form-control"
                    id={`quantity-${row.key}`}
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    on:input={(event) => setField(index, 'quantity', event.currentTarget.value)}
                  />
                </div>

                <div class="field">
                  <label class="field-label" for={`condition-${row.key}`}>{$locale.assets.condition}</label>
                  <select
                    class="form-select"
                    id={`condition-${row.key}`}
                    value={row.condition}
                    on:change={(event) => setField(index, 'condition', event.currentTarget.value)}
                  >
                    {#each conditionKeys as conditionValue (conditionValue)}
                      <option value={conditionValue}>{$locale.assets.conditions[conditionValue]}</option>
                    {/each}
                  </select>
                </div>

                <div class="field">
                  <label class="field-label" for={`serial-${row.key}`}>{$locale.assets.serialNumber}</label>
                  <input
                    class="form-control"
                    id={`serial-${row.key}`}
                    type="text"
                    placeholder="TV-238392"
                    bind:value={row.serialNumber}
                  />
                </div>

                <div class="field">
                  <label class="field-label" for={`model-${row.key}`}>{$locale.assets.modelNumber}</label>
                  <input class="form-control" id={`model-${row.key}`} type="text" bind:value={row.modelNumber} />
                </div>

                <div class="field">
                  <label class="field-label" for={`value-${row.key}`}>{$locale.assets.unitValue}</label>
                  <input
                    class="form-control"
                    id={`value-${row.key}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitValue}
                    on:input={(event) => setField(index, 'unitValue', event.currentTarget.value)}
                  />
                </div>

                <div class="field">
                  <label class="field-label" for={`notes-${row.key}`}>{$locale.assets.notes}</label>
                  <input class="form-control" id={`notes-${row.key}`} type="text" bind:value={row.notes} />
                </div>
              </div>

              <div class="line-side">
                <span class="line-total">{formatMoney(rowTotal(row))}</span>
                <button
                  class="icon-button danger"
                  type="button"
                  on:click={() => removeRow(index)}
                  aria-label={$locale.assets.removeItem}
                  title={$locale.assets.removeItem}
                >
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </div>

              {#if rowErrors[row.key]}
                <p class="line-error" role="alert">
                  <i class="bi bi-exclamation-circle" aria-hidden="true"></i>{rowErrors[row.key]}
                </p>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}

        <footer class="asset-actions">
          <div class="actions-left">
            <button class="btn btn-light" type="button" on:click={addRow} disabled={saving}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              {$locale.assets.addItem}
            </button>
            {#if rows.length === 0}
              <button class="btn btn-outline-secondary" type="button" on:click={completeWithNoAssets} disabled={saving}>
                {$locale.assets.complete}
              </button>
            {/if}
          </div>

          <dl class="actions-summary">
            <div><dt>{$locale.assets.quantity}</dt><dd>{totalQuantity}</dd></div>
            <div><dt>{$locale.assets.totalValue}</dt><dd>{formatMoney(totalValue)}</dd></div>
          </dl>

          <div class="actions-right">
            <button class="btn btn-outline-secondary" type="button" on:click={skip} disabled={saving}>
              {$locale.assets.skip}
            </button>
            <button class="btn btn-light" type="button" on:click={() => save(false, false)} disabled={saving}>
              {saving ? $locale.assets.saving : $locale.assets.save}
            </button>
            <button class="btn btn-primary" type="button" on:click={() => save(true, true)} disabled={saving}>
              <i class="bi bi-arrow-right" aria-hidden="true"></i>
              {saving ? $locale.assets.saving : $locale.assets.saveNext}
            </button>
          </div>
        </footer>
      </div>
    {/if}
  </svelte:fragment>
</PageLayout>

<Modal
  bind:open={quickCreateOpen}
  icon="bi-box-seam"
  title={$locale.assets.newAsset}
  busy={quickCreateSaving}
  closeLabel={$locale.assets.cancel}
  on:close={closeQuickCreate}
>
  <form id="quick-asset-form" on:submit|preventDefault={submitQuickCreate} novalidate>
    {#if quickCreateError}
      <div class="alert alert-danger" role="alert">{quickCreateError}</div>
    {/if}

    <div class="row g-3">
      <div class="col-sm-6">
        <label class="form-label" for="quick-asset-name">{$locale.assets.name}</label>
        <input
          class:is-invalid={quickCreateErrors.name}
          class="form-control"
          id="quick-asset-name"
          bind:value={quickCreateForm.name}
        />
        {#if quickCreateErrors.name}<div class="invalid-feedback">{quickCreateErrors.name}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="quick-asset-category">{$locale.assets.category}</label>
        <div class="modal-control">
          <select class="form-select" id="quick-asset-category" bind:value={quickCreateForm.categoryId}>
            <option value="">{$locale.assets.selectCategory}</option>
            {#each categories as category (category.id)}
              <option value={category.id}>{category.name}</option>
            {/each}
          </select>
          <button
            class="quick-create"
            type="button"
            on:click={openQuickCategory}
            aria-haspopup="dialog"
            aria-label={$locale.assets.newCategory}
            title={$locale.assets.newCategory}
          >
            <i class="bi bi-plus-circle" aria-hidden="true"></i>
          </button>
        </div>

        {#if quickCategoryNotice}
          <div class="quick-notice" role="status">
            <i class="bi bi-check-circle" aria-hidden="true"></i>{quickCategoryNotice}
          </div>
        {/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="quick-asset-unit">{$locale.assets.unit}</label>
        <input
          class="form-control"
          id="quick-asset-unit"
          placeholder={$locale.assets.unitPlaceholder}
          bind:value={quickCreateForm.unit}
        />
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="quick-asset-code">{$locale.assets.code}</label>
        <input class="form-control" id="quick-asset-code" bind:value={quickCreateForm.code} />
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeQuickCreate} disabled={quickCreateSaving}>
      {$locale.assets.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="quick-asset-form" disabled={quickCreateSaving}>
      {quickCreateSaving ? $locale.assets.saving : $locale.assets.save}
    </button>
  </div>
</Modal>

<!-- Create a category without leaving the asset being typed. Opens over the dialog above. -->
<Modal
  bind:open={quickCategoryOpen}
  icon="bi-tags"
  title={$locale.assets.newCategory}
  busy={quickCategorySaving}
  closeLabel={$locale.assets.cancel}
  on:close={closeQuickCategory}
>
  <form id="quick-category-form" on:submit|preventDefault={submitQuickCategory} novalidate>
    {#if quickCategoryError}
      <div class="alert alert-danger" role="alert">{quickCategoryError}</div>
    {/if}

    <div class="row g-3">
      <div class="col-12">
        <label class="form-label" for="quick-category-name">{$locale.assets.name}</label>
        <input
          class:is-invalid={quickCategoryErrors.name}
          class="form-control"
          id="quick-category-name"
          bind:value={quickCategoryForm.name}
        />
        {#if quickCategoryErrors.name}<div class="invalid-feedback">{quickCategoryErrors.name}</div>{/if}
      </div>
      <div class="col-12">
        <label class="form-label" for="quick-category-description">{$locale.assets.description}</label>
        <textarea
          class="form-control"
          id="quick-category-description"
          rows="2"
          bind:value={quickCategoryForm.description}
        ></textarea>
      </div>
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeQuickCategory} disabled={quickCategorySaving}>
      {$locale.assets.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="quick-category-form" disabled={quickCategorySaving}>
      {quickCategorySaving ? $locale.assets.saving : $locale.assets.save}
    </button>
  </div>
</Modal>

<style>
  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0;
    border: 0;
    color: var(--accent-text);
    background: none;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .back-button:hover { color: var(--accent-hover); }
  :global([dir='rtl']) .back-button i { transform: rotate(180deg); }

  .panel-loader { min-height: 14rem; display: grid; place-items: center; }

  /* One column: the apartment's identity, then its items, then the actions.
     The list scrolls inside the panel so the bar stays where the eye expects. */
  .asset-page {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
  }

  /* --- Apartment identity ------------------------------------------------ */

  .asset-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3) var(--space-4);
    flex: 0 0 auto;
    padding: 0.75rem var(--index-gutter, var(--space-4));
    border-block-end: 1px solid var(--border);
    background: var(--surface-muted);
  }

  .context-title { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }

  .context-icon {
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    flex: 0 0 2.25rem;
    border-radius: 0.6rem;
    color: var(--accent-text);
    background: var(--accent-soft);
    font-size: 1.05rem;
  }

  .context-title h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--text-lg);
    font-weight: var(--weight-heavy);
  }

  .context-title p {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.1rem 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .context-title p i { color: var(--text-secondary); }
  .context-divider { color: var(--text-disabled); }

  .context-stats { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; }

  /* A figure with its caption underneath — reads as a label, not a sentence. */
  .stat {
    display: grid;
    gap: 0.05rem;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.2;
  }

  .stat strong {
    color: var(--text-strong);
    font-family: var(--font-data);
    font-size: var(--text-md, 0.95rem);
    font-weight: var(--weight-bold);
  }

  /* --- The items --------------------------------------------------------- */

  .asset-list {
    display: grid;
    /* Cards keep their own height: a grid distributes leftover space into
       auto-sized rows, which would stretch one item over the whole panel. */
    align-content: start;
    gap: var(--space-3);
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: var(--space-4) var(--index-gutter, var(--space-4));
    list-style: none;
  }

  /* One item per card: what it is and how many on the first line, the labelling
     details on the second, and the money it represents on the side. */
  .asset-line {
    position: relative;
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .asset-line.is-invalid { border-color: var(--danger-border); }

  .line-number {
    width: 1.75rem;
    height: 1.75rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--text-secondary);
    background: var(--surface-sunken);
    border: 1px solid var(--border);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }

  /* All seven fields of an item on one line, in the order you fill them in.
     The columns are sized by what each one holds — the asset name needs room, a
     quantity does not — and the minimums are deliberately small: the whole row
     has to keep fitting as the window narrows, and it only gives up and reflows
     at the breakpoint below, where the seven controls would be too narrow to
     read. (The label of a column is allowed to truncate for the same reason: a
     label that wrapped would push its own control out of line with the rest.) */
  .line-fields {
    display: grid;
    grid-template-columns:
      minmax(9rem, 1.9fr)     /* asset */
      minmax(3.25rem, 0.5fr)  /* quantity */
      minmax(5rem, 0.85fr)    /* condition */
      minmax(5rem, 1fr)       /* serial number */
      minmax(5rem, 1fr)       /* model number */
      minmax(4.75rem, 0.85fr) /* unit value */
      minmax(5rem, 1fr);      /* notes */
    /* Start, not end: labels share a line and so do the controls, even though
       the asset field carries a category line under it that the others don't. */
    align-items: start;
    gap: var(--space-2);
    min-width: 0;
  }

  .field { display: grid; gap: 0.2rem; min-width: 0; }
  /* The design system stacks sibling fields with a top margin; in a row they are
     already separated by the grid gap, and the margin would push every field
     after the first off the line. */
  .line-fields > .field { margin-block-start: 0; }

  .field-label {
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* The create-asset shortcut is pinned inside the picker, and the picker carries
     no dropdown arrow of its own — so the button stands in the corner alone and
     the field is one clean row. The words the shortcut used to carry are now its
     tooltip and accessible name, which leaves the asset's own name the width of
     the field. */
  .asset-control,
  .modal-control {
    position: relative;
    display: block;
    min-width: 0;
  }

  /* No chevron on the row's picker: it opens by clicking the field itself. */
  .asset-control .form-select {
    padding-inline-end: 2.4rem;
    background-image: none;
  }

  .quick-create {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: 0.5rem;
    transform: translateY(-50%);
    width: 1.6rem;
    height: 1.6rem;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--accent-text);
    background: none;
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
  }
  .quick-create:hover { color: var(--accent-hover); background: var(--accent-soft); }
  .quick-create:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* The modal's category picker keeps its own chevron, so its shortcut sits
     beyond the arrow rather than in the corner. */
  .modal-control .form-select { padding-inline-end: 4rem; }
  .modal-control .quick-create { inset-inline-end: 2.25rem; }

  .quick-notice {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-block-start: 0.35rem;
    color: var(--success);
    font-size: var(--text-xs);
  }

  /* Level with the controls rather than the labels above them. */
  .line-side {
    display: flex;
    align-items: center;
    align-self: start;
    gap: var(--space-2);
    min-height: var(--control-height);
    margin-block-start: 1.25rem;
  }

  .line-total {
    color: var(--text-strong);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    white-space: nowrap;
  }

  .line-error {
    grid-column: 2 / -1;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0;
    color: var(--danger);
    font-size: var(--text-xs);
  }

  /* --- Empty state ------------------------------------------------------- */

  .assets-empty {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 0.6rem;
    flex: 1 1 auto;
    min-height: 14rem;
    padding: var(--space-6, 2rem);
    text-align: center;
  }

  .assets-empty .empty-icon {
    width: 3rem;
    height: 3rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--accent-text);
    background: var(--accent-soft);
    font-size: 1.2rem;
  }

  .assets-empty p { margin: 0 0 0.35rem; color: var(--text-muted); font-size: var(--text-sm); }

  /* --- Action bar -------------------------------------------------------- */

  /* Everything this page can do, in one place: adding and finishing on the
     leading edge, the figures in the middle, the way out on the trailing edge. */
  .asset-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    flex: 0 0 auto;
    padding: 0.75rem var(--index-gutter, var(--space-4));
    border-block-start: 1px solid var(--border);
    background: var(--surface);
  }

  .actions-left,
  .actions-right { display: inline-flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }

  .actions-summary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-5, 1.5rem);
    margin: 0;
    text-align: end;
  }

  .actions-summary dt {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .actions-summary dd {
    margin: 0.1rem 0 0;
    color: var(--text-strong);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }

  /* --- Narrow screens ---------------------------------------------------- */

  /* Below this the seven columns would be narrower than the labels they carry,
     so the row reflows into as many columns as fit, with the asset picker still
     given double width. */
  @media (max-width: 1023.98px) {
    .line-fields { grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); }
    .asset-field { grid-column: span 2; }
  }

  @media (max-width: 767.98px) {
    /* One field per line: a half-width amount box is harder to use than a
       column that scrolls. */
    .line-fields { grid-template-columns: minmax(0, 1fr); }
    .asset-field { grid-column: auto; }

    .asset-line { grid-template-columns: 1.75rem minmax(0, 1fr); }

    .line-side {
      grid-column: 2;
      margin-block-start: 0;
      justify-content: space-between;
    }

    .line-error { grid-column: 2; }

    .asset-actions,
    .actions-left,
    .actions-right { width: 100%; }

    .actions-summary { order: 3; width: 100%; text-align: start; }
  }

  .alert-link-button {
    margin-inline-start: 0.5rem;
    padding: 0;
    border: 0;
    color: inherit;
    background: none;
    font-weight: var(--weight-bold);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
