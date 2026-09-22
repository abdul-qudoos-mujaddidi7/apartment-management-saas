<script>
  import Sidebar from './components/Sidebar.svelte';
  import Topbar from './components/layout/Topbar.svelte';
  import PageLayout from './components/ui/PageLayout.svelte';
  import PageToolbar from './components/ui/PageToolbar.svelte';
  import PageHeader from './components/ui/PageHeader.svelte';
  import ActionButton from './components/ui/ActionButton.svelte';
  import DataTable from './components/ui/DataTable.svelte';
  import Pagination from './components/ui/Pagination.svelte';
  import StatusBadge from './components/ui/StatusBadge.svelte';

  const buildings = [
    { name: 'Gulshan Tower', code: 'BLD-1001', address: 'Road 11, Gulshan 1', floors: 8, status: 'Active' },
    { name: 'Banani Heights', code: 'BLD-1002', address: 'Kemal Ataturk Ave', floors: 6, status: 'Active' },
    { name: 'Dhanmondi Plaza', code: 'BLD-1003', address: 'Road 27, Dhanmondi', floors: 5, status: 'Active' },
    { name: 'Uttara Sector 7', code: 'BLD-1004', address: 'Sector 7, Uttara', floors: 10, status: 'Inactive' },
    { name: 'Mirpur DOHS Block C', code: 'BLD-1005', address: 'DOHS, Mirpur', floors: 7, status: 'Active' },
    { name: 'Bashundhara Riverview', code: 'BLD-1006', address: 'Block D, Bashundhara', floors: 12, status: 'Active' },
    { name: 'Mohakhali Corporate', code: 'BLD-1007', address: 'Kemal Ataturk Ave', floors: 9, status: 'Active' },
    { name: 'Baridhara Diplomatic', code: 'BLD-1008', address: 'Road 6, Baridhara', floors: 4, status: 'Inactive' },
    { name: 'Motijheel Trade Centre', code: 'BLD-1009', address: 'Dilkusha C/A', floors: 15, status: 'Active' },
    { name: 'Baily Road Residency', code: 'BLD-1010', address: 'Baily Road', floors: 6, status: 'Active' },
    { name: 'Nikunja Lakeview', code: 'BLD-1011', address: 'Nikunja 2', floors: 8, status: 'Active' },
    { name: 'Shyamoli Court', code: 'BLD-1012', address: 'Shyamoli', floors: 5, status: 'Inactive' },
    { name: 'Wari Heritage', code: 'BLD-1013', address: 'Rankin Street', floors: 3, status: 'Active' },
    { name: 'Tejgaon Industrial', code: 'BLD-1014', address: 'Tejgaon I/A', floors: 11, status: 'Active' }
  ];
</script>

<div class="dashboard-layout">
  <div class="dashboard-container" style="display:block">
    <main class="dashboard-main">
      <Topbar navigationOpen={false} />

      <div class="app-page">
        <p class="probe-note">A — list page: toolbar row owns the create button, no title</p>
        <div>
          <PageLayout>
            <svelte:fragment slot="toolbar">
              <PageToolbar search="" searchPlaceholder="Search buildings" addLabel="Add building" />
            </svelte:fragment>
            <svelte:fragment slot="content">
              <div class="probe-box">table area</div>
            </svelte:fragment>
          </PageLayout>
        </div>

        <p class="probe-note">B — detail page: actions-only page header</p>
        <PageHeader>
          <svelte:fragment slot="actions">
            <button class="back-button" type="button">Back</button>
            <ActionButton icon="bi-plus-lg" label="Add floor" />
          </svelte:fragment>
        </PageHeader>
        <div class="probe-box">building summary</div>

        <p class="probe-note">C — message page keeps its heading</p>
        <PageHeader title="Not found" description="The page you are looking for does not exist." />
      </div>
    </main>
  </div>
</div>

<div class="dashboard-layout">
  <div class="dashboard-container">
    <Sidebar user={{ firstName: 'Ali', organization: { name: 'Acme Properties' } }} open={false} />

    <main class="dashboard-main">
      <Topbar navigationOpen={false} />

      <div class="app-page">
        <p class="probe-note">D — sidebar rail against the working area</p>
        <div class="probe-box">page content</div>
      </div>
    </main>
  </div>
</div>

