<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import TabFilters from '../components/ui/TabFilters.svelte';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ApartmentSpacesEditor from '../components/apartments/ApartmentSpacesEditor.svelte';

  import { activeCurrencies, baseCurrency, loadCurrencies } from '../stores/currency';
  import { formatMoney } from '../utils/formatters';
  import { getFloor, listFloors } from '../services/floors';
  import {
    createApartment,
    deleteApartment,
    listApartments,
    updateApartment
  } from '../services/apartments';
  import {
    language,
    locale,
    translate
  } from '../i18n';

  export let params = {};

  const numberLocales = {
    en: 'en-US',
    fa: 'fa-IR',
    ps: 'ps-AF'
  };
  let floorId = null;
  let routeReady = false;
  let floor = null;
  let loadingFloor = false;
  /* Every floor in the workspace. The create form needs a floor, so on the
     all-apartments list — where the route names none — the form has to ask. */
  let floors = [];
  let loadingFloors = false;
  let formFloorId = '';

  let apartments = [];

  let pagination = {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0
  };

  let search = '';
  let statusFilter = 'all';
  let loading = false;
  let saving = false;

  let errorMessage = '';
  let noticeMessage = '';

  let modalOpen = false;
  let modalError = '';
  let detailsOpen = false;
  let detailsApartment = null;

  let editingId = null;
  let lastSavedApartmentNumber = null;

  let formErrors = {};
  let form = emptyForm();

  function emptyForm() {
    return {
      apartmentNumber: '',
      name: '',
      type: '',
      area: '',
      spaces: [],
      monthlyRent: 0,
      /* The currency the rent is stated in. Empty means the reporting currency,
         which is what the selector starts on. */
      rentCurrency: '',
      status: 'AVAILABLE'
    };
  }

  onMount(async () => {
    // The currency list is supporting data: the page works without it and falls
    // back to the reporting currency.
    loadCurrencies().catch(() => {});
    try {
      await applyRoute(params?.id || null);
      routeReady = true;
    } catch (error) {
      errorMessage = error?.message || $locale.apartments.loadError;
    }
  });

  $: if (routeReady) {
    const routeFloorId = params?.id || null;
    if (routeFloorId !== floorId) {
      applyRoute(routeFloorId);
    }
  }

  async function applyRoute(newFloorId) {
    floorId = newFloorId || null;
    floor = null;
    search = '';
    errorMessage = '';
    noticeMessage = '';
    pagination = { page: 1, pageSize: pagination.pageSize, total: 0, totalPages: 0 };

    if (floorId) {
      await Promise.all([loadFloor(), loadApartments(1)]);
    } else {
      loadingFloor = false;
      await Promise.all([loadFloorOptions(), loadApartments(1)]);
    }
  }

  async function loadFloorOptions() {
    loadingFloors = true;
    try {
      const collected = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await listFloors({ page, pageSize: 100 });
        collected.push(...response.items);
        totalPages = response.pagination.totalPages;
        page += 1;
      } while (page <= totalPages);
      floors = collected;
    } catch { floors = []; }
    finally { loadingFloors = false; }
  }

  function formatNumber(value, currentLanguage) {
    if (value === null || value === undefined || value === '') return '—';
    try {
      return new Intl.NumberFormat(numberLocales[currentLanguage] || 'en-US', { maximumFractionDigits: 2 }).format(value);
    } catch { return String(value); }
  }

  function formatArea(value, currentLanguage) {
    if (value === null || value === undefined || value === '') return '—';
    return `${formatNumber(value, currentLanguage)} m²`;
  }

  async function loadFloor() {
    if (!floorId) { floor = null; loadingFloor = false; return; }
    loadingFloor = true;
    try {
      const response = await getFloor(floorId);
      floor = response.floor;
    } catch (error) {
      floor = null;
      errorMessage = error.status === 404 ? $locale.apartments.notFound : $locale.apartments.loadError;
    } finally { loadingFloor = false; }
  }

  async function loadApartments(page = pagination.page) {
    loading = true;
    errorMessage = '';
    try {
      const filters = { page, pageSize: pagination.pageSize, search: search.trim(), status: statusFilter === 'all' ? undefined : statusFilter };
      if (floorId) filters.floorId = floorId;
      const response = await listApartments(filters);
      apartments = response.items || [];
      pagination = response.pagination;
    } catch (error) {
      errorMessage = error.message || $locale.apartments.loadError;
    } finally { loading = false; }
  }

  /* Numbers are suggested from the floor's own prefix (floor 3 → 300, 301…).
     Only the apartments currently loaded can be checked for collisions, which
     is exactly the page you are on; from the all-apartments list the server is
     what refuses a number already taken on that floor. */
  function nextApartmentNumber(targetFloor = floor) {
    if (!targetFloor) return '';
    const prefix = Number(targetFloor.floorNumber) * 100;
    const used = new Set((floorId ? apartments : []).map((a) => Number(a.apartmentNumber)).filter((v) => Number.isInteger(v)));
    let suffix = 1;
    while (used.has(prefix + suffix)) { suffix += 1; }
    return String(prefix + suffix);
  }

  function validateForm() {
    formErrors = {};
    if (!editingId && !floorId && !formFloorId) formErrors.floorId = translate('apartments.required', { field: $locale.apartments.floor });
    if (!form.apartmentNumber.trim()) formErrors.apartmentNumber = translate('apartments.required', { field: $locale.apartments.apartmentNumber });
    if (!form.name.trim()) formErrors.name = translate('apartments.required', { field: $locale.apartments.name });
    if (!form.type) formErrors.type = translate('apartments.required', { field: $locale.apartments.type });
    if (form.area !== '' && (!Number.isFinite(Number(form.area)) || Number(form.area) < 0)) formErrors.area = translate('apartments.numberRequired', { field: $locale.apartments.area });
    const spaceErrors = {};
    const seenNames = new Set();
    form.spaces.forEach((space, index) => {
      const errors = {};
      const normalizedName = space.name.trim().toLocaleLowerCase('en-US');
      if (!normalizedName) errors.name = $locale.apartments.spaces.nameRequired;
      else if (seenNames.has(normalizedName)) errors.name = $locale.apartments.spaces.duplicate;
      else seenNames.add(normalizedName);
      if (!Number.isInteger(Number(space.quantity)) || Number(space.quantity) < 1) errors.quantity = $locale.apartments.spaces.quantityMinimum;
      if (Object.keys(errors).length) spaceErrors[index] = errors;
    });
    if (Object.keys(spaceErrors).length) formErrors.spaces = spaceErrors;
    if (!Number.isFinite(Number(form.monthlyRent)) || Number(form.monthlyRent) < 0) formErrors.monthlyRent = translate('apartments.numberRequired', { field: $locale.apartments.monthlyRent });
    return Object.keys(formErrors).length === 0;
  }

  function openAddApartment() {
    editingId = null;
    lastSavedApartmentNumber = null;
    modalError = '';
    formErrors = {};
    formFloorId = floorId || '';
    form = { ...emptyForm(), apartmentNumber: nextApartmentNumber(floor), rentCurrency: $baseCurrency };
    modalOpen = true;
    // Re-read the floors so a floor added in another tab shows up in the picker.
    if (!floorId) void loadFloorOptions();
  }

  function handleFloorChoice(event) {
    formFloorId = event.currentTarget.value;
    const chosen = floors.find((option) => option.id === formFloorId) || null;
    if (chosen) form = { ...form, apartmentNumber: nextApartmentNumber(chosen) };
  }

  function openEditApartment(apartment) {
    editingId = apartment.id;
    lastSavedApartmentNumber = null;
    modalError = '';
    formErrors = {};
    form = {
      apartmentNumber: apartment.apartmentNumber,
      name: apartment.name,
      type: apartment.type,
      area: apartment.area === null || apartment.area === undefined ? '' : apartment.area,
      spaces: (apartment.spaces || []).map((space) => ({ name: space.name, quantity: space.quantity })),
      monthlyRent: apartment.monthlyRent,
      rentCurrency: apartment.rentCurrency || '',
      status: apartment.status
    };
    modalOpen = true;
  }

  function closeModal() {
    if (saving) return;
    modalOpen = false;
    editingId = null;
    lastSavedApartmentNumber = null;
    modalError = '';
    formErrors = {};
  }

  function openDetails(apartment) { detailsApartment = apartment; detailsOpen = true; }
  function closeDetails() { detailsOpen = false; detailsApartment = null; }

  function spaceLabel(name) {
    const keyByName = {
      bedroom: 'bedroom', bathroom: 'bathroom', kitchen: 'kitchen', salon: 'salon',
      'living room': 'livingRoom', balcony: 'balcony', 'dining room': 'diningRoom',
      'storage room': 'storageRoom', storage: 'storageRoom', 'guest room': 'guestRoom',
      office: 'office', 'laundry room': 'laundryRoom', terrace: 'terrace', parking: 'parking',
      garden: 'garden', 'servant room': 'servantRoom'
    };
    const key = keyByName[name.trim().toLocaleLowerCase('en-US')];
    return key ? $locale.apartments.spaces.names[key] : name;
  }

  function spaceIcon(name) {
    const normalized = name.trim().toLocaleLowerCase('en-US');
    if (normalized === 'bedroom') return 'bi-door-closed';
    if (normalized === 'bathroom') return 'bi-droplet';
    if (normalized === 'kitchen') return 'bi-cup-hot';
    if (normalized === 'parking') return 'bi-car-front';
    if (normalized === 'balcony' || normalized === 'terrace' || normalized === 'garden') return 'bi-tree';
    return 'bi-grid-3x3-gap';
  }

  function buildApartmentPayload() {
    return {
      apartmentNumber: form.apartmentNumber.trim(),
      name: form.name.trim(),
      type: form.type,
      area: form.area === '' ? null : Number(form.area),
      spaces: form.spaces.map((space) => ({ name: space.name.trim(), quantity: Number(space.quantity) })),
      monthlyRent: Number(form.monthlyRent),
      rentCurrency: form.rentCurrency || $baseCurrency,
      status: form.status
    };
  }

  // Save & continue: create the apartment and go straight to its asset sheet.
  async function saveAndContinue() {
    if (editingId) return;
    if (!validateForm()) return;
    if (!floorId) { modalError = $locale.apartments.notFound; return; }

    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';

    try {
      const response = await createApartment({ floorId, ...buildApartmentPayload() });
      await push(`/apartments/${response.apartment.id}/assets`);
    } catch (error) {
      applyModalError(error);
    } finally {
      saving = false;
    }
  }

  function applyModalError(error) {
    if (error.data?.code === 'APARTMENT_NUMBER_EXISTS') {
      formErrors = { apartmentNumber: $locale.apartments.apartmentNumberExists };
    } else if (error.data?.code === 'FLOOR_NOT_FOUND') {
      modalError = $locale.apartments.notFound;
    } else if (error.data?.errors?.rentCurrency?.length) {
      // A currency the workspace does not trade in belongs under that select.
      formErrors = { ...formErrors, rentCurrency: error.data.errors.rentCurrency[0] };
    } else {
      modalError = error.message;
    }
  }

  async function saveApartment() {
    if (!validateForm()) return;
    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    const payload = buildApartmentPayload();
    try {
      if (editingId) {
        await updateApartment(editingId, payload);
        noticeMessage = $locale.apartments.updated;
        closeModal();
        await loadApartments(pagination.page);
      } else {
        const targetFloorId = floorId || formFloorId;
        if (!targetFloorId) { modalError = translate('apartments.required', { field: $locale.apartments.floor }); return; }
        const response = await createApartment({ floorId: targetFloorId, ...payload });
        noticeMessage = $locale.apartments.saved;
        lastSavedApartmentNumber = response.apartment.apartmentNumber;
        await loadApartments(1);
        form = { ...emptyForm(), apartmentNumber: nextApartmentNumber(floor ?? floors.find((option) => option.id === formFloorId) ?? null), rentCurrency: payload.rentCurrency };
      }
    } catch (error) {
      applyModalError(error);
    } finally { saving = false; }
  }

  async function removeApartment(apartment) {
    if (!window.confirm($locale.apartments.confirmDelete)) return;
    errorMessage = '';
    noticeMessage = '';
    try {
      await deleteApartment(apartment.id);
      noticeMessage = $locale.apartments.deleted;
      const page = apartments.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      await loadApartments(page);
    } catch (error) { errorMessage = error.message; }
  }

  async function goBackToBuilding() {
    if (!floor?.building?.id) return;
    await push(`/buildings/${floor.building.id}`);
  }

  function statusTone(status) {
    switch (status) {
      case 'AVAILABLE': return 'success';
      case 'OCCUPIED': return 'info';
      case 'RESERVED': return 'warning';
      case 'MAINTENANCE': return 'warning';
      default: return 'neutral';
    }
  }

  function statusLabel(status) { return $locale.apartments.statuses[status] || status; }

  $: statusTabs = [
    { key: 'all', label: $locale.common.all },
    { key: 'AVAILABLE', label: $locale.apartments.statuses.AVAILABLE },
    { key: 'OCCUPIED', label: $locale.apartments.statuses.OCCUPIED },
    { key: 'RESERVED', label: $locale.apartments.statuses.RESERVED },
    { key: 'MAINTENANCE', label: $locale.apartments.statuses.MAINTENANCE }
  ];
  function handleStatusChange(event) { statusFilter = event.detail; loadApartments(1); }

  let selectedIds = createSelection();
  $: rowIds = apartments.map((apartment) => apartment.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);
  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }

  $: resultSummary = `${$locale.apartments.totalApartments}: ${pagination.total}`;
  $: pageTitle = floor ? floor.name : $locale.apartments.title;
  // Leading checkbox column — ids of the rows currently rendered.
