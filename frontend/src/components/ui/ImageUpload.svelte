<script>
  /**
   * One image slot: a photograph, a scanned document, a card.
   *
   * The file is uploaded the moment it is picked — the form only ever carries
   * the stored path — so the person sees their picture immediately instead of
   * after the whole record is saved. While the upload is in flight the local
   * blob is shown, so there is no blank frame between choosing and seeing.
   *
   * A file picked here and then dropped again is deleted from the server
   * straight away: it was never attached to anything. A file the record already
   * pointed at is left alone, because retiring it is the save's job.
   */
  import { createEventDispatcher } from 'svelte';

  import { locale } from '../../i18n';
  import { mediaUrl } from '../../utils/media';
  import {
    ALLOWED_IMAGE_TYPES,
    IMAGE_ACCEPT,
    MAX_IMAGE_BYTES,
    deleteUpload,
    uploadImage,
  } from '../../services/uploads';

  export let value = null; // the stored path, e.g. /uploads/tenants/photo-….jpg
  export let kind; // which document this is — an allowlist the API enforces
  export let label; // the field's name, used as the image's alt text too
  export let hint = ''; // an extra line under the control, when the name is not enough
  export let shape = 'card'; // 'card' (16:10 document) | 'avatar' (round)
  export let disabled = false;

  const dispatch = createEventDispatcher();

  let inputElement;
  let busy = false;
  let dragging = false;
  let errorMessage = '';
  let localPreview = '';
  let uploadedHere = false;

  $: previewUrl = localPreview || value;

  /** Files are checked here as well as on the server, so a bad pick is instant. */
  function problemWith(file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return $locale.uploads.wrongType;
    if (file.size > MAX_IMAGE_BYTES) return $locale.uploads.tooLarge;
    return '';
  }

  function openPicker() {
    if (disabled || busy) return;
    inputElement?.click();
  }

  async function handlePicked(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];

    // Clearing the input lets the same file be picked again after a failure.
    if (input) input.value = '';

    if (file) await store(file);
  }

  async function store(file) {
    const problem = problemWith(file);
    if (problem) {
      errorMessage = problem;
      return;
    }

    errorMessage = '';
    busy = true;
    dispatch('busy', { busy: true });
    localPreview = URL.createObjectURL(file);

    try {
      const upload = await uploadImage(file, kind);
      uploadedHere = true;
      value = upload.url;
      dispatch('change', { url: upload.url });
    } catch (error) {
      errorMessage = error?.message || $locale.uploads.failed;
    } finally {
      URL.revokeObjectURL(localPreview);
      localPreview = '';
      busy = false;
      dispatch('busy', { busy: false });
    }
  }

  function handleDrop(event) {
    dragging = false;
    if (disabled || busy) return;

    const file = event.dataTransfer?.files?.[0];
    if (file) void store(file);
  }

  function clear() {
    const wasFresh = uploadedHere;
    const removed = value;

    value = null;
    uploadedHere = false;
    errorMessage = '';
    dispatch('change', { url: null });

    if (wasFresh && removed) deleteUpload(removed).catch(() => {});
  }

  /**
   * The file input lives at the end of <body>, not inside the dialog: a dialog
   * focuses its first input on open, and an invisible file input must never be
   * what it lands on.
   */
  function portalToBody(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.parentNode?.removeChild(node);
      },
    };
  }
</script>

