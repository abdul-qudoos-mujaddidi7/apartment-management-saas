<script>
  import { createEventDispatcher } from 'svelte';

  import { listFinancialAccounts } from '../../services/financialAccounts';
  import { createPayment, getOutstandingItems } from '../../services/payments';
  import { activeCurrencies, baseCurrency, convertAmount } from '../../stores/currency';
  import { locale, translate } from '../../i18n';
  import ShamsiDatePicker from '../ui/ShamsiDatePicker.svelte';
  import { formatMoney } from '../../utils/formatters';

  export let open = false;
  export let lease = null;
  export let invoice = null;

  const dispatch = createEventDispatcher();
  const paymentMethods = ['CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_MONEY', 'OTHER'];
  const today = () => new Date().toISOString().slice(0, 10);
  // Amounts are printed in the currency they are stated in: each invoice keeps
  // its own, and the allocation column is always in the receipt's currency.
  const money = (value, code = $baseCurrency) => formatMoney(value, code);
  const tenantName = (record) => `${record?.tenant?.firstName || ''} ${record?.tenant?.lastName || ''}`.trim() || '—';
  const itemTypeLabel = (type) => $locale.invoices[type.toLowerCase()] || type;

  let accounts = [];
  let invoiceGroups = [];
  let loading = false;
  let saving = false;
  let loadedKey = '';
  let modalError = '';
  let formErrors = {};
  let form = emptyForm();
  // Map of invoiceItemId -> allocation amount
  let allocations = {};

  function emptyForm() {
    return {
      paymentDate: today(), currency: $baseCurrency, receiveAccountId: '', paymentMethod: 'CASH',
      amount: '', reference: '', notes: '',
    };
  }

  /**
   * An item's outstanding balance expressed in the receipt's currency.
   *
   * Allocation inputs are always entered in the currency being handed over —
   * that is what the tenant physically paid — so the limit shown against each
   * charge is that charge's balance converted into the same units. The server
   * converts back when it applies the amount to the invoice.
   */
  function balanceInPaymentCurrency(item, group) {
    return convertAmount(item.balance, group.currency || $baseCurrency, form.currency, $activeCurrencies, $baseCurrency);
  }

  function crossCurrency(group) {
    return (group.currency || $baseCurrency) !== form.currency;
  }

  function contextLease() {
    return lease || invoice?.lease || null;
  }

  function contextKey() {
    const activeLease = contextLease();
    return activeLease ? `${activeLease.id}:${invoice?.id || ''}` : '';
  }

  async function prepare() {
    const activeLease = contextLease();
    if (!activeLease) return;
    loadedKey = contextKey();
    loading = true;
    modalError = '';
    formErrors = {};
    form = emptyForm();
    allocations = {};

    try {
      const [accountsResponse, itemsResponse] = await Promise.all([
        listFinancialAccounts(),
        getOutstandingItems(activeLease.tenant.id, activeLease.id),
      ]);
      accounts = (accountsResponse.items || []).filter((account) => account.type === 'ASSET');
      const cashAccount = accounts.find((account) => account.code === '1000');
      form = { ...form, receiveAccountId: cashAccount?.id || accounts[0]?.id || '' };
      invoiceGroups = itemsResponse.items || [];
      // Open on the invoice's currency when the receipt relates to one invoice,
      // which is the common case and needs no conversion at all.
      const soleCurrency = invoiceGroups.length === 1 ? invoiceGroups[0].currency : null;
      if (soleCurrency) form = { ...form, currency: soleCurrency };

      // Initialize allocations to empty
      for (const group of invoiceGroups) {
        for (const item of group.items) {
          allocations[item.id] = '';
        }
      }

      // If opened from a specific invoice, pre-fill that invoice's items
      if (invoice) {
        const matchingGroup = invoiceGroups.find((group) => group.id === invoice.id);
        if (matchingGroup) {
          const totalBalance = matchingGroup.items.reduce((sum, item) => sum + item.balance, 0);
          form = { ...form, amount: totalBalance };
          for (const item of matchingGroup.items) {
            allocations[item.id] = item.balance;
          }
        }
      }
    } catch (error) {
      modalError = error.message;
    } finally {
      loading = false;
    }
  }

  /**
   * The rounding difference a closing allocation is about to absorb.
   *
   * An amount that settles an item is applied in the invoice's currency, but the
   * base value it credits the receivable with is the item's remaining base
   * balance — the amount that actually clears it. The difference between that
   * and the converted value of the money handed over lands on the receipt, and
   * it is shown before saving because the receipt's stored base value will not
   * be exactly amount × rate. That includes an item paid in its own currency
   * whose base balance no longer matches its currency figures, which is exactly
   * what an earlier cross-currency receipt leaves behind.
   */
  function roundingNotes(currentAllocations, paymentCurrency, groups) {
    const notes = [];
    for (const group of groups) {
      for (const item of group.items) {
        const entered = Number(currentAllocations[item.id]) || 0;
        if (entered <= 0) continue;
        const appliedInInvoiceCurrency = convertAmount(entered, paymentCurrency, group.currency || $baseCurrency, $activeCurrencies, $baseCurrency);
        if (appliedInInvoiceCurrency < item.balance - 0.005) continue;
        // The item's remaining base value is what a closing allocation applies;
        // the converted balance would agree with the money handed over by
        // construction and would never reveal the difference.
        const settlesWith = item.baseBalance ?? convertAmount(item.balance, group.currency || $baseCurrency, $baseCurrency, $activeCurrencies, $baseCurrency);
        const handedOver = convertAmount(entered, paymentCurrency, $baseCurrency, $activeCurrencies, $baseCurrency);
        const difference = settlesWith - handedOver;
        if (Math.abs(difference) >= 0.005) {
          notes.push({ invoiceNumber: group.invoiceNumber, difference });
        }
      }
    }
    return notes;
  }

  $: if (open && contextKey() && loadedKey !== contextKey()) prepare();
  $: totalAllocated = Object.values(allocations).reduce((total, val) => total + (Number(val) || 0), 0);
  $: unallocated = Math.max((Number(form.amount) || 0) - totalAllocated, 0);
  // The arguments are what make this reactive: without them the block would run
  // once and never see an allocation change.
  $: roundingAdjustments = roundingNotes(allocations, form.currency, invoiceGroups);
  $: outstandingBalance = invoiceGroups.reduce((total, group) =>
    total + group.items.reduce((sum, item) => sum + item.balance, 0), 0);

  function close() {
    if (saving) return;
    loadedKey = '';
    dispatch('close');
  }

  function updateAllocation(itemId, value) {
    allocations = { ...allocations, [itemId]: value };
  }

  function autoAllocate() {
    let remaining = Number(form.amount) || 0;
    // Iterate in order: oldest invoice first, stable item order within.
    // Every limit is expressed in the receipt's currency.
    const newAllocations = {};
    for (const group of invoiceGroups) {
      for (const item of group.items) {
        const limit = balanceInPaymentCurrency(item, group);
        const allocation = Math.min(remaining, limit);
        newAllocations[item.id] = Number(allocation.toFixed(2)) || '';
        remaining -= allocation;
      }
    }
    allocations = newAllocations;
  }

  function validate() {
    const errors = {};
    if (!form.paymentDate) errors.paymentDate = translate('payments.required', { field: $locale.payments.paymentDate });
    if (!form.receiveAccountId) errors.receiveAccountId = translate('payments.required', { field: $locale.payments.receiveInto });
    if (Number(form.amount) <= 0) errors.amount = $locale.payments.positiveAmount;
    if (totalAllocated > Number(form.amount)) errors.allocations = $locale.payments.allocationsExceedPayment;

    // Validate each allocation against the balance in the same currency.
    for (const group of invoiceGroups) {
      for (const item of group.items) {
        const alloc = Number(allocations[item.id] || 0);
        if (alloc < 0 || alloc > balanceInPaymentCurrency(item, group) + 0.005) {
          errors[`allocation-${item.id}`] = $locale.payments.allocationExceedsBalance;
        }
      }
    }
    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function save() {
    if (!validate()) return;
    const activeLease = contextLease();
    saving = true;
    modalError = '';
    try {
      const allocArray = [];
      for (const group of invoiceGroups) {
        for (const item of group.items) {
          const amount = Number(allocations[item.id] || 0);
          if (amount > 0) {
            allocArray.push({ invoiceItemId: item.id, amount });
          }
        }
      }

      await createPayment({
        tenantId: activeLease.tenant.id,
        leaseId: activeLease.id,
        paymentDate: form.paymentDate,
        currency: form.currency,
        receiveAccountId: form.receiveAccountId,
        paymentMethod: form.paymentMethod,
        amount: Number(form.amount),
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
        allocations: allocArray,
      });
      dispatch('saved');
      close();
    } catch (error) {
      if (error.data?.errors) {
        formErrors = Object.fromEntries(Object.entries(error.data.errors).map(([field, messages]) => [field, messages[0]]));
      } else {
        modalError = error.message;
      }
    } finally {
      saving = false;
    }
  }
</script>

{#if open && contextLease()}
  <button class="modal-backdrop fade show" type="button" on:click={close} aria-label={$locale.payments.cancel}></button>
  <div class="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="receive-payment-title">
    <div class="modal-dialog modal-dialog-centered modal-xl"><div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title" id="receive-payment-title">{$locale.payments.receivePayment}</h2>
        <button class="btn-close" type="button" on:click={close} aria-label={$locale.payments.cancel}></button>
      </div>
      <form on:submit|preventDefault={save} novalidate>
        <div class="modal-body">
          {#if modalError}<div class="alert alert-danger" role="alert">{modalError}</div>{/if}
          {#if loading}
            <div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">{$locale.payments.loading}</span></div></div>
          {:else}
            <fieldset><legend class="section-label">{$locale.payments.tenancyDetails}</legend>
              <dl class="tenancy-context">
                <div><dt>{$locale.payments.tenant}</dt><dd>{tenantName(contextLease())}</dd></div>
                <div><dt>{$locale.payments.building}</dt><dd>{contextLease().apartment.floor.building.name}</dd></div>
                <div><dt>{$locale.payments.floor}</dt><dd>{contextLease().apartment.floor.name || contextLease().apartment.floor.floorNumber}</dd></div>
                <div><dt>{$locale.payments.apartment}</dt><dd>{contextLease().apartment.apartmentNumber}</dd></div>
                <div><dt>{$locale.payments.contract}</dt><dd>{contextLease().contractNumber}</dd></div>
                <div>
                  <dt>{$locale.payments.outstandingBalance}</dt>
                  <dd class="amount-cell">
                    {#if invoiceGroups.length > 0}
                      {money(outstandingBalance, invoiceGroups[0].currency)}
                    {:else}—{/if}
                  </dd>
                </div>
              </dl>
            </fieldset>
            <fieldset><legend class="section-label">{$locale.payments.paymentDetails}</legend>
              <div class="row g-3">
                <div class="col-md-4"><label class="form-label" for="payment-date">{$locale.payments.paymentDate}</label><ShamsiDatePicker id="payment-date" invalid={Boolean(formErrors.paymentDate)} bind:value={form.paymentDate}/>{#if formErrors.paymentDate}<div class="invalid-feedback">{formErrors.paymentDate}</div>{/if}</div>
                <div class="col-md-4"><label class="form-label" for="payment-currency">{$locale.currencies.currency}</label><select id="payment-currency" class="form-select" bind:value={form.currency}>{#each $activeCurrencies as item (item.id)}<option value={item.code}>{item.code} — {item.name}</option>{/each}</select>{#if form.currency !== $baseCurrency}<div class="form-text">1 {form.currency} = {money(convertAmount(1, form.currency, $baseCurrency, $activeCurrencies, $baseCurrency))}</div>{/if}</div>
                <div class="col-md-4"><label class="form-label" for="receive-account">{$locale.payments.receiveInto}</label><select id="receive-account" class:is-invalid={formErrors.receiveAccountId} class="form-select" bind:value={form.receiveAccountId}><option value="">{$locale.payments.selectAccount}</option>{#each accounts as account (account.id)}<option value={account.id}>{account.code} — {account.name}</option>{/each}</select>{#if formErrors.receiveAccountId}<div class="invalid-feedback">{formErrors.receiveAccountId}</div>{/if}</div>
                <div class="col-md-4"><label class="form-label" for="payment-method">{$locale.payments.method}</label><select id="payment-method" class="form-select" bind:value={form.paymentMethod}>{#each paymentMethods as method (method)}<option value={method}>{$locale.paymentMethods[method]}</option>{/each}</select></div>
                <div class="col-md-4"><label class="form-label" for="payment-amount">{$locale.payments.amount}</label><input id="payment-amount" class:is-invalid={formErrors.amount} class="form-control" type="number" min="0.01" step="0.01" bind:value={form.amount}/>{#if formErrors.amount}<div class="invalid-feedback">{formErrors.amount}</div>{/if}</div>
                <div class="col-md-4"><label class="form-label" for="payment-reference">{$locale.payments.reference}</label><input id="payment-reference" class="form-control" bind:value={form.reference}/></div>
                <div class="col-md-4"><label class="form-label" for="payment-notes">{$locale.payments.notes}</label><input id="payment-notes" class="form-control" bind:value={form.notes}/></div>
              </div>
            </fieldset>
            <fieldset><div class="items-heading"><legend class="section-label">{$locale.payments.outstandingCharges}</legend><button class="btn btn-outline-primary btn-sm" type="button" on:click={autoAllocate}>{$locale.payments.autoAllocate}</button></div>
              {#if formErrors.allocations}<div class="alert alert-danger py-2" role="alert">{formErrors.allocations}</div>{/if}
              <div class="table-responsive"><table class="table payment-items-table">
                <thead><tr>
                  <th>{$locale.payments.invoice}</th>
                  <th>{$locale.payments.charge}</th>
                  <th class="text-end">{$locale.payments.total}</th>
                  <th class="text-end">{$locale.payments.paid}</th>
                  <th class="text-end">{$locale.payments.balance}</th>
                  <th class="text-end">{$locale.payments.allocate}</th>
                </tr></thead>
                <tbody>
                  {#each invoiceGroups as group (group.id)}
                    {#each group.items as item, idx (item.id)}
                      <tr>
                        <td>{#if idx === 0}<strong>{group.invoiceNumber}</strong>{:else}<span class="text-muted">—</span>{/if}</td>
                        <td>
                          {item.description || itemTypeLabel(item.type)}
                          {#if idx === 0 && crossCurrency(group)}
                            <small class="row-hint">
                              {$locale.payments.invoiceCurrency.replace('{code}', group.currency)} ·
                              {$locale.payments.allocateIn.replace('{code}', form.currency)}
                            </small>
                          {/if}
                        </td>
                        <td class="amount-cell text-end">{money(item.amount, group.currency)}</td>
                        <td class="amount-cell text-end">{money(item.paidAmount, group.currency)}</td>
                        <td class="amount-cell text-end">{money(balanceInPaymentCurrency(item, group), form.currency)}</td>
                        <td class="text-end">
                          <input class:is-invalid={formErrors[`allocation-${item.id}`]} class="form-control amount-input" type="number" min="0" max={balanceInPaymentCurrency(item, group)} step="0.01" value={allocations[item.id] || ''} on:input={(event) => updateAllocation(item.id, event.currentTarget.value)}/>
                          {#if formErrors[`allocation-${item.id}`]}<div class="invalid-feedback">{formErrors[`allocation-${item.id}`]}</div>{/if}
                        </td>
                      </tr>
                    {/each}
                  {/each}
                </tbody>
              </table></div>
              <div class="payment-summary">
                <span>{$locale.payments.amount}</span><strong>{money(form.amount, form.currency)}</strong>
                <span>{$locale.payments.allocated}</span><strong>{money(totalAllocated, form.currency)}</strong>
                <span>{$locale.payments.unallocated}</span><strong>{money(unallocated, form.currency)}</strong>
              </div>
              {#if form.currency !== $baseCurrency}
                <p class="base-hint">
                  {$locale.payments.baseEquivalent.replace('{base}', $baseCurrency)}:
                  <strong>{money(convertAmount(Number(form.amount) || 0, form.currency, $baseCurrency, $activeCurrencies, $baseCurrency))}</strong>
                </p>
              {/if}
              {#each roundingAdjustments as note (note.invoiceNumber)}
                <p class="base-hint">
                  {note.invoiceNumber}:
                  {$locale.payments.roundingNote.replace('{amount}', money(note.difference, $baseCurrency))}
                </p>
              {/each}
            </fieldset>
          {/if}
        </div>
        <div class="modal-footer"><button class="btn btn-light" type="button" on:click={close} disabled={saving}>{$locale.payments.cancel}</button><button class="btn btn-primary" type="submit" disabled={saving || loading}>{saving ? $locale.payments.saving : $locale.payments.save}</button></div>
      </form>
    </div></div>
  </div>
{/if}

<style>
  fieldset + fieldset { margin-top: 1.5rem; }
  .section-label { color: var(--text-secondary); font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .tenancy-context { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .85rem 1rem; margin: 0; }
  .tenancy-context dt { color: var(--text-muted); font-size: .76rem; font-weight: 600; }
  .tenancy-context dd { margin: .16rem 0 0; color: var(--text-primary); font-weight: 600; }
  .items-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .payment-items-table { min-inline-size: 48rem; }
  .amount-cell { font-variant-numeric: tabular-nums; font-weight: 600; }
  .amount-input { max-inline-size: 8rem; margin-inline-start: auto; text-align: end; }
  .row-hint { display: block; color: var(--text-muted); font-size: var(--text-xs); }
  .base-hint { margin: .6rem 0 0; color: var(--text-secondary); font-size: var(--text-sm); text-align: end; }
  .payment-summary { display: grid; grid-template-columns: repeat(6, auto); justify-content: end; gap: .35rem .8rem; margin-top: .9rem; font-variant-numeric: tabular-nums; }
  @media (max-width: 767px) { .tenancy-context { grid-template-columns: repeat(2, minmax(0, 1fr)); } .payment-summary { grid-template-columns: repeat(2, auto); justify-content: start; } }
  @media (max-width: 480px) { .tenancy-context { grid-template-columns: 1fr; } }
</style>