<div class="dashboard-layout">
  <div class="dashboard-container">
    <Sidebar user={{ firstName: 'Ali', organization: { name: 'Acme Properties' } }} open={false} />

    <main class="dashboard-main">
      <Topbar navigationOpen={false} />

      <div class="app-page">
        <PageLayout toolbarWidth="26rem" showStats={true} ariaLabel="Buildings">
          <svelte:fragment slot="actions">
            <ActionButton icon="bi-plus-lg" label="New building" />
          </svelte:fragment>

          <svelte:fragment slot="toolbar">
            <PageToolbar
              search=""
              searchPlaceholder="Search buildings…"
              showAdd={false}
              resetLabel="Clear"
            />
          </svelte:fragment>

          <svelte:fragment slot="tabs">
            <div class="probe-tabs">
              <button class="probe-tab is-active" type="button">All</button>
              <button class="probe-tab" type="button">Active</button>
              <button class="probe-tab" type="button">Inactive</button>
            </div>
          </svelte:fragment>

          <svelte:fragment slot="stats">
            <div class="stat-grid">
              <div class="stat-tile">
                <span class="stat-icon"><i class="bi bi-buildings"></i></span>
                <div>
                  <div class="metric-copy">Buildings</div>
                  <strong>14</strong>
                </div>
              </div>
              <div class="stat-tile">
                <span class="stat-icon"><i class="bi bi-layers"></i></span>
                <div>
                  <div class="metric-copy">Floors</div>
                  <strong>109</strong>
                </div>
              </div>
              <div class="stat-tile">
                <span class="stat-icon"><i class="bi bi-door-open"></i></span>
                <div>
                  <div class="metric-copy">Apartments</div>
                  <strong>864</strong>
                </div>
              </div>
              <div class="stat-tile">
                <span class="stat-icon"><i class="bi bi-people"></i></span>
                <div>
                  <div class="metric-copy">Occupancy</div>
                  <strong>92%</strong>
                </div>
              </div>
            </div>
          </svelte:fragment>

          <svelte:fragment slot="content">
            <DataTable ariaLabel="Buildings" minTableWidth="54rem" showFooter={false}>
              <thead>
                <tr>
                  <th class="col-start">Building</th>
                  <th>Code</th>
                  <th class="col-start">Address</th>
                  <th>Floors</th>
                  <th>Status</th>
                  <th class="actions-heading">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each buildings as building (building.code)}
                  <tr>
                    <td class="col-start">
                      <span class="entity-link">
                        <span class="entity-icon" aria-hidden="true"><i class="bi bi-buildings"></i></span>
                        <span>{building.name}</span>
                      </span>
                    </td>
                    <td class="data-cell">{building.code}</td>
                    <td class="col-start">{building.address}</td>
                    <td class="data-cell">{building.floors}</td>
                    <td>
                      <StatusBadge
                        label={building.status}
                        tone={building.status === 'Active' ? 'success' : 'neutral'}
                      />
                    </td>
                    <td class="actions-cell">
                      <button class="icon-button" type="button" aria-label="Edit">
                        <i class="bi bi-pencil" aria-hidden="true"></i>
                      </button>
                      <button class="icon-button danger" type="button" aria-label="Delete">
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
              page={2}
              totalPages={9}
              summary="Showing 11–20 of 84"
              label="Page 2 of 9"
              previousLabel="Previous"
              nextLabel="Next"
            />
          </svelte:fragment>
        </PageLayout>
      </div>
    </main>
  </div>
</div>

<style>
  .probe-note {
    margin: 0 0 0.75rem;
    color: #94a3b8;
    font: 700 11px/1.4 system-ui, sans-serif;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .probe-box {
    display: grid;
    place-items: center;
    min-height: 80px;
    border: 1px dashed #cbd5e1;
    border-radius: 10px;
    color: #94a3b8;
    font: 600 12px system-ui, sans-serif;
  }

  .probe-tabs {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .probe-tab {
    padding: 0.35rem 0.85rem;
    border: 1px solid transparent;
    border-radius: 999px;
    color: var(--text-muted);
    background: transparent;
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    cursor: pointer;
  }

  .probe-tab:hover { color: var(--text-strong); }

  .probe-tab.is-active {
    border-color: var(--accent-soft-border);
    color: var(--accent);
    background: var(--accent-soft);
  }
</style>
