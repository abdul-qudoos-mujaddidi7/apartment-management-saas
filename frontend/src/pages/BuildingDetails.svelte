<script>
  import PageHeader from '../components/ui/PageHeader.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import { formatDate as formatShamsiDate } from '../utils/formatters';
  import { push } from 'svelte-spa-router';
  import { api } from '../services/api';

  import { createFloor, deleteFloor, listFloors, updateFloor } from '../services/floors';
  import { language, locale, translate } from '../i18n';

  export let params = {};

  let buildingId = null;

  const dateLocales = { en: 'en-US', fa: 'fa-IR', ps: 'ps-AF' };
  let building = null;
  let loadingBuilding = false;
  let floors = [];
  let loadingFloors = false;
  let errorMessage = '';
  let noticeMessage = '';
  let modalOpen = false;
  let modalError = '';
  let editingId = null;
  let saving = false;
  let lastSavedFloorNumber = null;
  let formErrors = {};
  let form = { floorNumber: 1, name: '' };

  $: if (params.id && params.id !== buildingId) {
    buildingId = params.id;
    building = null;
    floors = [];
    errorMessage = '';
    noticeMessage = '';
    modalOpen = false;
    void refresh();
  }

  // The current language is passed in so the template re-renders when it changes.
  function formatDate(value, currentLanguage) {
    return formatShamsiDate(value);
  }

  async function refresh() {
    await Promise.all([loadBuilding(), loadFloors()]);
  }

  async function loadBuilding() {
    const requestedId = buildingId;
    loadingBuilding = true;
    try {
      const response = await api.get(`/buildings/${requestedId}`);
      if (requestedId !== buildingId) return;
      building = response.building;
    } catch (error) {
      if (requestedId !== buildingId) return;
      building = null;
      errorMessage = error.status === 404 ? $locale.floors.notFound : $locale.floors.loadError;
    } finally {
      if (requestedId === buildingId) loadingBuilding = false;
    }
  }

  // A building may have any number of floors, so pages are collected until all are loaded.
  async function loadFloors() {
    const requestedId = buildingId;
    loadingFloors = true;
    try {
      const collected = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await listFloors({ page, pageSize: 100, buildingId: requestedId });
        collected.push(...response.items);
        totalPages = response.pagination.totalPages;
        page += 1;
      } while (page <= totalPages);
      if (requestedId !== buildingId) return;
      floors = collected;
    } catch (error) {
      if (requestedId !== buildingId) return;
      errorMessage = error.message;
    } finally {
      if (requestedId === buildingId) loadingFloors = false;
    }
  }

  function nextFloorNumber() {
    return floors.reduce((highest, floor) => Math.max(highest, floor.floorNumber), 0) + 1;
  }

  function validateForm() {
    formErrors = {};
    if (!form.name.trim()) formErrors.name = translate('floors.required', { field: $locale.floors.name });
    if (!Number.isInteger(Number(form.floorNumber)) || Number(form.floorNumber) < 1) {
      formErrors.floorNumber = translate('floors.numberRequired', { field: $locale.floors.floorNumber });
    }
    return Object.keys(formErrors).length === 0;
  }

  function openApartments(floor) {
    push(`/floors/${floor.id}`);
  }

  function openAddFloor() {
    editingId = null;
    lastSavedFloorNumber = null;
    modalError = '';
    formErrors = {};
    form = { floorNumber: nextFloorNumber(), name: '' };
    modalOpen = true;
  }

  function openEditFloor(floor) {
    editingId = floor.id;
    lastSavedFloorNumber = null;
    modalError = '';
    formErrors = {};
    form = { floorNumber: floor.floorNumber, name: floor.name };
    modalOpen = true;
  }

  function closeModal() {
    if (saving) return;
    modalOpen = false;
    editingId = null;
    lastSavedFloorNumber = null;
    modalError = '';
    formErrors = {};
  }

  async function saveFloor() {
    if (!validateForm()) return;

    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    const payload = { floorNumber: Number(form.floorNumber), name: form.name.trim() };

    try {
      if (editingId) {
        await updateFloor(editingId, payload);
        noticeMessage = $locale.floors.updated;
        closeModal();
      } else {
        const response = await createFloor({ buildingId, ...payload });
        noticeMessage = $locale.floors.saved;
        lastSavedFloorNumber = response.floor.floorNumber;
        await refresh();
        form = { floorNumber: nextFloorNumber(), name: '' };
      }
    } catch (error) {
      if (error.data?.code === 'FLOOR_NUMBER_EXISTS') formErrors = { floorNumber: $locale.floors.floorNumberExists };
      else modalError = error.message;
    } finally {
      saving = false;
    }
  }

  async function removeFloor(floor) {
    if (!window.confirm($locale.floors.confirmDelete)) return;

    errorMessage = '';
    noticeMessage = '';
    try {
      await deleteFloor(floor.id);
      noticeMessage = $locale.floors.deleted;
      await refresh();
    } catch (error) {
      errorMessage = error.message;
    }
  }
