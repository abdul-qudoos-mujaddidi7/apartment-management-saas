<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';

  import PageLayout from '../components/ui/PageLayout.svelte';
  import TabFilters from '../components/ui/TabFilters.svelte';
  import ActionButton from '../components/ui/ActionButton.svelte';
  import PageToolbar from '../components/ui/PageToolbar.svelte';
  import DataTable from '../components/ui/DataTable.svelte';
  import Checkbox from '../components/ui/Checkbox.svelte';
  import Pagination from '../components/ui/Pagination.svelte';
  import Modal from '../components/ui/Modal.svelte';
  import StatusBadge from '../components/ui/StatusBadge.svelte';

  import {
    createTenant,
    deleteTenant,
    listTenants,
    updateTenant
  } from '../services/tenants';
  import { locale, translate } from '../i18n';
  import { debounce } from '../utils/debounce';
  import { createSelection, isAllSelected, isSomeSelected, toggleAllSelected, toggleSelected } from '../utils/selection';

  let tenants = [];
  let pagination = { page: 1, pageSize: 10, total: 0, totalPages: 0 };
  let search = '';
  let loading = false;
  let errorMessage = '';
  let noticeMessage = '';
  let requestToken = 0;

  // --- Tab filter state ---
  let statusFilter = 'all';
  $: statusTabs = [
    { key: 'all', label: $locale.common.all },
    { key: 'ACTIVE', label: $locale.tenants.active },
    { key: 'INACTIVE', label: $locale.tenants.inactive }
  ];

  function handleTabChange(e) {
    statusFilter = e.detail;
    loadTenants(1);
  }

  let modalOpen = false;
  let saving = false;
  let editingId = null;
  let formErrors = {};
  let modalError = '';
  let form = emptyForm();

  function emptyForm() {
    return {
      firstName: '',
      lastName: '',
      phone: '',
      alternatePhone: '',
      email: '',
      nationalId: '',
      address: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      notes: '',
      status: 'ACTIVE'
    };
  }

  const debouncedSearch = debounce(() => loadTenants(1), 300);
  onDestroy(() => debouncedSearch.cancel());
  function handleSearch() { debouncedSearch(); }

  onMount(() => loadTenants(1));

  async function loadTenants(page = pagination.page) {
    const token = ++requestToken;
    loading = true;
    errorMessage = '';

    try {
      const response = await listTenants({
        page,
        pageSize: pagination.pageSize,
        search: search.trim(),
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      if (token !== requestToken) return;

      tenants = response.items;
      pagination = response.pagination;
    } catch (error) {
      if (token !== requestToken) return;
      errorMessage = error.message;
    } finally {
      if (token === requestToken) loading = false;
    }
  }

  function validateForm() {
    formErrors = {};

    if (!form.firstName.trim()) {
      formErrors.firstName = translate('tenants.required', {
        field: $locale.tenants.firstName
      });
    }

    if (!form.lastName.trim()) {
      formErrors.lastName = translate('tenants.required', {
        field: $locale.tenants.lastName
      });
    }

    if (!form.phone.trim() || form.phone.trim().length < 3) {
      formErrors.phone = $locale.tenants.invalidPhone;
    }

    if (
      form.email.trim() &&
      !/^\S+@\S+\.\S+$/.test(form.email.trim())
    ) {
      formErrors.email = $locale.tenants.invalidEmail;
    }

    return Object.keys(formErrors).length === 0;
  }

  function openCreate() {
    editingId = null;
    form = emptyForm();
    formErrors = {};
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    modalOpen = true;
  }

  function openEdit(tenant) {
    editingId = tenant.id;
    form = {
      ...emptyForm(),
      ...tenant
    };
    formErrors = {};
    modalError = '';
    errorMessage = '';
    noticeMessage = '';
    modalOpen = true;
  }

  function closeModal() {
    if (saving) return;
    modalOpen = false;
    editingId = null;
    formErrors = {};
    modalError = '';
  }

  function normalizedPayload() {
    const payload = {
      ...form
    };

    const nullableFields = [
      'alternatePhone',
      'email',
      'nationalId',
      'address',
      'emergencyContactName',
      'emergencyContactPhone',
      'notes'
    ];

    for (const key of nullableFields) {
      payload[key] = payload[key]?.trim() || null;
    }

    payload.firstName = payload.firstName.trim();
    payload.lastName = payload.lastName.trim();
    payload.phone = payload.phone.trim();

    return payload;
  }

  function applyServerErrors(errors) {
    formErrors = Object.fromEntries(
      Object.entries(errors || {}).map(
        ([key, messages]) => [
          key,
          messages?.[0] || ''
        ]
      )
    );
  }

  async function saveTenant() {
    if (!validateForm()) {
      return;
    }

    saving = true;
    modalError = '';
    errorMessage = '';
    noticeMessage = '';

    try {
      if (editingId) {
        await updateTenant(
          editingId,
          normalizedPayload()
        );

        noticeMessage = $locale.tenants.updated;
      } else {
        await createTenant(
          normalizedPayload()
        );

        noticeMessage = $locale.tenants.saved;
      }

      modalOpen = false;
      editingId = null;

      await loadTenants(1);
    } catch (error) {
      if (error.data?.errors) {
        applyServerErrors(error.data.errors);
        modalError = error.message;
      } else {
        modalError = error.message;
      }
    } finally {
      saving = false;
    }
  }

  async function removeTenant(tenant) {
    if (!window.confirm($locale.tenants.confirmDelete)) {
      return;
    }

    errorMessage = '';
    noticeMessage = '';

    try {
      await deleteTenant(tenant.id);

      noticeMessage = $locale.tenants.deleted;

      const page =
        tenants.length === 1 &&
        pagination.page > 1
          ? pagination.page - 1
          : pagination.page;

      await loadTenants(page);
    } catch (error) {
      errorMessage = error.message;
    }
  }

  function statusTone(status) {
    return status === 'ACTIVE' ? 'success' : 'neutral';
  }

  function statusLabel(status) {
    return status === 'ACTIVE' ? $locale.tenants.active : $locale.tenants.inactive;
  }

  $: resultSummary = `${$locale.tenants.totalTenants}: ${pagination.total}`;
  // Leading checkbox column — ids of the rows currently rendered.
  let selectedIds = createSelection();
  $: rowIds = tenants.map((tenant) => tenant.id);
  $: allRowsSelected = isAllSelected(selectedIds, rowIds);
  $: someRowsSelected = isSomeSelected(selectedIds, rowIds);

  function toggleRow(id) { selectedIds = toggleSelected(selectedIds, id); }
  function toggleAllRows() { selectedIds = toggleAllSelected(selectedIds, rowIds); }
</script>

<svelte:head>
  <title>{$locale.tenants.title} | {$locale.common.apartmentPro}</title>
</svelte:head>

<PageLayout>
  <svelte:fragment slot="toolbar">
    <PageToolbar
      bind:search
      searchPlaceholder={$locale.tenants.search}
      onSearch={handleSearch}
      addLabel={$locale.tenants.add}
      onAdd={openCreate}
    >
      <svelte:fragment slot="tabs">
        <TabFilters tabs={statusTabs} active={statusFilter} on:select={handleTabChange} />
      </svelte:fragment>
    </PageToolbar>
  </svelte:fragment>

  <svelte:fragment slot="alerts">
    {#if errorMessage}
      <div class="alert alert-danger" role="alert">{errorMessage}</div>
    {/if}
    {#if noticeMessage}
      <div class="alert alert-success" role="status">{noticeMessage}</div>
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="content">
    <DataTable
      {loading}
      isEmpty={tenants.length === 0}
      loadingLabel={$locale.tenants.loading}
      emptyLabel={$locale.tenants.empty}
      emptyIcon="bi-people"
      minTableWidth="46rem"
      showFooter={!loading && tenants.length > 0}
    >
      <ActionButton
        slot="empty-action"
        icon="bi-plus-lg"
        label={$locale.tenants.add}
        on:click={openCreate}
      />

      <thead>
        <tr>
          <th class="select-column"><Checkbox checked={allRowsSelected} indeterminate={someRowsSelected} label={$locale.common.selectAll} on:change={toggleAllRows} /></th>
          <th>{$locale.tenants.fullName}</th>
          <th>{$locale.tenants.phone}</th>
          <th>{$locale.tenants.email}</th>
          <th>{$locale.tenants.nationalId}</th>
          <th>{$locale.tenants.status}</th>
          <th class="actions-heading"><span class="visually-hidden">{$locale.tenants.edit}</span></th>
        </tr>
      </thead>

      <tbody>
        {#each tenants as tenant (tenant.id)}
          <tr class:is-selected={selectedIds.has(tenant.id)}>
            <td class="select-column"><Checkbox checked={selectedIds.has(tenant.id)} label={$locale.common.selectRow} on:change={() => toggleRow(tenant.id)} /></td>
            <td class="tenant-name">
              <button class="table-link" type="button" on:click={() => push(`/tenants/${tenant.id}`)}>
                {tenant.firstName} {tenant.lastName}
              </button>
            </td>
            <td class="data-cell">{tenant.phone}</td>
            <td>{tenant.email || '—'}</td>
            <td class="data-cell">{tenant.nationalId || '—'}</td>
            <td>
              <StatusBadge label={statusLabel(tenant.status)} tone={statusTone(tenant.status)} />
            </td>
            <td class="actions-cell">
              <button class="icon-button" type="button" on:click={() => push(`/tenants/${tenant.id}`)} aria-label={$locale.tenants.profile}>
                <i class="bi bi-person-vcard" aria-hidden="true"></i>
              </button>
              <button class="icon-button" type="button" on:click={() => openEdit(tenant)} aria-label={$locale.tenants.edit}>
                <i class="bi bi-pencil" aria-hidden="true"></i>
              </button>
              <button class="icon-button danger" type="button" on:click={() => removeTenant(tenant)} aria-label={$locale.tenants.delete}>
                <i class="bi bi-trash3" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </DataTable>
  </svelte:fragment>

  <svelte:fragment slot="footer">
    <Pagination
      page={pagination.page}
      totalPages={pagination.totalPages}
      previousLabel={$locale.tenants.previous}
      nextLabel={$locale.tenants.next}
      label={$locale.tenants.page.replace('{page}', pagination.page).replace('{totalPages}', pagination.totalPages)}
      summary={resultSummary}
      onPage={loadTenants}
    />
  </svelte:fragment>
</PageLayout>

<Modal
  bind:open={modalOpen}
  title={editingId ? $locale.tenants.edit : $locale.tenants.add}
  busy={saving}
  size="modal-lg"
  closeLabel={$locale.tenants.cancel}
  on:close={closeModal}
>
  <form id="tenant-form" on:submit|preventDefault={saveTenant} novalidate>
    {#if modalError}
      <div class="alert alert-danger" role="alert">{modalError}</div>
    {/if}

    <fieldset>
      <legend class="section-label">{$locale.tenants.fullName}</legend>

      <div class="row g-3">
        <div class="col-sm-6">
          <label class="form-label" for="tenant-first-name">{$locale.tenants.firstName}</label>
          <input
            class:is-invalid={formErrors.firstName}
            class="form-control"
            id="tenant-first-name"
            autocomplete="given-name"
            bind:value={form.firstName}
          />
          {#if formErrors.firstName}
            <div class="invalid-feedback">{formErrors.firstName}</div>
          {/if}
        </div>

        <div class="col-sm-6">
          <label class="form-label" for="tenant-last-name">{$locale.tenants.lastName}</label>
          <input
            class:is-invalid={formErrors.lastName}
            class="form-control"
            id="tenant-last-name"
            autocomplete="family-name"
            bind:value={form.lastName}
          />
          {#if formErrors.lastName}
            <div class="invalid-feedback">{formErrors.lastName}</div>
          {/if}
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend class="section-label">{$locale.tenants.phone}</legend>

      <div class="row g-3">
        <div class="col-sm-6">
          <label class="form-label" for="tenant-phone">{$locale.tenants.phone}</label>
          <input
            class:is-invalid={formErrors.phone}
            class="form-control"
            id="tenant-phone"
            type="tel"
            autocomplete="tel"
            bind:value={form.phone}
          />
          {#if formErrors.phone}
            <div class="invalid-feedback">{formErrors.phone}</div>
          {/if}
        </div>

        <div class="col-sm-6">
          <label class="form-label" for="tenant-alt-phone">{$locale.tenants.alternatePhone}</label>
          <input
            class:is-invalid={formErrors.alternatePhone}
            class="form-control"
            id="tenant-alt-phone"
            type="tel"
            bind:value={form.alternatePhone}
          />
          {#if formErrors.alternatePhone}
            <div class="invalid-feedback">{formErrors.alternatePhone}</div>
          {/if}
        </div>

        <div class="col-sm-6">
          <label class="form-label" for="tenant-email">{$locale.tenants.email}</label>
          <input
            class:is-invalid={formErrors.email}
            class="form-control"
            id="tenant-email"
            type="email"
            autocomplete="email"
            bind:value={form.email}
          />
          {#if formErrors.email}
            <div class="invalid-feedback">{formErrors.email}</div>
          {/if}
        </div>

        <div class="col-sm-6">
          <label class="form-label" for="tenant-national-id">{$locale.tenants.nationalId}</label>
          <input
            class:is-invalid={formErrors.nationalId}
            class="form-control"
            id="tenant-national-id"
            bind:value={form.nationalId}
          />
          {#if formErrors.nationalId}
            <div class="invalid-feedback">{formErrors.nationalId}</div>
          {/if}
        </div>

        <div class="col-12">
          <label class="form-label" for="tenant-address">{$locale.tenants.address}</label>
          <input
            class:is-invalid={formErrors.address}
            class="form-control"
            id="tenant-address"
            autocomplete="street-address"
            bind:value={form.address}
          />
          {#if formErrors.address}
            <div class="invalid-feedback">{formErrors.address}</div>
          {/if}
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend class="section-label">{$locale.tenants.emergencyContact}</legend>

      <div class="row g-3">
        <div class="col-sm-6">
          <label class="form-label" for="tenant-emergency-name">{$locale.tenants.emergencyContactName}</label>
          <input
            class:is-invalid={formErrors.emergencyContactName}
            class="form-control"
            id="tenant-emergency-name"
            bind:value={form.emergencyContactName}
          />
          {#if formErrors.emergencyContactName}
            <div class="invalid-feedback">{formErrors.emergencyContactName}</div>
          {/if}
        </div>

        <div class="col-sm-6">
          <label class="form-label" for="tenant-emergency-phone">{$locale.tenants.emergencyContactPhone}</label>
          <input
            class:is-invalid={formErrors.emergencyContactPhone}
            class="form-control"
            id="tenant-emergency-phone"
            type="tel"
            bind:value={form.emergencyContactPhone}
          />
          {#if formErrors.emergencyContactPhone}
            <div class="invalid-feedback">{formErrors.emergencyContactPhone}</div>
          {/if}
        </div>

        <div class="col-sm-6">
          <label class="form-label" for="tenant-status">{$locale.tenants.status}</label>
          <select class="form-select" id="tenant-status" bind:value={form.status}>
            <option value="ACTIVE">{$locale.tenants.active}</option>
            <option value="INACTIVE">{$locale.tenants.inactive}</option>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label" for="tenant-notes">{$locale.tenants.notes}</label>
          <textarea
            class:is-invalid={formErrors.notes}
            class="form-control"
            id="tenant-notes"
            rows="3"
            bind:value={form.notes}
          ></textarea>
          {#if formErrors.notes}
            <div class="invalid-feedback">{formErrors.notes}</div>
          {/if}
        </div>
      </div>
    </fieldset>
  </form>

  <div slot="footer">
    <button class="btn btn-light" type="button" on:click={closeModal} disabled={saving}>
      {$locale.tenants.cancel}
    </button>
    <button class="btn btn-primary" type="submit" form="tenant-form" disabled={saving}>
      {saving
        ? $locale.tenants.loading
        : editingId
          ? $locale.tenants.update
          : $locale.tenants.save}
    </button>
  </div>
</Modal>