<div class="image-upload" class:is-invalid={Boolean(errorMessage)}>
  <span class="image-upload-label" id={`${kind}-label`}>{label}</span>

  <div
    class="image-upload-body"
    class:dragging
    on:dragover|preventDefault={() => (dragging = !disabled && !busy)}
    on:dragleave={() => (dragging = false)}
    on:drop|preventDefault={handleDrop}
  >
    {#if previewUrl}
      <figure class="preview is-{shape}">
        <img
          src={mediaUrl(previewUrl)}
          alt={label}
          on:error={() => { if (value && !localPreview) errorMessage = $locale.uploads.missing; }}
        />
        {#if busy}
          <figcaption class="preview-veil">
            <span class="spinner" aria-hidden="true"></span>
            {$locale.uploads.uploading}
          </figcaption>
        {/if}
      </figure>
    {:else}
      <button
        class="dropzone is-{shape}"
        type="button"
        {disabled}
        on:click={openPicker}
        aria-labelledby={`${kind}-label`}
      >
        <i class="bi bi-{shape === 'avatar' ? 'camera' : 'card-image'}" aria-hidden="true"></i>
        <span class="dropzone-title">{$locale.uploads.choose}</span>
        <span class="dropzone-hint">{$locale.uploads.dropHere}</span>
      </button>
    {/if}
  </div>

  {#if previewUrl && !busy}
    <div class="image-upload-actions">
      <button class="upload-action" type="button" on:click={openPicker} {disabled}>
        <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
        {$locale.uploads.replace}
      </button>
      {#if value}
        <a class="upload-action" href={mediaUrl(value)} target="_blank" rel="noopener">
          <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
          {$locale.uploads.view}
        </a>
      {/if}
      <button class="upload-action is-danger" type="button" on:click={clear} {disabled}>
        <i class="bi bi-trash3" aria-hidden="true"></i>
        {$locale.uploads.remove}
      </button>
    </div>
  {/if}

  <p class="image-upload-hint">{hint || $locale.uploads.hint}</p>

  {#if errorMessage}
    <p class="image-upload-error" role="alert">{errorMessage}</p>
  {/if}
</div>

<div class="file-input-host" use:portalToBody>
  <input
    bind:this={inputElement}
    type="file"
    accept={IMAGE_ACCEPT}
    aria-hidden="true"
    tabindex="-1"
    on:change={handlePicked}
  />
</div>

<style>
  .image-upload {
    display: flex;
    flex-direction: column;
  }

  .image-upload-label {
    display: block;
    margin-block-end: 8px;
    color: var(--text-strong);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .image-upload-body {
    position: relative;
    border-radius: var(--radius-lg);
    transition: box-shadow var(--transition);
  }

  .image-upload-body.dragging {
    box-shadow: var(--ring);
  }

  .preview,
  .dropzone {
    display: block;
    width: 100%;
    margin: 0;
  }

  .preview.is-card,
  .dropzone.is-card {
    aspect-ratio: 16 / 10;
    border-radius: var(--radius-lg);
  }

  .preview.is-avatar,
  .dropzone.is-avatar {
    width: 104px;
    aspect-ratio: 1;
    border-radius: 50%;
  }

  .preview {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--surface);
  }

  .preview img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-veil {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: rgba(15, 23, 42, 0.62);
    color: #fff;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-4) var(--space-3);
    border: 1.5px dashed var(--border-strong);
    color: var(--text-muted);
    background: var(--surface);
    text-align: center;
    transition: border-color var(--transition), background var(--transition), color var(--transition);
  }

  .dropzone:hover:not(:disabled) {
    border-color: var(--accent-border);
    color: var(--accent-text);
    background: var(--accent-soft);
  }

  .dropzone:focus-visible {
    border-color: var(--accent);
    outline: 0;
    box-shadow: var(--ring);
  }

  .dropzone:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .dropzone i {
    font-size: 1.35rem;
  }

  .dropzone-title {
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text-secondary);
  }

  .dropzone:hover:not(:disabled) .dropzone-title {
    color: var(--accent-text);
  }

  .dropzone-hint {
    font-size: var(--text-xs);
  }

  .image-upload-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px var(--space-3);
    margin-block-start: 6px;
  }

  /* Text controls rather than icon buttons: a 24px hit target on top of a
     document is not something you can reliably press. */
  .upload-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 0;
    border: 0;
    color: var(--accent-text);
    background: none;
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    text-decoration: none;
    cursor: pointer;
  }

  .upload-action:hover:not(:disabled) {
    color: var(--accent-hover);
    text-decoration: underline;
  }

  .upload-action:focus-visible {
    outline: 0;
    border-radius: var(--radius-sm);
    box-shadow: var(--ring);
  }

  .upload-action.is-danger {
    color: var(--danger);
  }

  .upload-action:disabled {
    color: var(--text-disabled);
    cursor: not-allowed;
  }

  .image-upload-hint {
    margin: 6px 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .image-upload-error {
    margin: 4px 0 0;
    color: var(--danger);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.45);
    border-top-color: #fff;
    border-radius: 50%;
    animation: upload-spin 0.7s linear infinite;
  }

  @keyframes upload-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner { animation-duration: 2.5s; }
  }
</style>