</script>

<svelte:head><title>{building ? building.name : $locale.floors.title} | {$locale.common.apartmentPro}</title></svelte:head>

<PageHeader>
  <svelte:fragment slot="actions">
    <button class="back-button" type="button" on:click={() => push('/buildings')}>
      <i class="bi bi-arrow-left" aria-hidden="true"></i>
      {$locale.buildings.back}
    </button>
    <ActionButton icon="bi-plus-lg" label={$locale.floors.add} on:click={openAddFloor} />
  </svelte:fragment>
</PageHeader>

{#if errorMessage}<div class="alert alert-danger" role="alert">{errorMessage}</div>{/if}
{#if noticeMessage}<div class="alert alert-success" role="status">{noticeMessage}</div>{/if}

{#if loadingBuilding}
  <div class="panel-loader"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">{$locale.floors.loading}</span></div></div>
{:else if building}
  <section class="building-summary" aria-label={$locale.buildings.information}>
    <div class="info-grid">
      <div><span class="info-label">{$locale.buildings.code}</span><strong>{building.code}</strong></div>
      <div><span class="info-label">{$locale.buildings.address}</span><strong>{building.address || '—'}</strong></div>
      <div>
        <span class="info-label">{$locale.buildings.status}</span>
        <StatusBadge
          label={building.status === 'ACTIVE' ? $locale.buildings.active : $locale.buildings.inactive}
          tone={building.status === 'ACTIVE' ? 'success' : 'neutral'}
        />
      </div>
      <div><span class="info-label">{$locale.buildings.created}</span><strong>{formatDate(building.createdAt, $language)}</strong></div>
    </div>

    <div class="stat-grid">
      <article class="stat-tile"><span class="stat-icon blue"><i class="bi bi-layers" aria-hidden="true"></i></span><div><p>{$locale.buildings.totalFloors}</p><strong>{building.totalFloors}</strong></div></article>
      <article class="stat-tile"><span class="stat-icon plum"><i class="bi bi-door-open" aria-hidden="true"></i></span><div><p>{$locale.buildings.totalApartments}</p><strong>0</strong><span class="stat-note">{$locale.buildings.apartmentsComingSoon}</span></div></article>
    </div>
  </section>

  <DataTable
    loading={loadingFloors}
    isEmpty={floors.length === 0}
    loadingLabel={$locale.floors.loading}
    emptyLabel={$locale.floors.empty}
    emptyIcon="bi-layers"
    minTableWidth="32rem"
  >
    <div slot="toolbar" class="panel-header">
      <div><h2>{$locale.floors.title}</h2><p>{$locale.floors.description}</p></div>
    </div>

    <thead><tr><th>{$locale.floors.floorNumber}</th><th>{$locale.floors.name}</th><th>{$locale.floors.apartments}</th><th class="actions-heading"><span class="visually-hidden">{$locale.floors.edit}</span></th></tr></thead>

    <tbody>
      {#each floors as floor (floor.id)}
        <tr>
          <td class="floor-number">{floor.floorNumber}</td>
          <td class="floor-name"><button class="link-button" type="button" on:click={() => openApartments(floor)}>{floor.name}</button></td>
          <td class="apartments-cell"><button class="link-button muted" type="button" on:click={() => openApartments(floor)}>{$locale.apartments.title}</button></td>
          <td class="actions-cell">
            <button class="icon-button" type="button" on:click={() => openEditFloor(floor)} aria-label={$locale.floors.edit}><i class="bi bi-pencil" aria-hidden="true"></i></button>
            <button class="icon-button danger" type="button" on:click={() => removeFloor(floor)} aria-label={$locale.floors.delete}><i class="bi bi-trash3" aria-hidden="true"></i></button>
          </td>
        </tr>
      {/each}
    </tbody>
  </DataTable>
{/if}

<Modal
  bind:open={modalOpen}
  title={editingId ? $locale.floors.edit : $locale.floors.add}
  busy={saving}
  closeLabel={$locale.floors.cancel}
  on:close={closeModal}
>
  <form id="floor-form" on:submit|preventDefault={saveFloor} novalidate>
    {#if lastSavedFloorNumber !== null}<div class="alert alert-success" role="status">{translate('floors.savedAnother', { number: lastSavedFloorNumber })}</div>{/if}
    {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}

    <div class="mb-3"><label class="form-label" for="floor-number">{$locale.floors.floorNumber}</label><input class:is-invalid={formErrors.floorNumber} class="form-control" id="floor-number" type="number" min="1" bind:value={form.floorNumber} />{#if formErrors.floorNumber}<div class="invalid-feedback">{formErrors.floorNumber}</div>{/if}</div>
    <div class="mb-3"><label class="form-label" for="floor-name">{$locale.floors.name}</label><input class:is-invalid={formErrors.name} class="form-control" id="floor-name" bind:value={form.name} />{#if formErrors.name}<div class="invalid-feedback">{formErrors.name}</div>{/if}</div>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal}>{lastSavedFloorNumber !== null ? $locale.floors.done : $locale.floors.cancel}</button>
    <button class="btn btn-primary" type="submit" form="floor-form" disabled={saving}>{saving ? $locale.floors.loading : editingId ? $locale.floors.update : lastSavedFloorNumber !== null ? $locale.floors.another : $locale.floors.save}</button>
  </div>
</Modal>

<style>
  .back-button { display: inline-flex; align-items: center; gap: .4rem; padding: 0; border: 0; color: var(--accent); background: none; font-size: .8rem; font-weight: 650; }
  .back-button:hover { color: var(--accent-hover); }
  :global([dir='rtl']) .back-button i { transform: rotate(180deg); }

  .panel-loader { min-height: 14rem; display: grid; place-items: center; }

  .building-summary { display: flex; align-items: center; justify-content: space-between; gap: 1.35rem; flex-wrap: wrap; padding: 1.25rem 1.4rem; margin-bottom: 1.5rem; border: 1px solid var(--border); border-radius: .75rem; background: var(--surface); }
  .info-grid { flex: 1 1 22rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 1rem 1.5rem; }
  .info-grid > div { display: grid; gap: .3rem; justify-items: start; }
  .info-label { color: var(--text-muted); font-size: .67rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .info-grid strong { color: var(--text-strong); font-size: .87rem; }

  .stat-grid { display: flex; gap: 1rem; flex-wrap: wrap; }
  .stat-tile { min-width: 11.5rem; display: flex; align-items: center; gap: .8rem; padding: 1rem; border: 1px solid var(--border); border-radius: .7rem; background: var(--surface-muted); }
  .stat-icon { width: 2.3rem; height: 2.3rem; flex: 0 0 2.3rem; display: grid; place-items: center; border-radius: .55rem; font-size: 1.05rem; }
  .blue { color: var(--accent); background: var(--accent-soft); }
  .plum { color: #8f3d78; background: #f6ecf3; }
  .stat-tile p { margin: 0; color: var(--text-muted); font-size: .72rem; font-weight: 600; }
  .stat-tile strong { display: block; color: var(--text-strong); font-size: 1.3rem; font-weight: 700; letter-spacing: -.04em; }
  .stat-note { color: var(--text-muted); font-size: .65rem; }

  .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .panel-header h2 { margin: 0; color: var(--text-strong); font-size: 1.02rem; letter-spacing: -.02em; }
  .panel-header p { margin: .25rem 0 0; color: var(--text-muted); font-size: .78rem; }

  .link-button { padding: 0; border: 0; color: var(--text-strong); background: none; font-weight: 700; text-align: start; }
  .link-button:hover { color: var(--accent-hover); text-decoration: underline; }
  .link-button.muted { color: var(--accent); font-size: .79rem; font-weight: 600; }

  .apartments-cell { color: var(--text-muted); }
</style>
