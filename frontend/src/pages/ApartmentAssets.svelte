<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';

  import {
    completeApartmentAssets,
    getNextApartment,
    listApartmentAssets,
    listAssetCategories,
    listAssets,
    createAsset,
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

  function emptyQuickCreateForm() {
    return { name: '', categoryId: '', unit: '', code: '' };
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

  function assetFor(row) {
    return assets.find((asset) => asset.id === row.assetId) || null;
  }

  function categoryName(row) {
    return assetFor(row)?.category?.name || '—';
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
      <div class="apartment-context">
        <div class="context-path">
          <span>
            <i class="bi bi-buildings" aria-hidden="true"></i>
            {apartment.floor?.building?.name || '—'}
          </span>
          <span class="context-divider" aria-hidden="true">/</span>
          <span>
            <i class="bi bi-layers" aria-hidden="true"></i>
            {apartment.floor?.name || '—'}
          </span>
          <span class="context-divider" aria-hidden="true">/</span>
          <strong>{apartment.apartmentNumber} · {apartment.name}</strong>
        </div>

        <div class="context-meta">
          <StatusBadge label={setupBadge.label} tone={setupBadge.tone} />
          <span>{rows.length} · {totalQuantity}</span>
        </div>
      </div>

      <DataTable
        loading={false}
        isEmpty={rows.length === 0}
        emptyLabel={$locale.assets.noAssetsYet}
        emptyIcon="bi-box-seam"
        minTableWidth="76rem"
        clipCells={false}
        layout="auto"
        showFooter={true}
      >
        <ActionButton
          slot="empty-action"
          icon="bi-plus-lg"
          label={$locale.assets.addItem}
          on:click={addRow}
        />

        <thead>
          <tr>
            <th>{$locale.assets.assetItem}</th>
            <th>{$locale.assets.category}</th>
            <th>{$locale.assets.quantity}</th>
            <th>{$locale.assets.condition}</th>
            <th>{$locale.assets.serialNumber}</th>
            <th>{$locale.assets.modelNumber}</th>
            <th>{$locale.assets.unitValue}</th>
            <th>{$locale.assets.notes}</th>
            <th class="actions-heading"><span class="visually-hidden">{$locale.assets.actions}</span></th>
          </tr>
        </thead>

        <tbody>
          {#each rows as row, index (row.key)}
            <tr>
              <td class="asset-cell">
                <select
                  class:is-invalid={Boolean(rowErrors[row.key])}
                  class="form-select form-select-sm"
                  value={row.assetId}
                  on:change={(event) => setField(index, 'assetId', event.currentTarget.value)}
                  aria-label={$locale.assets.asset}
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
                <button class="quick-create" type="button" on:click={() => openQuickCreate(row)}>
                  <i class="bi bi-plus-circle" aria-hidden="true"></i>
                  {$locale.assets.createAsset}
                </button>
              </td>
              <td class="category-cell">{categoryName(row)}</td>
              <td>
                <input
                  class="form-control form-control-sm numeric-input"
                  type="number"
                  min="1"
                  step="1"
                  value={row.quantity}
                  on:input={(event) => setField(index, 'quantity', event.currentTarget.value)}
                  aria-label={$locale.assets.quantity}
                />
              </td>
              <td>
                <select
                  class="form-select form-select-sm"
                  value={row.condition}
                  on:change={(event) => setField(index, 'condition', event.currentTarget.value)}
                  aria-label={$locale.assets.condition}
                >
                  {#each conditionKeys as conditionValue (conditionValue)}
                    <option value={conditionValue}>{$locale.assets.conditions[conditionValue]}</option>
                  {/each}
                </select>
              </td>
              <td>
                <input
                  class="form-control form-control-sm"
                  type="text"
                  bind:value={row.serialNumber}
                  placeholder="TV-238392"
                  aria-label={$locale.assets.serialNumber}
                />
              </td>
              <td>
                <input
                  class="form-control form-control-sm"
                  type="text"
                  bind:value={row.modelNumber}
                  aria-label={$locale.assets.modelNumber}
                />
              </td>
              <td>
                <input
                  class="form-control form-control-sm numeric-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.unitValue}
                  on:input={(event) => setField(index, 'unitValue', event.currentTarget.value)}
                  aria-label={$locale.assets.unitValue}
                />
              </td>
              <td>
                <input
                  class="form-control form-control-sm"
                  type="text"
                  bind:value={row.notes}
                  aria-label={$locale.assets.notes}
                />
              </td>
              <td class="actions-cell">
                <button
                  class="icon-button danger"
                  type="button"
                  on:click={() => removeRow(index)}
                  aria-label={$locale.assets.removeItem}
                  title={$locale.assets.removeItem}
                >
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </td>
            </tr>

            {#if rowErrors[row.key]}
              <tr class="row-error">
                <td colspan="9">{rowErrors[row.key]}</td>
              </tr>
            {/if}
          {/each}
        </tbody>

        <div slot="footer" class="entry-footer">
          <div class="entry-footer-actions">
            <button class="btn btn-light btn-sm" type="button" on:click={addRow} disabled={saving}>
              <i class="bi bi-plus-lg" aria-hidden="true"></i>
              {$locale.assets.addItem}
            </button>
            <button class="btn btn-outline-secondary btn-sm" type="button" on:click={skip} disabled={saving}>
              {$locale.assets.skip}
            </button>
            {#if rows.length === 0}
              <button class="btn btn-outline-secondary btn-sm" type="button" on:click={completeWithNoAssets} disabled={saving}>
                {$locale.assets.complete}
              </button>
            {/if}
          </div>

          <div class="entry-footer-totals">
            <span>{$locale.assets.summaryQuantity}: <strong>{totalQuantity}</strong></span>
            <span>{$locale.assets.summaryValue}: <strong>{formatMoney(totalValue)}</strong></span>
          </div>
        </div>
      </DataTable>

      <div class="entry-submit">
        <button class="btn btn-primary" type="button" on:click={() => save(false, false)} disabled={saving}>
          {saving ? $locale.assets.saving : $locale.assets.save}
        </button>
        <button class="btn btn-primary" type="button" on:click={() => save(true, true)} disabled={saving}>
          {saving ? $locale.assets.saving : $locale.assets.saveNext}
        </button>
      </div>
    {/if}
  </svelte:fragment>
</PageLayout>

<Modal
  bind:open={quickCreateOpen}
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
        <select class="form-select" id="quick-asset-category" bind:value={quickCreateForm.categoryId}>
          <option value="">{$locale.assets.selectCategory}</option>
          {#each categories as category (category.id)}
            <option value={category.id}>{category.name}</option>
          {/each}
        </select>
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

<style>
  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0;
    border: 0;
    color: var(--accent);
    background: none;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .back-button:hover { color: var(--accent-hover); }
  :global([dir='rtl']) .back-button i { transform: rotate(180deg); }

  .panel-loader { min-height: 14rem; display: grid; place-items: center; }

  /* Property context: Building / Floor / Apartment, above the entry table. */
  .apartment-context {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    padding: 0.625rem var(--index-gutter, var(--space-4));
    border-block-end: 1px solid var(--border);
    background: var(--surface-muted);
  }

  .context-path {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .context-path i { color: var(--text-muted); margin-inline-end: 0.25rem; }
  .context-path strong { color: var(--text-strong); }
  .context-divider { color: var(--text-disabled); }

  .context-meta {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .asset-cell { min-width: 13rem; }
  .category-cell { color: var(--text-secondary); }
  .numeric-input { max-width: 7rem; }

  .quick-create {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-block-start: 0.25rem;
    padding: 0;
    border: 0;
    color: var(--accent);
    background: none;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }
  .quick-create:hover { color: var(--accent-hover); text-decoration: underline; }

  .row-error :global(td) {
    padding-block: 0.25rem;
    color: var(--danger);
    font-size: var(--text-sm);
    background: var(--danger-soft);
  }

  .entry-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    width: 100%;
  }

  .entry-footer-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .entry-footer-totals {
    display: inline-flex;
    align-items: center;
    gap: 1rem;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .entry-footer-totals strong { color: var(--text-strong); }

  /* Submit actions sit under the table, aligned with the entry footer. */
  .entry-submit {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.75rem var(--index-gutter, var(--space-4));
    border-block-start: 1px solid var(--border);
    background: var(--surface);
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