</script>

<svelte:head>
  <title>{pageTitle} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar bind:search searchPlaceholder={$locale.apartments.search} onSearch={() => loadApartments(1)} addLabel={$locale.apartments.add} onAdd={openAddApartment}>
      <svelte:fragment slot="tabs"><TabFilters tabs={statusTabs} active={statusFilter} on:select={handleStatusChange} /></svelte:fragment>
      <svelte:fragment slot="actions">{#if floor?.building?.id}<button class="toolbar-back" type="button" on:click={goBackToBuilding}><i class="bi bi-arrow-left" aria-hidden="true"></i><span>{$locale.apartments.back}</span></button>{/if}</svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
    {#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable {loading} isEmpty={apartments.length === 0} loadingLabel={$locale.apartments.loading} emptyLabel={$locale.apartments.empty} emptyIcon="bi-door-open" minTableWidth="72rem" showFooter={false}>
      <thead><tr><th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th><th>{$locale.apartments.apartmentNumber}</th><th>{$locale.apartments.name}</th><th>{$locale.apartments.type}</th><th>{$locale.apartments.area}</th><th>{$locale.apartments.bedrooms}</th><th>{$locale.apartments.bathrooms}</th><th class="amount-cell">{$locale.apartments.monthlyRent}</th><th>{$locale.apartments.status}</th><th class="actions-heading">{$locale.buildings.actions}</th></tr></thead>
      <tbody>
        {#each apartments as apartment (apartment.id)}
          <tr class:is-selected={selectedIds.has(apartment.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(apartment.id)} label={$locale.common.selectRow} on:change={() => toggleRow(apartment.id)} /></td>
            <td class="data-cell"><button class="table-link" type="button" on:click={() => openDetails(apartment)}>{apartment.apartmentNumber}</button></td>
            <td>{apartment.name}</td><td>{$locale.apartments.types[apartment.type] || apartment.type}</td><td class="data-cell">{formatArea(apartment.area, $language)}</td><td class="data-cell">{apartment.bedrooms}</td><td class="data-cell">{apartment.bathrooms}</td><td class="amount-cell">{formatMoney(apartment.monthlyRent, apartment.rentCurrency)}</td><td><StatusBadge label={statusLabel(apartment.status)} tone={statusTone(apartment.status)} /></td>
            <td class="actions-cell"><button class="icon-button" type="button" on:click={() => openDetails(apartment)} aria-label={$locale.apartments.spaces.title}><i class="bi bi-eye" aria-hidden="true"></i></button><button class="icon-button" type="button" on:click={() => openEditApartment(apartment)} aria-label={$locale.apartments.edit}><i class="bi bi-pencil" aria-hidden="true"></i></button><button class="icon-button danger" type="button" on:click={() => removeApartment(apartment)} aria-label={$locale.apartments.delete}><i class="bi bi-trash3" aria-hidden="true"></i></button></td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer"><Pagination page={pagination.page} totalPages={pagination.totalPages} previousLabel={$locale.apartments.previous} nextLabel={$locale.apartments.next} label={$locale.apartments.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)} summary={resultSummary} onPage={loadApartments} /></svelte:fragment>
</PageLayout>

<Modal
  bind:open={modalOpen}
  title={editingId ? $locale.apartments.edit : $locale.apartments.add}
  busy={saving}
  size="modal-lg"
  closeLabel={$locale.apartments.cancel}
  on:close={closeModal}
>
  <form id="apartment-form" on:submit|preventDefault={saveApartment} novalidate>
    {#if lastSavedApartmentNumber !== null}
      <div class="alert alert-success" role="status">
        {translate('apartments.savedAnother', { number: lastSavedApartmentNumber })}
      </div>
    {/if}

    {#if modalError}
      <div class="alert alert-danger" role="alert">{modalError}</div>
    {/if}

    <div class="row g-3">
      {#if !editingId && !floorId}
        <!-- Creating from the all-apartments list: a new apartment has to land on
             some floor, so the form asks which one. -->
        <div class="col-12">
          <label class="form-label" for="apartment-floor">{$locale.apartments.floor}</label>
          <select class:is-invalid={formErrors.floorId} class="form-select" id="apartment-floor" bind:value={formFloorId} on:change={handleFloorChoice} disabled={loadingFloors}>
            <option value="">{$locale.apartments.chooseFloor}</option>
            {#each floors as option (option.id)}
              <option value={option.id}>{option.building?.name ? `${option.building.name} · ${option.name}` : option.name}</option>
            {/each}
          </select>
          {#if formErrors.floorId}<div class="invalid-feedback">{formErrors.floorId}</div>{/if}
        </div>
      {/if}
      <div class="col-sm-6">
        <label class="form-label" for="apartment-number">{$locale.apartments.apartmentNumber}</label>
        <input class:is-invalid={formErrors.apartmentNumber} class="form-control" id="apartment-number" bind:value={form.apartmentNumber} />
        {#if formErrors.apartmentNumber}<div class="invalid-feedback">{formErrors.apartmentNumber}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-name">{$locale.apartments.name}</label>
        <input class:is-invalid={formErrors.name} class="form-control" id="apartment-name" bind:value={form.name} />
        {#if formErrors.name}<div class="invalid-feedback">{formErrors.name}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-type">{$locale.apartments.type}</label>
        <select class:is-invalid={formErrors.type} class="form-select" id="apartment-type" bind:value={form.type}>
          <option value="">{$locale.apartments.selectType}</option>
          {#each Object.keys($locale.apartments.types) as typeValue (typeValue)}
            <option value={typeValue}>{$locale.apartments.types[typeValue]}</option>
          {/each}
        </select>
        {#if formErrors.type}<div class="invalid-feedback">{formErrors.type}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-area">{$locale.apartments.area}</label>
        <input class:is-invalid={formErrors.area} class="form-control" id="apartment-area" type="number" min="0" step="0.01" bind:value={form.area} />
        {#if formErrors.area}<div class="invalid-feedback">{formErrors.area}</div>{/if}
      </div>
      <div class="col-sm-6">
        <div class="row g-2">
          <div class="col-7">
            <label class="form-label" for="apartment-rent">{$locale.apartments.monthlyRent}</label>
            <input class:is-invalid={formErrors.monthlyRent} class="form-control" id="apartment-rent" type="number" min="0" step="0.01" bind:value={form.monthlyRent} />
          </div>
          <div class="col-5">
            <label class="form-label" for="apartment-rent-currency">{$locale.apartments.rentCurrency}</label>
            <select class:is-invalid={formErrors.rentCurrency} class="form-select" id="apartment-rent-currency" bind:value={form.rentCurrency}>
              {#each $activeCurrencies as currency (currency.id)}
                <option value={currency.code}>{currency.code}</option>
              {/each}
              {#if !$activeCurrencies.length}
                <option value={$baseCurrency}>{$baseCurrency}</option>
              {/if}
            </select>
          </div>
        </div>
        {#if formErrors.monthlyRent}<div class="invalid-feedback">{formErrors.monthlyRent}</div>{/if}
        {#if formErrors.rentCurrency}<div class="invalid-feedback">{formErrors.rentCurrency}</div>{/if}
      </div>
      <div class="col-sm-6">
        <label class="form-label" for="apartment-status">{$locale.apartments.status}</label>
        <select class="form-select" id="apartment-status" bind:value={form.status}>
          {#each Object.keys($locale.apartments.statuses) as statusValue (statusValue)}
            <option value={statusValue}>{$locale.apartments.statuses[statusValue]}</option>
          {/each}
        </select>
      </div>
      <ApartmentSpacesEditor bind:spaces={form.spaces} errors={formErrors.spaces || {}} />
    </div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>
      {lastSavedApartmentNumber !== null ? $locale.apartments.done : $locale.apartments.cancel}
    </button>
    {#if !editingId}
      <button class="btn btn-light save-continue" type="button" on:click={saveAndContinue} disabled={saving}>
        <span>{$locale.assets.saveContinue}</span>
        <i class="bi bi-arrow-right" aria-hidden="true"></i>
      </button>
    {/if}
    <button class="btn btn-primary" type="submit" form="apartment-form" disabled={saving}>
      {saving ? $locale.apartments.loading : editingId ? $locale.apartments.update : lastSavedApartmentNumber !== null ? $locale.apartments.another : $locale.apartments.save}
    </button>
  </div>
</Modal>

<Modal bind:open={detailsOpen} title={detailsApartment ? `${detailsApartment.apartmentNumber} · ${detailsApartment.name}` : ''} closeLabel={$locale.common.close} on:close={closeDetails}>
  {#if detailsApartment}
    <div class="details-rent">
      <span>{$locale.apartments.monthlyRent}</span>
      <strong>{formatMoney(detailsApartment.monthlyRent, detailsApartment.rentCurrency)}</strong>
    </div>
    <section aria-labelledby="apartment-spaces-details">
      <h3 class="details-heading" id="apartment-spaces-details">{$locale.apartments.spaces.title}</h3>
      {#if detailsApartment.spaces?.length}
        <div class="details-spaces">
          {#each detailsApartment.spaces as space (space.id)}
            <div class="details-space">
              <span class="space-name"><i class={`bi ${spaceIcon(space.name)}`} aria-hidden="true"></i>{spaceLabel(space.name)}</span>
              <strong>{space.quantity}</strong>
            </div>
          {/each}
        </div>
      {:else}
        <p class="details-empty">{$locale.apartments.spaces.empty}</p>
      {/if}
    </section>
  {/if}
  <div slot="footer"><button class="btn btn-light" type="button" on:click={closeDetails}>{$locale.common.close}</button></div>
</Modal>

<style>
  .toolbar-back { display: inline-flex; align-items: center; gap: .4rem; min-height: var(--control-height); padding: 0 .75rem; border: 1px solid var(--border); border-radius: var(--control-radius); color: var(--text-secondary); background: var(--surface); font-size: var(--text-sm); font-weight: var(--weight-semibold); }
  .toolbar-back:hover { color: var(--accent); border-color: var(--accent-soft-border); background: var(--accent-soft); }
  :global([dir='rtl']) .toolbar-back i { transform: rotate(180deg); }
  .panel-loader { min-height: 14rem; display: grid; place-items: center; }

  .save-continue {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  :global([dir='rtl']) .save-continue i { transform: rotate(180deg); }
  .details-rent { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; margin-block-end: .9rem; padding: .65rem .75rem; border: 1px solid var(--border); border-radius: .6rem; background: var(--surface-subtle); }
  .details-rent span { color: var(--text-secondary); font-size: .85rem; }
  .details-rent strong { font-size: .95rem; }
  .details-heading { margin: 0 0 .75rem; font-size: .95rem; font-weight: 700; }
  .details-spaces { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
  .details-space { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .65rem .75rem; border: 1px solid var(--border); border-radius: .6rem; background: var(--surface-subtle); }
  .space-name { display: inline-flex; align-items: center; gap: .5rem; min-width: 0; }
  .space-name i { color: var(--accent); }
  .details-empty { margin: 0; color: var(--text-muted); }
  @media (max-width: 575px) { .details-spaces { grid-template-columns: 1fr; } }
</style>
