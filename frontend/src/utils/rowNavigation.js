/** The row opens its report; native links remain available to keyboard users. */
export function rowNavigation(node, navigate) {
  const click = event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
      || event.target.closest('a,button,input,select,textarea,label,[role=button]') || window.getSelection()?.toString()) return;
    navigate();
  };
  node.addEventListener('click', click);
  return { update(callback) { navigate = callback; }, destroy() { node.removeEventListener('click', click); } };
}
