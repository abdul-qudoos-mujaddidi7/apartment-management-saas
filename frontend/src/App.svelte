<script>
  import Router from 'svelte-spa-router';
  import Home from './pages/Home.svelte';
  import Login from './pages/Login.svelte';
  import Register from './pages/Register.svelte';
  import AuthenticatedApp from './layouts/AuthenticatedApp.svelte';

  // Public pages never inherit authenticated chrome, even with a valid session.
  const routes = {
    '/': Home,
    '/login': Login,
    '/register': Register,
    '*': AuthenticatedApp,
  };
</script>

<Router {routes} />
