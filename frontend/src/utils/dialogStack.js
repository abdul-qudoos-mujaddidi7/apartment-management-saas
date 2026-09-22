/* Dialog bookkeeping shared by every <Modal>.
 *
 * A dialog can be opened from inside another dialog (the building form is
 * reachable from the lease, invoice, meter and floor forms). Each open dialog
 * registers here, innermost last, so that only the innermost one answers
 * Escape or traps Tab — otherwise one keypress would close the whole stack.
 */

const stack = [];
let counter = 0;

/** Unique suffix for the dialog's aria-labelledby / aria-describedby ids. */
export function nextDialogId() {
  counter += 1;
  return `app-dialog-${counter}`;
}

/** Registers an open dialog and returns its depth (0 for the outermost). */
export function registerDialog(id) {
  unregisterDialog(id);
  stack.push(id);
  return stack.length - 1;
}

export function unregisterDialog(id) {
  const index = stack.indexOf(id);
  if (index !== -1) stack.splice(index, 1);
}

export function isTopDialog(id) {
  return stack.length > 0 && stack[stack.length - 1] === id;
}
