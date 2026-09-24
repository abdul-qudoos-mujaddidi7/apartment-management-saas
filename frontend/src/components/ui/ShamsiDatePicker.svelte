<script>
  import { createEventDispatcher } from 'svelte';

  import { locale } from '../../i18n';
  import {
    AFGHAN_MONTHS,
    formatShamsiDate,
    gregorianToShamsi,
    shamsiMonthLength,
    shamsiPartsToGregorian,
    todayGregorian,
  } from '../../utils/shamsiDate';

  export let value = '';
  export let id;
  export let required = false;
  export let disabled = false;
  export let invalid = false;
  export let ariaLabel = undefined;
  /** Prompt shown while empty. Defaults to the localized "select a date". */
  export let placeholder = '';

  const dispatch = createEventDispatcher();
  const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  let open = false;
  let picker;
  let viewYear;
  let viewMonth;

  $: promptText = placeholder || $locale.common.selectDate;
  $: selected = gregorianToShamsi(value);
  $: monthLength = viewYear && viewMonth ? shamsiMonthLength(viewYear, viewMonth) : 0;
  $: leadingDays = viewYear && viewMonth ? firstDayOffset(viewYear, viewMonth) : 0;
  $: cells = Array.from({ length: leadingDays + monthLength }, (_, index) => index < leadingDays ? null : index - leadingDays + 1);

  function firstDayOffset(year, month) {
    const gregorian = shamsiPartsToGregorian(year, month, 1);
    if (!gregorian) return 0;
    return (new Date(`${gregorian}T00:00:00`).getDay() + 1) % 7;
  }

  function showPicker() {
    if (disabled) return;
    const initial = selected || gregorianToShamsi(todayGregorian());
    viewYear = initial.jy;
    viewMonth = initial.jm;
    open = !open;
  }

  function moveMonth(amount) {
    viewMonth += amount;
    if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
    if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
  }

  function selectDay(day) {
    value = shamsiPartsToGregorian(viewYear, viewMonth, day);
    open = false;
    dispatch('change', { value });
  }

  function selectToday() {
    value = todayGregorian();
    open = false;
    dispatch('change', { value });
  }

  function clearDate() {
    value = '';
    open = false;
    dispatch('change', { value });
  }

  function handleOutsideClick(event) {
    if (open && picker && !picker.contains(event.target)) open = false;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') open = false;
  }
</script>

<svelte:window on:mousedown={handleOutsideClick} on:keydown={handleKeydown} />

<div class="shamsi-picker" bind:this={picker}>
  <button
    {id}
    class="form-control picker-trigger"
    class:is-invalid={invalid}
    class:empty={!value}
    type="button"
    aria-label={ariaLabel}
    aria-haspopup="dialog"
    aria-expanded={open}
    {disabled}
    on:click={showPicker}
  >
    <i class="bi bi-calendar3 picker-icon" aria-hidden="true"></i>
    <span>{value ? formatShamsiDate(value) : promptText}</span>
    <i class="bi bi-calendar3 picker-glyph" aria-hidden="true"></i>
  </button>

  {#if open}
    <div class="calendar" role="dialog" aria-modal="false" aria-label="تقویم شمسی">
      <div class="calendar-header">
        <button class="nav-button" type="button" aria-label="ماه قبل" on:click={() => moveMonth(-1)}><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
        <strong aria-live="polite">{AFGHAN_MONTHS[viewMonth - 1]} {viewYear}</strong>
        <button class="nav-button" type="button" aria-label="ماه بعد" on:click={() => moveMonth(1)}><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
      </div>
      <div class="calendar-grid">
        {#each WEEKDAYS as weekday}
          <span class="weekday" aria-hidden="true">{weekday}</span>
        {/each}
        {#each cells as day}
          {#if day}
            <button
              class="day"
              class:selected={selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === day}
              type="button"
              aria-label={`${day} ${AFGHAN_MONTHS[viewMonth - 1]} ${viewYear}`}
              aria-pressed={selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === day}
              on:click={() => selectDay(day)}
            >{day}</button>
          {:else}<span aria-hidden="true"></span>{/if}
        {/each}
      </div>
      <div class="calendar-footer">
        {#if !required}<button type="button" class="footer-button muted" on:click={clearDate}>پاک کردن</button>{/if}
        <button type="button" class="footer-button" on:click={selectToday}>امروز</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .shamsi-picker { position: relative; width: 100%; }
  /* A date is an ordinary field with a calendar glyph in its leading edge:
     the same height, the same fill and the same icon slot as every other
     control, so a form's date rows line up with its text rows. The trigger
     sits in a row of fields, so its height comes from `.form-control` — the
     old `min-height` made it taller than the select beside it. */
  /* No background of its own: the trigger wears `.form-control`, so it takes
     the surface that class is given — a grey well in a toolbar, a white box in
     a dialog — instead of holding a second opinion about it. */
  .picker-trigger { position: relative; display: flex; align-items: center; min-height: 0; padding-inline: 2.6rem; color: var(--bs-body-color); text-align: start; }
  .picker-trigger > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .picker-trigger.empty { color: var(--text-placeholder, var(--text-muted, #6c757d)); }
  /* Two glyphs, two jobs: the leading one names the field, the trailing one is
     the darker “open the calendar” affordance. Both decorative — the button
     itself carries the label. */
  .picker-icon, .picker-glyph { position: absolute; inset-block-start: 50%; transform: translateY(-50%); pointer-events: none; }
  .picker-icon { inset-inline-start: .85rem; color: var(--text-muted, #6c757d); font-size: 1rem; }
  .picker-glyph { inset-inline-end: .85rem; color: var(--text-muted, #6c757d); font-size: .95rem; }
  .calendar { position: absolute; z-index: 1090; inset-block-start: calc(100% + .4rem); inset-inline-start: 0; width: min(20rem, calc(100vw - 2rem)); padding: .75rem; border: 1px solid var(--bs-border-color); border-radius: .75rem; background: var(--bs-body-bg); color: var(--bs-body-color); box-shadow: 0 .75rem 2rem rgba(0, 0, 0, .18); direction: rtl; }
  .calendar-header { display: grid; grid-template-columns: 2.75rem 1fr 2.75rem; align-items: center; text-align: center; margin-bottom: .5rem; }
  .nav-button, .day, .footer-button { border: 0; background: transparent; color: inherit; }
  .nav-button { width: 2.75rem; height: 2.75rem; border-radius: .5rem; }
  .nav-button:hover, .day:hover, .footer-button:hover { background: var(--bs-tertiary-bg); }
  .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: .15rem; }
  .weekday { display: grid; place-items: center; height: 2rem; color: var(--text-muted, #6c757d); font-size: .78rem; font-weight: 700; }
  .day { display: grid; place-items: center; aspect-ratio: 1; min-width: 2.25rem; border-radius: 50%; font-variant-numeric: tabular-nums; }
  .day.selected { background: var(--bs-primary); color: var(--bs-white); font-weight: 700; }
  .calendar-footer { display: flex; justify-content: space-between; margin-top: .5rem; padding-top: .5rem; border-top: 1px solid var(--bs-border-color); }
  .footer-button { min-height: 2.5rem; padding: 0 .75rem; border-radius: .5rem; color: var(--bs-primary); font-weight: 600; }
  .footer-button.muted { color: var(--text-muted, #6c757d); }
  @media (max-width: 420px) { .calendar { position: fixed; inset: auto 1rem 1rem; width: auto; } }
</style>
