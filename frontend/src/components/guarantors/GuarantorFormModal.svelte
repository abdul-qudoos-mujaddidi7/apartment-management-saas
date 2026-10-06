<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '../ui/Modal.svelte';
  import ImageUpload from '../ui/ImageUpload.svelte';
  import { locale } from '../../i18n';
  import { createGuarantor, updateGuarantor } from '../../services/guarantors';
  export let open = false;
  export let guarantor = null;
  const dispatch = createEventDispatcher();
  const blank = () => ({ firstName: '', lastName: '', phone: '', alternatePhone: '', nationalId: '', address: '', notes: '', documentUrl: null });
  let form = blank();
  let saving = false;
  let uploading = false;
  let error = '';
  let initialized = false;
  $: if (open && !initialized) { form = { ...blank(), ...(guarantor || {}) }; error = ''; initialized = true; }
  $: if (!open) initialized = false;
  function close() { if (!saving && !uploading) { open = false; dispatch('close'); } }
  async function save() {
    if (saving || uploading) return;
    saving = true; error = '';
    const data = Object.fromEntries(Object.keys(blank()).map(key => [key, typeof form[key] === 'string' ? form[key].trim() || null : form[key]]));
    try {
      const response = guarantor ? await updateGuarantor(guarantor.id, data) : await createGuarantor(data);
      open = false;
      dispatch('saved', response.guarantor);
    } catch (e) { error = e.message; }
    finally { saving = false; }
  }
</script>
<Modal {open} busy={saving || uploading} title={guarantor ? $locale.guarantors.edit : $locale.guarantors.add} icon="bi-person-check" size="modal-lg" closeLabel={$locale.guarantors.cancel} on:close={close}>
  {#if error}<div class="alert alert-danger" role="alert">{error}</div>{/if}
  <form id="guarantor-form" on:submit|preventDefault={save}>
    <div class="row g-3">
      {#each ['firstName', 'lastName', 'phone', 'alternatePhone', 'nationalId', 'address'] as key}
        <div class="col-md-6"><label class="form-label" for={`guarantor-${key}`}>{$locale.guarantors[key]}{#if ['firstName','lastName','phone'].includes(key)} *{/if}</label>
          <input id={`guarantor-${key}`} class="form-control" type={key.toLowerCase().includes('phone') ? 'tel' : 'text'} bind:value={form[key]} required={['firstName','lastName','phone'].includes(key)} minlength={key === 'phone' ? 3 : undefined} maxlength={key === 'address' ? 500 : ['phone','alternatePhone','nationalId'].includes(key) ? 64 : 191} disabled={saving} />
        </div>
      {/each}
      <div class="col-12"><label class="form-label" for="guarantor-notes">{$locale.guarantors.notes}</label><textarea id="guarantor-notes" class="form-control" rows="3" maxlength="5000" bind:value={form.notes} disabled={saving}></textarea></div>
      <div class="col-md-6"><ImageUpload kind="guarantor-document" label={$locale.guarantors.document} bind:value={form.documentUrl} disabled={saving} on:busy={event => uploading = event.detail.busy} /></div>
    </div>
  </form>
  <div slot="footer"><button type="button" class="btn btn-light" disabled={saving || uploading} on:click={close}>{$locale.guarantors.cancel}</button><button class="btn btn-primary" type="submit" form="guarantor-form" disabled={saving || uploading}>{saving ? $locale.guarantors.loading : $locale.guarantors.save}</button></div>
</Modal>

