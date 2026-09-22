<script>
  import { locale } from '../../i18n';

  export let spaces = [];
  export let errors = {};

  const quickSpaces = [
    ['Bedroom', 'bedroom'],
    ['Bathroom', 'bathroom'],
    ['Kitchen', 'kitchen'],
    ['Salon', 'salon'],
    ['Balcony', 'balcony'],
    ['Dining Room', 'diningRoom'],
    ['Storage Room', 'storageRoom'],
    ['Parking', 'parking'],
  ];

  function addSpace(name = '') {
    if (name && spaces.some((space) => space.name.trim().toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'))) return;
    spaces = [...spaces, { name, quantity: 1 }];
  }

  function setSpace(index, field, value) {
    spaces = spaces.map((space, position) => position === index ? { ...space, [field]: value } : space);
  }

  function removeSpace(index) {
    spaces = spaces.filter((_, position) => position !== index);
  }
</script>

<section class="spaces-section" aria-labelledby="spaces-heading">
  <div class="section-heading">
    <div>
      <h3 id="spaces-heading">{$locale.apartments.spaces.title}</h3>
      <p>{$locale.apartments.spaces.description}</p>
    </div>
    <button class="btn btn-sm btn-outline-primary add-button" type="button" on:click={() => addSpace()}>
      <i class="bi bi-plus-lg" aria-hidden="true"></i>
      {$locale.apartments.spaces.addAnother}
    </button>
  </div>

  <div class="quick-add" aria-label={$locale.apartments.spaces.quickAdd}>
    {#each quickSpaces as [name, translationKey]}
      <button class="quick-chip" type="button" on:click={() => addSpace(name)}>
        <i class="bi bi-plus" aria-hidden="true"></i>
        {$locale.apartments.spaces.names[translationKey]}
      </button>
    {/each}
  </div>

  {#if spaces.length === 0}
    <div class="empty-spaces">
      <i class="bi bi-grid-3x3-gap" aria-hidden="true"></i>
      <span>{$locale.apartments.spaces.empty}</span>
    </div>
  {:else}
    <div class="space-list">
      {#each spaces as space, index (index)}
        <div class="space-row">
          <div class="name-field">
            <label class="form-label" for={`space-name-${index}`}>{$locale.apartments.spaces.name}</label>
            <input
              id={`space-name-${index}`}
              class="form-control"
              class:is-invalid={errors[index]?.name}
              maxlength="100"
              value={space.name}
              placeholder={$locale.apartments.spaces.customSpace}
              on:input={(event) => setSpace(index, 'name', event.currentTarget.value)}
            />
            {#if errors[index]?.name}<div class="invalid-feedback">{errors[index].name}</div>{/if}
          </div>
          <div class="quantity-field">
            <label class="form-label" for={`space-quantity-${index}`}>{$locale.apartments.spaces.quantity}</label>
            <input
              id={`space-quantity-${index}`}
              class="form-control"
              class:is-invalid={errors[index]?.quantity}
              type="number"
              min="1"
              max="1000"
              step="1"
              value={space.quantity}
              on:input={(event) => setSpace(index, 'quantity', event.currentTarget.value)}
            />
            {#if errors[index]?.quantity}<div class="invalid-feedback">{errors[index].quantity}</div>{/if}
          </div>
          <button class="remove-button" type="button" on:click={() => removeSpace(index)} aria-label={$locale.apartments.spaces.remove} title={$locale.apartments.spaces.remove}>
            <i class="bi bi-trash3" aria-hidden="true"></i>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .spaces-section { grid-column: 1 / -1; margin-top: .25rem; padding-top: 1rem; border-top: 1px solid var(--border, var(--bs-border-color)); }
  .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .section-heading h3 { margin: 0; color: var(--text-primary); font-size: .95rem; font-weight: 700; }
  .section-heading p { margin: .25rem 0 0; color: var(--text-muted); font-size: .82rem; }
  .add-button { display: inline-flex; align-items: center; gap: .35rem; flex: 0 0 auto; }
  .quick-add { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .85rem; }
  .quick-chip { display: inline-flex; align-items: center; gap: .15rem; min-height: 2rem; padding: .25rem .6rem; border: 1px solid var(--border, var(--bs-border-color)); border-radius: 999px; background: var(--surface, var(--bs-body-bg)); color: var(--text-secondary, var(--bs-body-color)); font-size: .78rem; }
  .quick-chip:hover { border-color: var(--accent, var(--bs-primary)); color: var(--accent, var(--bs-primary)); background: var(--accent-soft, var(--bs-tertiary-bg)); }
  .space-list { display: grid; gap: .65rem; margin-top: .85rem; }
  .space-row { display: grid; grid-template-columns: minmax(0, 1fr) 7rem 2.75rem; align-items: end; gap: .65rem; }
  .form-label { margin-bottom: .25rem; font-size: .76rem; color: var(--text-muted); }
  .quantity-field input { text-align: center; font-variant-numeric: tabular-nums; }
  .remove-button { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid transparent; border-radius: .5rem; background: transparent; color: var(--danger, var(--bs-danger)); }
  .remove-button:hover { border-color: color-mix(in srgb, var(--danger, var(--bs-danger)) 25%, transparent); background: color-mix(in srgb, var(--danger, var(--bs-danger)) 8%, transparent); }
  .empty-spaces { display: flex; align-items: center; gap: .5rem; margin-top: .85rem; padding: .75rem; border: 1px dashed var(--border, var(--bs-border-color)); border-radius: .6rem; color: var(--text-muted); font-size: .82rem; }
  @media (max-width: 575px) {
    .section-heading { align-items: stretch; flex-direction: column; }
    .add-button { align-self: flex-start; }
    .space-row { grid-template-columns: minmax(0, 1fr) 5.75rem 2.75rem; }
  }
</style>
